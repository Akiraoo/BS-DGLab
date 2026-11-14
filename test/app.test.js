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

test('status:帶通道與波形資訊給疊層', async () => {
  const { waveShape } = await import('../src/dglab.js');
  assert.deepEqual(waveShape(['2D2D2D2D00000000', '2D2D2D2D64646464', '0A0A0A0A00326464', 'bad']), [0, 100, 63]);
  const dev = {
    attached: true,
    channels: ['A', 'B'],
    limitFor: () => 40,
    setLevel() {},
    stopPulse() {},
    startPulse() {},
    setPlayCapPercent() {},
    channelInfo: () => [
      { ch: 'A', cur: 12, ceil: 34, lim: 40 },
      { ch: 'B', cur: 0, ceil: 17, lim: 20 },
    ],
    waveName: 'Bubble',
    waveShape: [0, 100],
  };
  const s = new ModSession(cfg, dev, () => {}, () => 1000);
  const st = s.status();
  assert.equal(st.chans, 'A,B');
  assert.equal(st.curA, 12);
  assert.equal(st.ceilB, 17);
  assert.equal(st.limB, 20);
  assert.equal(st.wave, 'Bubble');
  assert.equal(st.shape, '0,100');
});

test('通道開關:cfg 的 channels 會切換通道,關掉的通道先歸零', async () => {
  const { DglabController } = await import('../src/dglab.js');
  const sent = [];
  const d = new DglabController({ version: 'v3', channels: ['A'], waveform: 'BUBBLE', serverUrl: 'ws://x' }, () => {}, { absolute: true });
  d.socket = { setStrength: (c, v) => sent.push(['s', c, v]), clearPulse: (c) => sent.push(['clear', c]), sendPulse: (o) => sent.push(['pulse', o.channel]) };
  d.attached = true;
  d.limits = { A: 40, B: 40 };
  d.setLevel(10);
  assert.equal(d.current.A, 10);
  d.setChannels(['A', 'B']);
  assert.deepEqual(d.channels, ['A', 'B']);
  assert.equal(d.current.B, 10, '新開的通道套用目前強度');
  d.setChannels(['B']);
  assert.equal(d.current.A, 0, '關掉的通道歸零');
  assert.ok(sent.some((x) => x[0] === 'clear'), '關掉的通道清波形');
  d.setChannels([]);
  assert.equal(d.current.B, 0);
  assert.deepEqual(d.channelInfo(), []);
  // 經由 session 的 cfg 訊息
  const s = new ModSession(cfg, d, () => {}, () => 1000);
  s.onMessage({ t: 'cfg', channels: 'A,B' });
  assert.deepEqual(d.channels, ['A', 'B']);
  s.onMessage({ t: 'cfg', channels: '' });
  assert.deepEqual(d.channels, []);
  s.onMessage({ t: 'cfg', playCapPercent: 85 });
  assert.deepEqual(d.channels, [], '沒帶 channels 的 cfg 不改通道');
});

test('自訂波形:編碼、載入、錯誤訊息', async () => {
  const { encodeWaveform, freqValue, loadWaveform } = await import('../src/waveform.js');
  const { waveShape } = await import('../src/dglab.js');
  // 頻率:100Hz = 間隔 10ms → 10;10Hz = 100ms → 100;2Hz = 500ms → 180;1Hz = 1000ms → 240
  assert.deepEqual([100, 10, 2, 1].map(freqValue), [10, 100, 180, 240]);
  const raw = encodeWaveform({ freq: 100, frames: [50, [0, 25, 50, 100], { strength: 100, freq: 10 }, { strength: [1, 2, 3, 4], freq: [100, 10, 2, 1] }, 999] });
  assert.deepEqual(raw, ['0A0A0A0A32323232', '0A0A0A0A00193264', '6464646464646464', '0A64B4F001020304', '0A0A0A0A64646464']);
  assert.ok(raw.every((f) => /^[0-9A-F]{16}$/.test(f)));
  assert.deepEqual(waveShape(raw), [50, 44, 100, 3, 100]);
  assert.throws(() => encodeWaveform({ frames: [] }), /frames/);
  assert.throws(() => encodeWaveform({ frames: [[1, 2]] }), /frames\[0\]/);
  assert.throws(() => encodeWaveform({ frames: ['x'] }), /frames\[0\]/);
  // 內建(不分大小寫)、範例檔、找不到
  assert.equal(loadWaveform('bubble').custom, false);
  const ex = loadWaveform('example-ramp');
  assert.equal(ex.custom, true);
  assert.equal(ex.name, 'Ramp');
  assert.equal(ex.raw.length, 16);
  assert.throws(() => loadWaveform('no-such-wave'), /找不到波形/);
});

test('換波形:cfg 的 waveform 即時切換,輸出中會清舊波形再送新的;名稱錯誤維持原狀', async () => {
  const { DglabController } = await import('../src/dglab.js');
  const sent = [];
  const d = new DglabController({ version: 'v3', channels: ['A'], waveform: 'BUBBLE', serverUrl: 'ws://x' }, () => {}, { absolute: true });
  d.socket = { setStrength() {}, clearPulse: (c) => sent.push(['clear', c]), sendPulse: (o) => sent.push(['pulse', o.channel, o.data.length]) };
  d.attached = true;
  const s = new ModSession(cfg, d, () => {}, () => 1000);
  s.onMessage({ t: 'cfg', waveform: 'BUBBLE' });
  assert.equal(sent.length, 0, '同一個波形不重送');
  s.onMessage({ t: 'cfg', waveform: 'PULSATING' });
  assert.equal(d.waveName, 'Pulsating');
  assert.equal(d.waveformRaw.length, 24);
  assert.equal(s.status().wave, 'Pulsating');
  assert.equal(sent.length, 0, '沒在輸出時只換資料');
  d.startPulse();
  sent.length = 0;
  s.onMessage({ t: 'cfg', waveform: 'heartbeat' });
  assert.deepEqual(sent.map((x) => x[0]), ['clear', 'pulse']);
  assert.equal(sent[1][2], 35);
  assert.equal(d.setWaveform('NOPE'), false);
  assert.equal(d.waveName, 'Heartbeat');
  d.stopPulse();
});

test('.pulse(郊狼 App 導出):解析、轉成 V3 影格', async () => {
  const { parsePulse, pulseToFrames, PULSE_FREQ_MS, PULSE_DURATION_S } = await import('../src/pulse.js');
  assert.equal(PULSE_FREQ_MS.length, 84);
  assert.equal(PULSE_DURATION_S.length, 100);
  // 使用者 App 導出的樣本(進4):第 3 小節是關閉的
  const sample =
    'Dungeonlab+pulse:5,1,8=0,20,8,1,1/0.00-1,100.00-1,0.00-1,0.00-1,100.00-1,0.00-1,100.00-1,0.00-1,100.00-1,0.00-1,100.00-1,0.00-1,100.00-1,0.00-1,100.00-1' +
    '+section+0,20,8,1,1/100.00-1,87.83-0,75.67-1,59.49-0,43.31-1,53.77-1,100.00-1,45.26-1,72.63-0,100.00-1+section+0,20,8,1,0/0.00-1,100.00-1';
  const p = parsePulse(sample);
  assert.equal(p.rest, 0.5);
  assert.equal(p.speed, 1);
  assert.deepEqual(p.sections.map((x) => [x.freqA, x.freqB, x.seconds, x.mode, x.enabled, x.points.length]), [
    [10, 30, 0.9, 1, true, 15],
    [10, 30, 0.9, 1, true, 10],
    [10, 30, 0.9, 1, false, 2],
  ]);
  const { raw } = pulseToFrames(sample);
  assert.equal(raw.length, 15 + 10 + 5); // 兩個小節各播完一個脈衝元 + 0.5 秒休息
  assert.equal(raw[0], '0A0A0A0A00000000');
  assert.equal(raw[1], '0A0A0A0A64646464');
  assert.equal(raw[16], '0A0A0A0A58585858'); // 87.83 → 88
  assert.equal(raw.at(-1), '0A0A0A0A00000000');
  // 節內漸變:10ms → 100ms(頻率值 10 → 100),2 倍速
  const g = pulseToFrames('Dungeonlab+pulse:0,2,8=0,59,3,2,1/0.00-1,100.00-1').raw;
  // 0.4 秒 = 4 根竖条,頻率 10 → 40 → 70 → 100ms;每個 100ms 影格放兩根
  assert.deepEqual(g, ['0A0A282800006464', '4646646400006464']);
  // 錯誤
  assert.throws(() => parsePulse('hello'), /Dungeonlab\+pulse/);
  assert.throws(() => parsePulse('Dungeonlab+pulse:0,1,8=0,99,8,1,1/0-1'), /頻率B/);
  assert.throws(() => pulseToFrames('Dungeonlab+pulse:0,1,8=0,0,8,1,0/0-1'), /關閉/);
});

test('導入波形:mod 傳 pulse 後可用 pulse:<檔名> 選用,名稱保留原樣', async () => {
  const { DglabController } = await import('../src/dglab.js');
  const logs = [];
  const d = new DglabController({ version: 'v3', channels: ['A'], waveform: 'BUBBLE', serverUrl: 'ws://x' }, () => {}, { absolute: true });
  const s = new ModSession(cfg, d, (m) => logs.push(m), () => 1000);
  s.onMessage({ t: 'cfg', waveform: 'pulse:進4' });
  assert.equal(d.waveName, 'Bubble', '還沒收到檔案時維持原波形');
  s.onMessage({ t: 'pulse', name: '進4', data: 'Dungeonlab+pulse:0,1,8=0,0,1,1,1/0.00-1,100.00-1' });
  s.onMessage({ t: 'cfg', waveform: 'pulse:進4' });
  assert.equal(d.waveName, '進4');
  assert.equal(d.waveKey, 'pulse:進4');
  assert.deepEqual(d.waveformRaw, ['0A0A0A0A00000000', '0A0A0A0A64646464']);
  assert.equal(s.status().waveKey, 'pulse:進4');
  // 同名重新傳入 → 正在用的波形換成新內容
  s.onMessage({ t: 'pulse', name: '進4', data: 'Dungeonlab+pulse:0,1,8=0,0,0,1,1/50.00-1' });
  assert.deepEqual(d.waveformRaw, ['0A0A0A0A32323232']);
  s.onMessage({ t: 'pulse', name: '壞掉', data: 'garbage' });
  assert.ok(logs.some((l) => /壞掉.*失敗/.test(l)));
});
