#!/usr/bin/env node
// 假 mod:不開遊戲也能測 PC 程式。模擬一關:受傷 → 強度上升 → 回血 → 結束。
// 用法: node tools/fake-mod.js [--end clear|fail|quit] [--speed 4] [--port 9977] [--peak 14]
import net from 'node:net';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const END = arg('end', 'clear');
const SPEED = Number(arg('speed', 1));
const PORT = Number(arg('port', 9977));
const PEAK = Number(arg('peak', 14));
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));

const s = net.connect(PORT, '127.0.0.1');
s.setEncoding('utf8');
const send = (o) => s.write(`${JSON.stringify(o)}\n`);
let buf = '';
s.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.t === 'status' && process.env.SHOW_STATUS) console.log(`${ts()} [mod←app] ${JSON.stringify(m)}`);
  }
});
s.on('error', (e) => {
  console.log(`連不上 PC 程式 (127.0.0.1:${PORT}): ${e.message}`);
  process.exit(1);
});

await new Promise((r) => s.once('connect', r));
console.log(`${ts()} 已連上`);
send({ t: 'hello', v: 1, game: 'fake', mod: 'fake-mod' });
send({ t: 'cfg', playCapPercent: 85, maxRisePerSecond: 15, failDurationMs: 2000, zeroOnPause: true });
await sleep(500);
send({ t: 'state', s: 'start' });

let strength = 0;
const lvl = (v) => {
  strength = v;
};
const timer = setInterval(() => send({ t: 'level', strength, loss: strength * 2 }), 100 / SPEED);

await sleep(1000);
for (let v = 1; v <= PEAK; v++) {
  lvl(v);
  await sleep(250);
}
console.log(`${ts()} 強度升到 ${PEAK}`);
await sleep(800);
send({ t: 'state', s: 'pause' });
console.log(`${ts()} 暫停`);
await sleep(600);
send({ t: 'state', s: 'resume' });
for (let v = PEAK; v >= 4; v--) {
  lvl(v);
  await sleep(200);
}
console.log(`${ts()} 回血到 4`);
await sleep(600);
if (END === 'fail') {
  lvl(PEAK + 20);
  await sleep(300);
}
send({ t: 'state', s: END });
console.log(`${ts()} 結束: ${END}`);
await new Promise((r) => setTimeout(r, END === 'fail' ? 3000 : 400 / SPEED)); // 失敗要等滿檔 2 秒播完(實際時間,不隨 speed 縮短)
clearInterval(timer);
s.end();
process.exit(0);
