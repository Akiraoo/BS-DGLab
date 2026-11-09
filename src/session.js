// mod 模式的 app 端狀態機。累計扣血、強度計算都在 mod 裡;這裡只負責「安全」與「送到裝置」:
//   天花板、上升限速、暫停/過關歸零、失敗滿檔、mod 斷線或沒資料就歸零、緊急停止。
import { rampToward } from './penalty.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class ModSession {
  constructor(cfg, dev, log = console.log, now = () => Date.now()) {
    this.dev = dev;
    this.log = log;
    this.now = now;
    this.settings = {
      playCapPercent: cfg.mapping?.playCapPercent ?? 85,
      maxRisePerSecond: cfg.mapping?.maxRisePercentPerSecond ?? 15,
      failDurationMs: cfg.events?.failDurationMs ?? 2000,
      failStrength: cfg.events?.failStrength ?? 'max',
      zeroOnPause: cfg.events?.zeroOnPause ?? true,
    };
    this.staleMs = cfg.mod?.staleMs ?? 5000;
    this.phase = 'idle'; // idle | playing | ended
    this.paused = false;
    this.emergency = false;
    this.target = 0; // mod 要的強度(未套天花板)
    this.loss = 0; // 累計扣血(只給 status 顯示)
    this.current = 0;
    this.pulseOn = false;
    this.lastMsg = 0;
    this.staleWarned = false;
    this.dev.setPlayCapPercent?.(this.settings.playCapPercent);
  }

  // ---------- 來自 mod ----------

  onMessage(m) {
    this.lastMsg = this.now();
    this.staleWarned = false;
    switch (m.t) {
      case 'hello':
        this.log(`[mod] 已連上(遊戲 ${m.game ?? '?'},mod ${m.mod ?? '?'})`);
        break;
      case 'cfg':
        this.applySettings(m);
        break;
      case 'state':
        this._onState(String(m.s));
        break;
      case 'level': {
        if (this.phase !== 'playing') break;
        const s = num(m.strength);
        if (s != null) this.target = Math.max(0, Math.min(200, s));
        const l = num(m.loss);
        if (l != null) this.loss = l;
        break;
      }
      case 'estop':
        this.emergencyStop();
        break;
      case 'resume':
        this.resume();
        break;
      default:
        break; // ping 等:只更新 lastMsg
    }
  }

  applySettings(m) {
    const s = this.settings;
    const p = num(m.playCapPercent);
    if (p != null) {
      s.playCapPercent = Math.max(0, Math.min(100, p));
      this.dev.setPlayCapPercent?.(s.playCapPercent);
    }
    const r = num(m.maxRisePerSecond);
    if (r != null && r >= 0) s.maxRisePerSecond = r;
    const f = num(m.failDurationMs);
    if (f != null) s.failDurationMs = Math.max(0, Math.min(10_000, f)); // 失敗滿檔最長 10 秒
    if (typeof m.zeroOnPause === 'boolean') s.zeroOnPause = m.zeroOnPause;
    this.log(`[mod] 設定: 天花板 ${s.playCapPercent}% | 上升 ${s.maxRisePerSecond}/秒 | 失敗滿檔 ${s.failDurationMs}ms | 暫停歸零 ${s.zeroOnPause}`);
  }

  _onState(s) {
    switch (s) {
      case 'start':
        this._start();
        break;
      case 'pause':
        if (this.phase === 'playing') {
          this.paused = true;
          this.log('[game] 暫停');
          if (this.settings.zeroOnPause) {
            this._zero();
            this.dev.setLevel(0); // 真的把裝置歸零(只改內部數值不會下指令)
          }
        }
        break;
      case 'resume':
        if (this.paused) {
          this.paused = false;
          this.log('[game] 繼續');
        }
        break;
      case 'clear':
        this._end('過關(Level clear)');
        break;
      case 'quit':
        this._end('離開關卡');
        break;
      case 'fail':
        this._fail();
        break;
      default:
        break;
    }
  }

  onModDisconnected() {
    if (this.phase === 'playing') this.log('[mod] 連線中斷,輸出歸零');
    this.phase = 'idle';
    this.target = 0;
    this._zero();
    this.dev.stopAll();
  }

  // ---------- 控制迴圈 ----------

  tick(dtSec) {
    if (this.phase !== 'playing' || this.emergency || !this.dev.attached) return;
    let target = this.target;
    if (this.paused && this.settings.zeroOnPause) target = 0;
    if (this.staleMs > 0 && this.lastMsg && this.now() - this.lastMsg > this.staleMs) {
      if (!this.staleWarned) {
        this.log(`[mod] 超過 ${this.staleMs} ms 沒收到資料,輸出歸零`);
        this.staleWarned = true;
      }
      target = 0;
    }
    target = Math.min(target, this.ceiling());
    const next = rampToward(this.current, target, dtSec, this.settings.maxRisePerSecond);
    if (next === this.current) return;
    if (next > 0 && !this.pulseOn) {
      this.dev.startPulse();
      this.pulseOn = true;
    }
    this.current = next;
    this.dev.setLevel(next);
  }

  /** 一般遊玩的強度天花板(強度數值) */
  ceiling() {
    return this.dev.maxPlayLevelPct?.() ?? 100;
  }

  status() {
    return {
      t: 'status',
      phase: this.phase,
      paused: this.paused,
      emergency: this.emergency,
      current: Math.floor(this.current + 1e-6),
      ceiling: Math.floor(this.ceiling() + 1e-6),
      limit: this.dev.limitFor?.(this.dev.channels?.[0] ?? 'A') ?? null,
      paired: Boolean(this.dev.attached),
      loss: this.loss,
    };
  }

  // ---------- 內部 ----------

  _zero() {
    this.current = 0;
    this.pulseOn = false;
  }

  _start() {
    this.phase = 'playing';
    this.paused = false;
    this.target = 0;
    this.loss = 0;
    this.lastMsg = this.now();
    this._zero();
    this.log('[game] 關卡開始');
  }

  _end(why) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.target = 0;
    this._zero();
    this.log(`[game] ${why} → 關閉輸出`);
    this.dev.stopAll();
  }

  _fail() {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.target = 0;
    this._zero();
    if (this.emergency) {
      this.log('[game] 關卡失敗,但緊急停止中,不輸出');
      return;
    }
    const { failStrength: fs, failDurationMs: ms } = this.settings;
    this.log(`[game] 關卡失敗 → 強度 ${fs === 'max' ? '最大(App 上限)' : fs} 持續 ${ms} ms`);
    Promise.resolve(this.dev.burst(fs, ms)).finally(() => this._zero());
  }

  // ---------- 手動 ----------

  emergencyStop() {
    this.emergency = true;
    this._zero();
    this.log('[!] 緊急停止:輸出歸零,按 r(或 mod 裡的解除)才會恢復');
    this.dev.stopAll();
  }

  resume() {
    if (!this.emergency) return;
    this.emergency = false;
    this.log('[!] 已解除緊急停止');
  }
}
