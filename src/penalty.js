// 扣血累計 → 威力 的純邏輯(不碰網路,方便測試)

/**
 * 追蹤「累計扣血」P(單位:血量百分點)。
 *   - 扣血:P 增加
 *   - 回血:P 減少(乘上 healFactor),最低 0
 *   - P 上限為 lossCap(由 Bridge 依輸出天花板自動設定,不在 config 裡)
 * 第一筆讀數只當作基準,所以譜面一開始是 50% 血量也不會被當成已扣血。
 * healFactor = 1 且沒有 decay 時,P 等同「目前血量距離歷史最高血量的落差」。
 */
export class PenaltyTracker {
  constructor({ healthScale = 'auto', lossCap = Infinity, healFactor = 1, decayPerSecond = 0 } = {}) {
    this.cfgScale = healthScale;
    this.lossCap = lossCap;
    this.healFactor = healFactor;
    this.decayPerSecond = decayPerSecond;
    this.reset();
  }

  reset() {
    this.scale = this.cfgScale === 'auto' ? null : Number(this.cfgScale);
    this.health = null; // 0~100
    this.P = 0;
  }

  /**
   * @param {number} raw  DataPuller 的 PlayerHealth
   * @returns {{delta:number, lossDelta:number}|null}  血量變化(百分點);第一筆或無效值回 null
   */
  update(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    if (this.scale == null) {
      // 開局血量是 50%:0~1 刻度會讀到 0.5,0~100 刻度會讀到 50。
      this.scale = raw <= 1.0001 ? 100 : 1;
    }
    const h = Math.min(100, Math.max(0, raw * this.scale));
    if (this.health == null) {
      this.health = h;
      return null;
    }
    const delta = h - this.health;
    this.health = h;
    if (Math.abs(delta) < 1e-9) return { delta: 0, lossDelta: 0 };
    if (delta < 0) this.P = Math.min(this.lossCap, this.P - delta);
    else this.P = Math.max(0, this.P - delta * this.healFactor);
    return { delta, lossDelta: delta < 0 ? -delta : 0 };
  }

  /** 隨時間衰減(可選) */
  tick(dtSec) {
    if (this.decayPerSecond > 0 && this.P > 0) {
      this.P = Math.max(0, this.P - this.decayPerSecond * dtSec);
    }
  }
}

/**
 * 累計扣血 P → 目標強度,以「總強度(App 強度上限)的百分比」表示(0~100,不取整)
 *  linear: 百分比 = coefficient × P            (累計扣 10 → 總強度的 5%)
 *  steps : [[最小扣血, 百分比], ...] 取符合的最後一階
 * 實際送給裝置的整數 = 百分比 × 上限,由 DglabController 換算:
 *   上限 40 → 5% = 2;上限 200 → 5% = 10
 */
export function levelFromLoss(P, m) {
  let pct = 0;
  if (m.mode === 'steps') {
    for (const [from, val] of m.steps) if (P >= from) pct = val;
  } else {
    pct = m.coefficient * P;
  }
  return Math.max(0, Math.min(pct, 100));
}

/** 往目標靠近:上升有速率限制,下降立刻 */
export function rampToward(current, target, dtSec, maxRisePerSecond) {
  if (target <= current) return target;
  if (!(maxRisePerSecond > 0)) return target;
  return Math.min(target, current + maxRisePerSecond * dtSec);
}

/** 只用於 log:依血量變化粗略猜是哪一種失誤(純推測) */
export function guessLoss(lossDelta, missesDelta) {
  if (missesDelta > 0) return 'Miss';
  if (Math.abs(lossDelta - 10) < 1.5) return '壞切?';
  if (Math.abs(lossDelta - 15) < 1.5) return '炸彈?';
  return '碰牆/其他?';
}
