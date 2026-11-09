// 遊戲事件 → 輸出控制 的狀態機(不碰網路,device 以介面注入,方便測試)
import { PenaltyTracker, levelFromLoss, rampToward, guessLoss } from './penalty.js';

export class Bridge {
  /**
   * @param {object} cfg  完整 config
   * @param {{setLevel:Function,startPulse:Function,stopAll:Function,burst:Function}} dev
   */
  constructor(cfg, dev, log = console.log, now = () => Date.now()) {
    this.cfg = cfg;
    this.dev = dev;
    this.log = log;
    this.now = now;
    this.m = cfg.mapping;
    this.ev = cfg.events;
    this.tracker = new PenaltyTracker({
      healthScale: this.m.healthScale,
      healFactor: this.m.healFactor,
      decayPerSecond: this.m.decayPerSecond,
    });
    this.state = 'idle'; // idle | playing | ended
    this.paused = false;
    this.emergency = false;
    this.current = 0;
    this.lastLive = 0;
    this.lastMisses = null;
    this.staleWarned = false;
    this.pulseOn = false; // 波形只在第一次需要強度時才開始送
  }

  // ---------- DataPuller 事件 ----------

  onMapData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.LevelFailed) return this._fail();
    if (m.LevelFinished) return this._end('過關(Level clear)');
    if (m.LevelQuit) return this._end('離開關卡');
    if (this.state !== 'playing') this._start();
    this._setPaused(Boolean(m.LevelPaused));
  }

  onLiveData(d) {
    if (!d || typeof d !== 'object') return;
    if (this.state === 'ended') return; // 要等下一次 MapData 開始新關卡
    if (this.state === 'idle') this._start();
    this.lastLive = this.now();
    this.staleWarned = false;

    const r = this.tracker.update(d.PlayerHealth);
    const misses = typeof d.Misses === 'number' ? d.Misses : null;
    if (r && r.lossDelta > 0 && this.cfg.log?.losses) {
      const md = misses != null && this.lastMisses != null ? misses - this.lastMisses : 0;
      this.log(
        `[game] 扣血 ${r.lossDelta.toFixed(1)}% (${guessLoss(r.lossDelta, md)}) → 累計扣血 ${this.tracker.P.toFixed(1)}%`,
      );
    }
    if (misses != null) this.lastMisses = misses;
  }

  onDataPullerLost() {
    if (this.state === 'playing') {
      this.log('[game] DataPuller 連線中斷,輸出歸零');
      this.current = 0;
      this.pulseOn = false;
      this.dev.stopAll();
      this.state = 'idle';
    }
  }

  // ---------- 控制迴圈 ----------

  tick(dtSec) {
    this.tracker.tick(dtSec);
    if (this.state !== 'playing' || this.emergency) return;

    // 累計扣血 P 的上限由「輸出天花板」推算:P 超過天花板對應的量沒有意義,只會讓回血等很久
    if (typeof this.dev.maxPlayLevelPct === 'function') {
      const maxPct = this.dev.maxPlayLevelPct();
      if (this.m.mode === 'steps') this.tracker.lossCap = Math.max(0, ...this.m.steps.map((s) => s[0]));
      else if (this.m.coefficient > 0) this.tracker.lossCap = maxPct / this.m.coefficient;
      this.tracker.P = Math.min(this.tracker.P, this.tracker.lossCap);
    }
    let target = levelFromLoss(this.tracker.P, this.m);  // 總強度的百分比
    if (this.paused && this.ev.zeroOnPause) target = 0;

    const staleMs = this.cfg.dataPuller?.staleMs ?? 0;
    if (staleMs > 0 && this.lastLive && this.now() - this.lastLive > staleMs) {
      if (!this.staleWarned) {
        this.log(`[game] 超過 ${staleMs} ms 沒收到資料,輸出歸零`);
        this.staleWarned = true;
      }
      target = 0;
    }

    const next = rampToward(this.current, target, dtSec, this.m.maxRisePercentPerSecond);
    if (next !== this.current) {
      if (next > 0 && !this.pulseOn) {
        this.dev.startPulse();
        this.pulseOn = true;
      }
      this.current = next;
      this.dev.setLevel(next);
    }
  }

  // ---------- 內部 ----------

  _start() {
    this.tracker.reset();
    this.state = 'playing';
    this.paused = false;
    this.current = 0;
    this.lastMisses = null;
    this.lastLive = 0;
    this.pulseOn = false;
    this.log('[game] 關卡開始');
  }

  _setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    this.log(p ? '[game] 暫停' : '[game] 繼續');
    if (p && this.ev.zeroOnPause) {
      this.current = 0;
      this.dev.setLevel(0);
    }
  }

  _end(why) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.current = 0;
    this.log(`[game] ${why} → 關閉輸出`);
    this.pulseOn = false;
    this.dev.stopAll();
  }

  _fail() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.current = 0;
    this.pulseOn = false;
    if (this.emergency) {
      this.log('[game] 關卡失敗,但緊急停止中,不輸出');
      return;
    }
    this.log(`[game] 關卡失敗 → 強度 ${this.ev.failStrength === 'max' ? '最大(App 上限)' : this.ev.failStrength} 持續 ${this.ev.failDurationMs} ms`);
    Promise.resolve(this.dev.burst(this.ev.failStrength, this.ev.failDurationMs)).finally(() => {
      this.current = 0;
      this.pulseOn = false;
    });
  }

  // ---------- 手動控制 ----------

  emergencyStop() {
    this.emergency = true;
    this.current = 0;
    this.pulseOn = false;
    this.log('[!] 緊急停止:輸出歸零,按 r 才會恢復');
    this.dev.stopAll();
  }

  resume() {
    if (!this.emergency) return;
    this.emergency = false;
    this.log('[!] 已解除緊急停止');
  }
}
