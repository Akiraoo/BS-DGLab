#!/usr/bin/env node
// 假的 DataPuller:不開遊戲也能測試整條流程(連線、強度曲線、過關/失敗)
//
//   node tools/fake-datapuller.js [--end clear|fail|quit] [--speed 1] [--port 2946] [--scale100]
//
// 劇情:開局 50% → 回血 → 壞切(-10) → 漏掉(-15) → 回血 → 暫停/繼續 → 結束
import { WebSocketServer } from 'ws';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const END = arg('end', 'clear');
const SPEED = Number(arg('speed', '1'));
const PORT = Number(arg('port', '2946'));
const SCALE = process.argv.includes('--scale100') ? 100 : 1;

const wss = new WebSocketServer({ port: PORT });
const clients = { MapData: new Set(), LiveData: new Set() };
let started = false;

const mapData = (over = {}) => ({
  LevelPaused: false,
  LevelFinished: false,
  LevelFailed: false,
  LevelQuit: false,
  SongName: 'Fake Song',
  Duration: 120,
  ...over,
});
let health = 0.5;
let misses = 0;
const liveData = (trigger) => ({
  PlayerHealth: health * SCALE,
  Misses: misses,
  EventTrigger: trigger,
  UnixTimestamp: Date.now(),
});
const send = (kind, obj) => {
  const s = JSON.stringify(obj);
  for (const ws of clients[kind]) if (ws.readyState === 1) ws.send(s);
};

wss.on('connection', (ws, req) => {
  const kind = req.url?.endsWith('/MapData') ? 'MapData' : 'LiveData';
  clients[kind].add(ws);
  ws.on('close', () => clients[kind].delete(ws));
  console.log(`[fake] ${kind} 連線 (${clients.MapData.size}/${clients.LiveData.size})`);
  if (!started && clients.MapData.size && clients.LiveData.size) {
    started = true;
    setTimeout(play, 800 / SPEED);
  }
});

const wait = (s) => new Promise((r) => setTimeout(r, (s * 1000) / SPEED));
const setHealth = (pct, trigger = 'EnergyChange') => {
  health = Math.max(0, Math.min(1, pct / 100));
  send('LiveData', liveData(trigger));
  console.log(`[fake] 血量 ${(health * 100).toFixed(0)}% (${trigger})`);
};

async function play() {
  console.log('[fake] 關卡開始');
  send('MapData', mapData());
  await wait(0.3);
  setHealth(50);
  await wait(0.7);
  for (let i = 1; i <= 3; i++) {
    setHealth(50 + i);
    await wait(0.2);
  }
  await wait(0.8);
  console.log('[fake] 壞切 -10');
  setHealth(43);
  await wait(1.5);
  console.log('[fake] 漏掉 -15');
  misses += 1;
  setHealth(28, 'NoteMissed');
  await wait(1.5);
  console.log('[fake] 連續好切回血 +1% × 8');
  for (let i = 1; i <= 8; i++) {
    setHealth(28 + i);
    await wait(0.2);
  }
  await wait(0.8);
  console.log('[fake] 暫停');
  send('MapData', mapData({ LevelPaused: true }));
  await wait(1.0);
  console.log('[fake] 繼續');
  send('MapData', mapData({ LevelPaused: false }));
  await wait(1.2);
  if (END === 'fail') {
    console.log('[fake] 血量歸零 → 關卡失敗');
    setHealth(0);
    send('MapData', mapData({ LevelFailed: true }));
  } else if (END === 'quit') {
    send('MapData', mapData({ LevelQuit: true }));
  } else {
    console.log('[fake] 過關');
    send('MapData', mapData({ LevelFinished: true }));
  }
  await wait(3.5);
  console.log('[fake] 劇情結束');
  if (process.env.FAKE_EXIT !== '0') process.exit(0);
}

console.log(`[fake] DataPuller 模擬器啟動 ws://127.0.0.1:${PORT}/BSDataPuller/{MapData,LiveData}  結局=${END} 速度=${SPEED}x`);
