// 波形:內建(dglab-kit 的郊狼波形)或自訂(waveforms/<名稱>.json)
//
// 郊狼的波形是一串「影格」,每個影格 100ms,由 16 個十六進位字元組成:
//   前 4 個位元組 = 這 100ms 內每 25ms 的頻率值(10~240)
//   後 4 個位元組 = 這 100ms 內每 25ms 的強度(0~100,相對於目前通道強度的百分比)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COYOTE_WAVEFORMS, COYOTE_WAVEFORM } from 'dglab-kit';
import { msToFreqValue, pulseToFrames } from './pulse.js';

export { msToFreqValue };

export const WAVEFORM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'waveforms');
const MAX_FRAMES = 300; // 最長 30 秒一輪

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex = (v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase();

/** 頻率(Hz,1~100)→ 郊狼的頻率值(10~240)。先換成脈衝間隔(ms),再用官方的壓縮公式 */
export function freqValue(hz) {
  return msToFreqValue(1000 / clamp(hz, 1, 100));
}

/**
 * 把自訂波形(JSON 物件)轉成影格陣列。
 * frames 的每一項是一個 100ms 影格,可以寫成:
 *   50                      → 這 100ms 強度都是 50
 *   [0, 30, 60, 100]        → 每 25ms 一個強度
 *   { "strength": 50, "freq": 20 }           → 另外指定這個影格的頻率(Hz)
 *   { "strength": [0, 30, 60, 100], "freq": [10, 20, 40, 80] }
 */
export function encodeWaveform(def) {
  if (!def || !Array.isArray(def.frames) || def.frames.length === 0) throw new Error('波形檔需要非空的 frames 陣列');
  if (def.frames.length > MAX_FRAMES) throw new Error(`frames 最多 ${MAX_FRAMES} 個(30 秒)`);
  const baseFreq = Number.isFinite(def.freq) ? def.freq : 22;
  const four = (v, what, i) => {
    const arr = Array.isArray(v) ? v : [v, v, v, v];
    if (arr.length !== 4 || arr.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
      throw new Error(`frames[${i}] 的 ${what} 要是一個數字或 4 個數字`);
    }
    return arr;
  };
  return def.frames.map((f, i) => {
    const obj = f !== null && typeof f === 'object' && !Array.isArray(f) ? f : { strength: f };
    const strength = four(obj.strength, 'strength', i).map((x) => clamp(x, 0, 100));
    const freq = four(obj.freq ?? baseFreq, 'freq', i).map(freqValue);
    return freq.map(hex).join('') + strength.map(hex).join('');
  });
}

// ---------- 從 mod 傳來的 .pulse(郊狼 App 導出的波形) ----------
// mod 讀 Beat Saber\UserData\BSDglab\Waveforms\*.pulse,把檔名與內容傳過來;代號是 "pulse:<檔名>"

const pulses = new Map(); // 小寫名稱 → { name, raw }
export const PULSE_KEY_PREFIX = 'pulse:';
export const isPulseKey = (key) => String(key ?? '').toLowerCase().startsWith(PULSE_KEY_PREFIX);
export const pulseName = (key) => String(key).slice(PULSE_KEY_PREFIX.length);

/** 登記一個導入的波形(解析失敗會丟出錯誤)。回傳 { raw, truncated } */
export function registerPulse(name, text) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('波形名稱是空的');
  const res = pulseToFrames(text);
  pulses.set(n.toLowerCase(), { name: n, raw: res.raw });
  return res;
}

/** 列出 waveforms/ 裡的自訂波形名稱 */
export function listCustomWaveforms(dir = WAVEFORM_DIR) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

/**
 * 依名稱載入波形:先找 waveforms/<名稱>.json(自訂),再找內建。
 * @returns {{ raw: string[], name: string, custom: boolean }}
 */
export function loadWaveform(name = 'BUBBLE', dir = WAVEFORM_DIR) {
  const key = String(name);
  if (isPulseKey(key)) {
    const p = pulses.get(pulseName(key).toLowerCase());
    if (!p) throw new Error(`找不到導入的波形「${pulseName(key)}」(mod 還沒把它傳過來)`);
    return { raw: p.raw, name: p.name, custom: true };
  }
  const file = listCustomWaveforms(dir).find((n) => n.toLowerCase() === key.toLowerCase());
  if (file) {
    let def;
    try {
      def = JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8'));
    } catch (e) {
      throw new Error(`波形檔 waveforms/${file}.json 不是合法的 JSON:${e.message}`);
    }
    try {
      return { raw: encodeWaveform(def), name: typeof def.name === 'string' && def.name ? def.name : file, custom: true };
    } catch (e) {
      throw new Error(`波形檔 waveforms/${file}.json 有誤:${e.message}`);
    }
  }
  const builtin = COYOTE_WAVEFORMS[COYOTE_WAVEFORM[key.toUpperCase()]];
  if (builtin?.raw?.length) return { raw: builtin.raw, name: builtin.label?.en ?? key, custom: false };
  const custom = listCustomWaveforms(dir);
  throw new Error(
    `找不到波形「${key}」。內建:${Object.keys(COYOTE_WAVEFORM).filter((k) => Number.isNaN(Number(k))).join(', ')}` +
      (custom.length ? `;自訂:${custom.join(', ')}` : ';自訂波形請放在 waveforms/<名稱>.json'),
  );
}
