// 郊狼 App(3.4.4 起)導出的 .pulse 波形檔:純文字,開頭是 "Dungeonlab+pulse:"
//
//   Dungeonlab+pulse:<休息>,<速度>,<未知>=<小節>+section+<小節>+section+...
//   小節 = <頻率A>,<頻率B>,<小節時長>,<頻率模式>,<開關>/<強度>-<類型>,<強度>-<類型>,...
//
// 欄位意義與兩張對照表依社區整理的資料(coyote-claw 的 .pulse 說明頁,原出處 DG-BBS),
// 不是官方規格。以下幾點文件沒寫清楚,是這裡自己的決定,尚未和 App 實際輸出比對:
//   - 小節長度不是脈衝元的整數倍時,最後一個脈衝元完整播完(無條件進位)
//   - 頻率漸變用「週期(ms)」做線性內插,再換成 V3 頻率值
//   - 速度 2x / 4x:每根竖条從 100ms 變成 50 / 25ms;休息時間不受速度影響
//   - 每根竖条 100ms 內強度固定,不在 25ms 之間內插

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PULSE_PREFIX = 'Dungeonlab+pulse:';

/** 頻率索引(0~83)→ 脈衝週期(ms)。10ms = 100Hz */
export const PULSE_FREQ_MS = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50, 52, 54, 56, 58, 60, 62, 64, 66, 68,
  70, 72, 74, 76, 78,
  80, 85, 90, 95,
  100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
  200, 233, 266, 300, 333, 366,
  400, 450, 500, 550,
  600, 700, 800, 900, 1000,
];

/** 小節時長索引(0~99)→ 秒 */
export const PULSE_DURATION_S = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
  1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0,
  3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0,
  4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9,
  5, 5.2, 5.4, 5.6, 5.8, 6, 6.2, 6.4, 6.6, 6.8,
  7, 7.2, 7.4, 7.6, 7.8,
  8, 8.5, 9, 9.5,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 23.4, 26.6, 30, 33.4, 36.6,
  40, 45, 50, 55,
  60, 70, 80, 90,
  100, 120, 140, 160, 180,
  200, 250, 300,
];

/** 脈衝週期(ms,10~1000)→ 郊狼 V3 的頻率值(10~240)(V3 協定的壓縮公式) */
export function msToFreqValue(period) {
  const ms = clamp(period, 10, 1000);
  if (ms <= 100) return Math.round(ms);
  if (ms <= 600) return Math.round((ms - 100) / 5 + 100);
  return Math.round((ms - 600) / 10 + 200);
}

const MAX_FRAMES = 600; // 一輪最多 60 秒(更長的會截斷)

const hex = (v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase();
const int = (s, what) => {
  const n = Number(String(s).trim());
  if (!Number.isFinite(n)) throw new Error(`${what} 不是數字:「${s}」`);
  return Math.round(n);
};
const pick = (table, i, what) => {
  if (i < 0 || i >= table.length) throw new Error(`${what} 索引 ${i} 超出範圍(0~${table.length - 1})`);
  return table[i];
};

/**
 * 解析 .pulse 文字。
 * @returns {{ rest: number, speed: number, sections: Array<{freqA:number, freqB:number, seconds:number, mode:number, enabled:boolean, points:number[]}> }}
 */
export function parsePulse(text) {
  const s = String(text ?? '').replace(/^﻿/, '').trim();
  if (!s.startsWith(PULSE_PREFIX)) throw new Error(`不是郊狼 App 導出的波形(開頭應為 ${PULSE_PREFIX})`);
  const body = s.slice(PULSE_PREFIX.length);
  const eq = body.indexOf('=');
  if (eq < 0) throw new Error('缺少「=」');
  const head = body.slice(0, eq).split(',');
  const rest = clamp(int(head[0] ?? 0, '休息時長'), 0, 1000) / 10;
  let speed = int(head[1] ?? 1, '速度');
  if (![1, 2, 4].includes(speed)) speed = 1;

  const sections = body
    .slice(eq + 1)
    .split('+section+')
    .slice(0, 10)
    .map((sec, k) => {
      const slash = sec.indexOf('/');
      if (slash < 0) throw new Error(`第 ${k + 1} 小節缺少「/」`);
      const f = sec.slice(0, slash).split(',');
      if (f.length < 5) throw new Error(`第 ${k + 1} 小節的參數不足 5 個`);
      const points = sec
        .slice(slash + 1)
        .split(',')
        .filter((p) => p.trim() !== '')
        .map((p) => {
          const v = Number(p.split('-')[0]);
          if (!Number.isFinite(v)) throw new Error(`第 ${k + 1} 小節的強度「${p}」不是數字`);
          return clamp(v, 0, 100);
        });
      if (points.length === 0) throw new Error(`第 ${k + 1} 小節沒有強度資料`);
      return {
        freqA: pick(PULSE_FREQ_MS, int(f[0], '頻率A'), `第 ${k + 1} 小節頻率A`),
        freqB: pick(PULSE_FREQ_MS, int(f[1], '頻率B'), `第 ${k + 1} 小節頻率B`),
        seconds: pick(PULSE_DURATION_S, int(f[2], '小節時長'), `第 ${k + 1} 小節時長`),
        mode: int(f[3], '頻率模式'),
        enabled: int(f[4], '小節開關') !== 0,
        points,
      };
    });
  return { rest, speed, sections };
}

/**
 * .pulse 文字 → 郊狼 V3 影格(每個 100ms,16 個十六進位字元)。
 * @returns {{ raw: string[], truncated: boolean }}
 */
export function pulseToFrames(text) {
  const { rest, speed, sections } = parsePulse(text);
  const sub = []; // 25ms 子影格:[週期ms, 強度]
  const per = 4 / speed; // 每根竖条佔幾個 25ms
  for (const sec of sections) {
    if (!sec.enabled) continue;
    const n = sec.points.length;
    const bars = Math.max(1, Math.round(sec.seconds * 10));
    const cycles = Math.max(1, Math.ceil(bars / n));
    const total = cycles * n;
    for (let c = 0; c < cycles; c++) {
      for (let i = 0; i < n; i++) {
        let t; // 0~1:頻率從 A 走到 B 的進度
        switch (sec.mode) {
          case 2: t = total > 1 ? (c * n + i) / (total - 1) : 0; break; // 節內漸變
          case 3: t = n > 1 ? i / (n - 1) : 0; break; // 元內漸變
          case 4: t = cycles > 1 ? c / (cycles - 1) : 0; break; // 元間漸變
          default: t = 0; // 固定
        }
        const ms = sec.freqA + (sec.freqB - sec.freqA) * t;
        for (let k = 0; k < per; k++) sub.push([ms, sec.points[i]]);
      }
    }
  }
  if (sub.length === 0) throw new Error('所有小節都是關閉的');
  // 休息:強度 0(不受速度影響)
  const lastMs = sub[sub.length - 1][0];
  for (let k = 0; k < Math.round(rest * 40); k++) sub.push([lastMs, 0]);
  while (sub.length % 4) sub.push([lastMs, 0]);

  const raw = [];
  for (let i = 0; i < sub.length && raw.length < MAX_FRAMES; i += 4) {
    const q = sub.slice(i, i + 4);
    raw.push(q.map(([ms]) => hex(msToFreqValue(ms))).join('') + q.map(([, v]) => hex(v)).join(''));
  }
  return { raw, truncated: sub.length / 4 > MAX_FRAMES };
}
