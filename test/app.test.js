import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAddresses, pickLanIp } from '../src/netinfo.js';
import { buildPulsePackets } from '../src/relay.js';
import { ModSession } from '../src/session.js';

const nic = (address, internal = false) => ({ address, family: 'IPv4', internal });

test('區網 IP 偵測:略過虛擬網卡、回送、169.254,偏好 192.168', () => {
  const ifaces = {
    'vEthernet (WSL)': [nic('172.20.80.1')],
    'VMware Network Adapter VMnet8': [nic('192.168.126.1')],
    Loopback: [nic('127.0.0.1', true)],
    'Wi-Fi': [nic('192.168.0.219')],
    Ethernet: [nic('10.0.0.5'), { address: 'fe80::1', family: 'IPv6', internal: false }],
    Weird: [nic('169.254.1.2')],
  };
  const list = lanAddresses(ifaces);
  assert.equal(list[0].address, '192.168.0.219');
  assert.ok(!list.some((c) => c.address.startsWith('169.254') || c.address === '127.0.0.1'));
  assert.equal(pickLanIp(ifaces), '192.168.0.219');
  assert.equal(pickLanIp({}), null);
});

test('波形排程:攤成 time×10 影格、每秒一包', () => {
  const frames = ['0A0A0A0A00000000', '0A0A0A0A0A0A0A0A'];
  const pk = buildPulsePackets('A', `A:${JSON.stringify(frames)}`, 3);
  assert.equal(pk.length, 3);
  const all = pk.flatMap((p) => JSON.parse(p.slice('pulse-A:'.length)));
  assert.equal(all.length, 30);
  assert.ok(pk.every((p) => p.startsWith('pulse-A:')));
  // 不是波形格式 → 原樣包成 pulse-
  assert.deepEqual(buildPulsePackets('A', 'xyz', 2), ['pulse-xyz', 'pulse-xyz']);
});

function mkDev({ limit = 40, cap = 85 } = {}) {
  const calls = [];
  let capPct = cap;
  return {
    calls,
    attached: true,
    channels: ['A'],
    limitFor: () => limit,
    maxPlayLevelPct: () => Math.floor((capPct / 100) * limit + 1e-6),
    setPlayCapPercent: (p) => (capPct = p),
    setLevel: (v) => calls.push(['level', v]),
    startPulse: () => calls.push(['pulse']),
    stopAll: () => calls.push(['stop']),
    burst: async (s, ms) => calls.push(['burst', s, ms]),
  };
}
const cfg = { mapping: { playCapPercent: 85, maxRisePercentPerSecond: 15 }, events: { zeroOnPause: true, failStrength: 'max', failDurationMs: 2000 }, mod: { staleMs: 5000 } };
const mk = (over) => {
  let t = 1000;
  const dev = mkDev(over);
  const s = new ModSession(cfg, dev, () => {}, () => t);
  return { s, dev, advance: (ms) => (t += ms) };
};
const run = (s, sec) => {
  for (let i = 0; i < sec * 10; i++) s.tick(0.1);
};
const lastLevel = (dev) => dev.calls.filter((c) => c[0] === 'level').at(-1)?.[1];

test('Session:level 套天花板與上升限速,暫停歸零', () => {
  const { s, dev } = mk({ limit: 40 });
  s.onMessage({ t: 'state', s: 'start' });
  s.onMessage({ t: 'level', strength: 100 });
  run(s, 1);
  assert.ok(lastLevel(dev) <= 15.01 && lastLevel(dev) > 10); // 限速 15/秒
  run(s, 5);
  assert.equal(lastLevel(dev), 34); // 40 × 85%
  s.onMessage({ t: 'state', s: 'pause' });
  assert.equal(lastLevel(dev), 0); // 暫停立刻對裝置下 0
  run(s, 0.5);
  assert.equal(lastLevel(dev), 0); // 暫停期間維持 0
  assert.equal(dev.calls.filter((c) => c[0] === 'pulse').length, 1); // 波形只開一次
});

test('Session:mod 設定即時生效(天花板、上升速度、失敗時間)', () => {
  const { s, dev } = mk({ limit: 100 });
  s.onMessage({ t: 'cfg', playCapPercent: 50, maxRisePerSecond: 100, failDurationMs: 99999, zeroOnPause: false });
  assert.equal(s.settings.playCapPercent, 50);
  assert.equal(s.settings.failDurationMs, 10000); // 最長 10 秒
  s.onMessage({ t: 'state', s: 'start' });
  s.onMessage({ t: 'level', strength: 90 });
  run(s, 2);
  assert.equal(lastLevel(dev), 50);
  s.onMessage({ t: 'cfg', playCapPercent: 20 });
  run(s, 0.1);
  assert.equal(lastLevel(dev), 20); // 天花板降低 → 立刻往下
  s.onMessage({ t: 'cfg', playCapPercent: 'abc', maxRisePerSecond: -5 }); // 壞值被忽略
  assert.equal(s.settings.playCapPercent, 20);
});

test('Session:過關/離開歸零;失敗滿檔;斷線歸零;沒資料歸零', async () => {
  let r = mk();
  r.s.onMessage({ t: 'state', s: 'start' });
  r.s.onMessage({ t: 'level', strength: 10 });
  run(r.s, 2);
  r.s.onMessage({ t: 'state', s: 'clear' });
  assert.equal(r.dev.calls.at(-1)[0], 'stop');
  // ended 之後的 level 不再生效
  r.s.onMessage({ t: 'level', strength: 30 });
  run(r.s, 1);
  assert.equal(r.dev.calls.at(-1)[0], 'stop');

  r = mk();
  r.s.onMessage({ t: 'state', s: 'start' });
  r.s.onMessage({ t: 'state', s: 'fail' });
  assert.deepEqual(r.dev.calls.at(-1), ['burst', 'max', 2000]);

  r = mk();
  r.s.onMessage({ t: 'state', s: 'start' });
  r.s.onMessage({ t: 'level', strength: 10 });
  run(r.s, 2);
  r.s.onModDisconnected();
  assert.equal(r.dev.calls.at(-1)[0], 'stop');
  assert.equal(r.s.phase, 'idle');

  r = mk();
  r.s.onMessage({ t: 'state', s: 'start' });
  r.s.onMessage({ t: 'level', strength: 10 });
  run(r.s, 2);
  r.advance(6000); // 超過 staleMs 都沒訊息
  run(r.s, 0.1);
  assert.equal(lastLevel(r.dev), 0);
});

test('Session:緊急停止期間不輸出,失敗也不滿檔;ping 不影響狀態', () => {
  const { s, dev } = mk();
  s.onMessage({ t: 'state', s: 'start' });
  s.onMessage({ t: 'level', strength: 10 });
  run(s, 1);
  s.onMessage({ t: 'estop' });
  run(s, 1);
  assert.equal(dev.calls.at(-1)[0], 'stop');
  s.onMessage({ t: 'state', s: 'fail' });
  assert.ok(!dev.calls.some((c) => c[0] === 'burst'));
  s.onMessage({ t: 'ping' });
  assert.equal(s.phase, 'ended');
});

test('Session:手機還沒連上時不下指令', () => {
  const { s, dev } = mk();
  dev.attached = false;
  s.onMessage({ t: 'state', s: 'start' });
  s.onMessage({ t: 'level', strength: 10 });
  run(s, 2);
  assert.equal(dev.calls.length, 0);
});
