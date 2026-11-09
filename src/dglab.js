// DG-LAB 控制端封裝:同一組介面支援 V3(郊狼 3.0)與 V4(DG-LAB 4 App)
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import {
  DglabSocket,
  DGLAB_SOCKET_VERSION,
  V3Channel,
  V4Channel,
  COYOTE_WAVEFORMS,
  COYOTE_WAVEFORM,
} from 'dglab-kit';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function repeatFrames(frames, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(frames[i % frames.length]);
  return out;
}

export class DglabController extends EventEmitter {
  /**
   * @param {object} cfg  config.dglab
   * @param {(msg:string)=>void} log
   */
  constructor(cfg, log = console.log, opts = {}) {
    super();
    this.cfg = cfg;
    this.log = log;
    // maxStrength: 'auto' = 以 App 回報的強度上限為「總強度」;數字 = 固定用這個數字(V4 無法自動取得時使用)
    // absolute=true:level 直接當強度數值用(level 5 = 強度 5),不乘上 App 上限;仍會夾在上限內
    // playCapPercent:一般遊玩時最高輸出 = App 上限的百分之幾(兩種模式都是百分比;失敗滿檔不受此限)
    this.opts = { maxStrength: 'auto', fallbackLimit: 40, absolute: false, playCapPercent: 100, ...opts };
    this.limits = {}; // App 回報的強度上限 { A, B }(V3)
    this.levelPct = 0; // 目前要求的強度 = 上限的百分之幾
    this.bursting = false;
    this.zeroTimers = [];
    this.isV3 = String(cfg.version).toLowerCase() === 'v3';
    this.channels = (cfg.channels?.length ? cfg.channels : ['A']).map((c) => String(c).toUpperCase());
    this.current = Object.fromEntries(this.channels.map((c) => [c, 0]));
    this.clientId = null; // V4:已連上的 App
    this.slotId = cfg.slotId ?? null; // V4:設備插槽
    this.attached = false;
    this.pulseTimer = null;

    const raw = COYOTE_WAVEFORMS[COYOTE_WAVEFORM[cfg.waveform ?? 'BUBBLE']]?.raw;
    if (!raw?.length) throw new Error(`找不到波形 ${cfg.waveform},請改 config.dglab.waveform`);
    this.waveformRaw = raw;
  }

  async connect() {
    this.socket = this.isV3
      ? new DglabSocket({ version: DGLAB_SOCKET_VERSION.V3, url: this.cfg.serverUrl })
      : new DglabSocket({ url: this.cfg.serverUrl });

    this.socket.on('error', (e) => this.log(`[dglab] 錯誤: ${(e?.message ?? e) || '(無訊息,多半是連不上中繼伺服器)'}`));
    if (this.cfg.debug) {
      // 除錯:印出所有收到的協議訊息,用來判斷 App 有沒有真的連到
      this.socket.on('frame', (f) => this.log(`[dglab][收] ${JSON.stringify(f).slice(0, 300)}`));
      this.socket.on('open', () => this.log('[dglab][除錯] 已連上中繼伺服器'));
    }
    this.socket.on('close', (e) => {
      this.attached = false;
      this.log(`[dglab] 連線關閉 (code ${e?.code})`);
      this.emit('lost');
    });
    this.socket.on('client-attached', (clientId) => {
      this.clientId = clientId;
      this.attached = true;
      this.log(`[dglab] App 已連上 (${clientId})`);
      this.emit('attached', clientId);
    });
    this.socket.on('client-disconnected', () => {
      this.attached = false;
      this.log('[dglab] App 已斷線');
      this.emit('lost');
    });
    this.socket.on('device', (d) => {
      const sl = d?.props?.softLimit;
      if (this.isV3 && sl) {
        for (const ch of ['A', 'B']) if (typeof sl[ch] === 'number') this.limits[ch] = sl[ch];
        this.log(`[dglab] App 強度上限: A=${this.limits.A ?? '?'} B=${this.limits.B ?? '?'}`);
        this._applyLevel(); // 上限被改了就按新上限重新換算
      }
      if (this.cfg.debug && d?.props?.strength) this.log(`[dglab][App 回報目前強度] ${JSON.stringify(d.props.strength)}`);
    });
    if (!this.isV3) {
      this.socket.on('devices', (devices) => this._pickSlot(devices));
      this.socket.on('device', (d) => {
        if (!this.slotId && d?.slotId && !d.removed) this.slotId = d.slotId;
      });
    }

    const { targetId } = await this.socket.connect();
    this.targetId = targetId;
    this._printQr(targetId);
    return targetId;
  }

  _printQr(targetId) {
    const base = String(this.cfg.appServerUrl ?? this.cfg.serverUrl).replace(/\/+$/, '');
    let wsUrl;
    let link;
    // qrEncode=false:不對 ws 位址做 URL 編碼(部分 App 版本只吃未編碼的格式,可自行切換試試)
    const enc = this.cfg.qrEncode === false ? (s) => s : encodeURIComponent;
    if (this.isV3) {
      wsUrl = `${base}/${targetId}`;
      link = `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${enc(wsUrl)}`;
    } else {
      wsUrl = `${base}${base.includes('?') ? '&' : '?'}tid=${targetId}`;
      link = `https://dungeon-lab.cn/s/?v=1&action=socket&url=${enc(wsUrl)}`;
    }
    this.log(`[dglab] 協議版本: ${this.isV3 ? 'V3(郊狼 3.0 SOCKET)' : 'V4(DG-LAB 4 App)'}`);
    this.log(`[dglab] App 要連的位址: ${wsUrl}`);
    this.log(`[dglab] QR 內容(也可貼到其他 QR 產生器): ${link}`);
    this.log('[dglab] 請用 DG-LAB App 內「SOCKET 控制」的掃描功能掃 QR code(不要用手機相機)');
    qrcode.generate(link, { small: true });
    this.qrLink = link;
    this._writeQrPng(link);
  }

  // 另外存成 qr.png 並開啟,比終端機的方塊字元好掃
  _writeQrPng(link) {
    const file = fileURLToPath(new URL('../qr.png', import.meta.url));
    QRCode.toFile(file, link, { width: 480, margin: 2 })
      .then(() => {
        this.log(`[dglab] 已產生 QR 圖檔: ${file}`);
        if (this.cfg.openQrImage === false) return;
        const [cmd, args] =
          process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '', file]]
            : process.platform === 'darwin'
              ? ['open', [file]]
              : ['xdg-open', [file]];
        try {
          const p = spawn(cmd, args, { detached: true, stdio: 'ignore' });
          p.on('error', () => {});
          p.unref();
        } catch {
          /* 開不了就算了,圖檔還在 */
        }
      })
      .catch((e) => this.log(`[dglab] 產生 QR 圖檔失敗: ${e?.message ?? e}`));
  }

  /** 等 App 連上(V4 另外等到拿到設備 slotId) */
  async waitAttached(timeoutMs = 0) {
    if (!this.attached) {
      let waited = 0;
      const hint = setInterval(() => {
        waited += 30;
        this.log(
          `[dglab] 已等待 ${waited} 秒,App 還沒連上。檢查:` +
            '\n  1) config 的 dglab.version 是否和 App 對應(郊狼 3.0 App=v3;DG-LAB 4 App=v4)' +
            '\n  2) 中繼伺服器視窗在掃碼時有沒有出現新連線(沒有 = App 根本沒送出連線)' +
            '\n  3) 是否在 App 的「SOCKET 控制」內掃碼;QR 掃不出來請改掃 qr.png' +
            '\n  4) 可在 config.dglab 加 "debug": true 看詳細訊息,或加 "qrEncode": false 換一種 QR 格式',
        );
      }, 30000);
      try {
        await new Promise((resolve, reject) => {
          const t = timeoutMs ? setTimeout(() => reject(new Error('等待 App 連線逾時')), timeoutMs) : null;
          this.once('attached', () => {
            if (t) clearTimeout(t);
            resolve();
          });
        });
      } finally {
        clearInterval(hint);
      }
    }
    if (!this.isV3 && !this.slotId) {
      for (let i = 0; i < 30 && !this.slotId; i++) await sleep(100);
      if (!this.slotId) {
        try {
          const r = await this.socket.requestDevices(this.clientId);
          this._pickSlot(r?.devices);
        } catch (e) {
          this.log(`[dglab] 取得設備列表失敗: ${e?.message ?? e}`);
        }
      }
      if (!this.slotId) throw new Error('V4:App 回報沒有可用設備(slot)。請確認 App 已連上郊狼,或在 config.dglab.slotId 指定。');
      this.log(`[dglab] 使用設備 slot: ${this.slotId}`);
    }
  }

  _pickSlot(devices) {
    if (this.slotId || !Array.isArray(devices) || !devices.length) return;
    const dev = devices.find((d) => String(d.type).startsWith('COYOTE')) ?? devices[0];
    if (dev?.slotId) this.slotId = dev.slotId;
  }

  // quiet:波形類操作被新波形取代/清除時 V4 App 會讓舊請求以錯誤結束,屬正常現象,不需要印出來
  _safe(promiseLike, what, quiet = false) {
    if (promiseLike && typeof promiseLike.catch === 'function') {
      promiseLike.catch((e) => {
        if (!quiet && !this.closing) this.log(`[dglab] ${what} 失敗: ${e?.message ?? e}`);
      });
    }
  }

  /** 該通道的強度上限:App 回報的上限;可用數字的 maxStrength 再壓低;都沒有時用保守的 fallbackLimit */
  limitFor(ch) {
    const reported = this.limits[ch];
    const fixed = typeof this.opts.maxStrength === 'number' ? this.opts.maxStrength : null;
    if (fixed != null && reported != null) return Math.min(fixed, reported);
    return fixed ?? reported ?? this.opts.fallbackLimit;
  }

  /**
   * 設定所有通道的強度等級(0~100)。
   *  - 等比例模式(預設):等級 = 上限的百分比。上限 40 的 5% = 2,上限 200 的 5% = 10
   *  - 絕對模式(absolute):等級就是強度數值。5 = 強度 5,不管上限多少(仍不會超過上限)
   */
  setLevel(pct) {
    this.levelPct = Math.max(0, Math.min(100, pct));
    this._applyLevel();
  }

  _applyLevel() {
    if (!this.attached || this.bursting) return;
    for (const ch of this.channels) {
      const base = this.opts.absolute ? 100 : this.limitFor(ch);
      const raw = (this.levelPct / 100) * base;
      // 絕對模式:無條件捨去,剛好每累計扣 2% 血(coefficient 0.5)才 +1 強度;加一點點誤差容忍避免浮點數少 1
      const want = this.opts.absolute ? Math.floor(raw + 1e-6) : Math.round(raw);
      this._setChannel(ch, Math.min(want, this._ceiling(ch)));
    }
  }

  /** 執行中調整天花板(mod 設定頁改了之後會呼叫) */
  setPlayCapPercent(p) {
    if (!Number.isFinite(p)) return;
    this.opts.playCapPercent = Math.max(0, Math.min(100, p));
    this._applyLevel();
  }

  /** 一般遊玩的天花板(強度數值) */
  _ceiling(ch) {
    return Math.floor((this.opts.playCapPercent / 100) * this.limitFor(ch) + 1e-6);
  }

  /** 輸出剛好碰到天花板時的 level(0~100)。Bridge 用它推算累計扣血 P 的上限,不必另設 lossCap */
  maxPlayLevelPct() {
    let m = 100;
    for (const ch of this.channels) {
      const base = this.opts.absolute ? 100 : this.limitFor(ch);
      if (base > 0) m = Math.min(m, (this._ceiling(ch) / base) * 100);
    }
    return m;
  }

  /** 設定單一通道到絕對強度;不會超過該通道上限(超過上限的指令 App 會直接忽略) */
  _setChannel(ch, value, force = false) {
    if (!this.attached) return;
    // 一律夾在上限內(超過上限的指令 App 會直接忽略,會造成「強度卡在原值」)
    const v = Math.max(0, Math.min(200, this.limitFor(ch), Math.round(value)));
    const prev = this.current[ch];
    if (v === prev && !force) return;
    if (this.isV3) {
      this.socket.setStrength(V3Channel[ch], v);
    } else {
      const c = V4Channel[ch];
      const opt = { immediate: true };
      if (v === 0) this._safe(this.socket.resetIntensity(this.clientId, this.slotId, c, opt), 'resetIntensity');
      else if (v > prev) this._safe(this.socket.addIntensity(this.clientId, this.slotId, c, v - prev, opt), 'addIntensity');
      else if (v < prev) this._safe(this.socket.reduceStrength(this.clientId, this.slotId, c, prev - v, opt), 'reduceStrength');
    }
    this.current[ch] = v;
  }

  _setAllZero() {
    for (const ch of this.channels) this._setChannel(ch, 0, true);
  }

  _sendPulseOnce() {
    if (!this.attached) return;
    const sec = (this.cfg.pulseRefreshSec ?? 20) + 5;
    for (const ch of this.channels) {
      if (this.isV3) {
        this.socket.sendPulse({ channel: ch, time: sec, data: this.waveformRaw });
      } else {
        const frames = repeatFrames(this.waveformRaw, sec * 10);
        this._safe(
          this.socket.sendPulse(this.clientId, this.slotId, V4Channel[ch], sec * 1000, frames, { immediate: true }),
          'sendPulse',
          true,
        );
      }
    }
  }

  /** 開始持續送波形(強度為 0 時對身體沒有輸出) */
  startPulse() {
    if (this.pulseTimer) return;
    this._sendPulseOnce();
    this.pulseTimer = setInterval(() => this._sendPulseOnce(), (this.cfg.pulseRefreshSec ?? 20) * 1000);
  }

  stopPulse() {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (!this.attached) return;
    for (const ch of this.channels) {
      if (this.isV3) this.socket.clearPulse(V3Channel[ch]);
      else this._safe(this.socket.clearPulse(this.clientId, this.slotId, V4Channel[ch]), 'clearPulse', true);
    }
  }

  /** 全部歸零並清掉波形(歸零指令會再補送兩次,避免封包遺失) */
  stopAll() {
    this.levelPct = 0;
    this._setAllZero();
    this.stopPulse();
    for (const t of this.zeroTimers) clearTimeout(t);
    this.zeroTimers = [400, 1500].map((ms) =>
      setTimeout(() => {
        if (!this.closing && !this.bursting && this.levelPct === 0 && this.attached) this._setAllZero();
      }, ms),
    );
  }

  /**
   * 以「最大」或指定強度輸出一段時間,結束後全部關閉。
   * strength: 'max' = 各通道的 App 強度上限;數字 = 該數值(同樣不會超過上限,超過 App 會忽略)
   */
  async burst(strength, ms) {
    if (!this.attached) return;
    this.bursting = true;
    this.levelPct = 0;
    this.startPulse();
    const used = [];
    for (const ch of this.channels) {
      const v = strength === 'max' ? this.limitFor(ch) : Math.min(Number(strength), this.limitFor(ch));
      this._setChannel(ch, v, true);
      used.push(`${ch}=${this.current[ch]}`);
    }
    this.log(`[dglab] 失敗輸出 ${used.join(' ')},持續 ${ms} ms`);
    await sleep(ms);
    this.bursting = false;
    this.stopAll();
  }

  close() {
    try {
      this.stopAll();
      this.closing = true;
      for (const t of this.zeroTimers) clearTimeout(t);
    } catch {
      /* ignore */
    }
    setTimeout(() => this.socket?.destroy?.(), 150);
  }
}
