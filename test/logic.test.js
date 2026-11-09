import test from 'node:test';
import assert from 'node:assert/strict';
import { PenaltyTracker, levelFromLoss, rampToward } from '../src/penalty.js';
import { Bridge } from '../src/bridge.js';
import { DglabController } from '../src/dglab.js';

const mapping = {
  mode: 'linear',
  coefficient: 0.5,
  maxStrength: 'auto',
  fallbackLimit: 40,
  playCapPercent: 50,
  lossCap: 60,
  healFactor: 1,
  decayPerSecond: 0,
  maxRisePercentPerSecond: 15,
  steps: [[0, 0], [1, 1], [40, 10]],
  healthScale: 'auto',
};

test('開局 50% 不會被當成已扣血(0~1 刻度)', () => {
  const t = new PenaltyTracker({ lossCap: 60 });
  assert.equal(t.update(0.5), null);
  assert.equal(t.P, 0);
  t.update(0.4); // -10%
  assert.ok(Math.abs(t.P - 10) < 1e-6);
});

test('開局 50% 不會被當成已扣血(0~100 刻度)', () => {
  const t = new PenaltyTracker({ lossCap: 60 });
  t.update(50);
  t.update(35); // -15
  assert.ok(Math.abs(t.P - 15) < 1e-6);
});

test('扣血累加,回血等比例減少,最低 0', () => {
  const t = new PenaltyTracker({ lossCap: 60 });
  t.update(0.5);
  t.update(0.4); // P=10
  t.update(0.25); // P=25
  t.update(0.3); // 回 5 → P=20
  assert.ok(Math.abs(t.P - 20) < 1e-6);
  t.update(0.6); // 回 30 → P 最低 0
  assert.equal(t.P, 0);
  t.update(0.5); // 從 60 掉到 50,P=10(相對歷史高點)
  assert.ok(Math.abs(t.P - 10) < 1e-6);
});

test('lossCap 限制碰牆暴衝', () => {
  const t = new PenaltyTracker({ lossCap: 60 });
  t.update(1.0);
  t.update(0.0);
  assert.equal(t.P, 60);
});

test('healFactor 加快回復', () => {
  const t = new PenaltyTracker({ lossCap: 60, healFactor: 2 });
  t.update(0.5);
  t.update(0.3); // P=20
  t.update(0.35); // 回 5 ×2 → P=10
  assert.ok(Math.abs(t.P - 10) < 1e-6);
});

test('扣血對應:累計扣 10% → 總強度的 5%,不論上限是多少', () => {
  assert.equal(levelFromLoss(10, mapping), 5);
  assert.equal(levelFromLoss(0, mapping), 0);
  assert.equal(levelFromLoss(60, mapping), 30);
  assert.equal(levelFromLoss(100, mapping), 50);
  assert.equal(levelFromLoss(400, { ...mapping, coefficient: 1 }), 100); // 最多 100
});

test('階梯模式(百分比)', () => {
  const m = { ...mapping, mode: 'steps' };
  assert.equal(levelFromLoss(0, m), 0);
  assert.equal(levelFromLoss(5, m), 1);
  assert.equal(levelFromLoss(45, m), 10);
});

test('上升限速、下降立刻', () => {
  assert.ok(Math.abs(rampToward(0, 100, 0.1, 15) - 1.5) < 1e-9);
  assert.equal(rampToward(50, 10, 0.1, 15), 10);
  assert.equal(rampToward(0, 1, 0.1, 15), 1);
});

// ---------- DglabController:依 App 上限等比例換算 ----------
function makeCtl(limits, opts = {}) {
  const ctl = new DglabController({ version: 'v3', channels: ['A'], waveform: 'BUBBLE' }, () => {}, opts);
  const sent = [];
  ctl.socket = {
    setStrength: (ch, v) => sent.push(['set', ch, v]),
    sendPulse: () => sent.push(['pulse']),
    clearPulse: () => sent.push(['clear']),
  };
  ctl.attached = true;
  ctl.limits = limits;
  return { ctl, sent };
}
const sets = (sent) => sent.filter((s) => s[0] === 'set').map((s) => s[2]);

test('等比例:5% → 上限 40 是 2,上限 200 是 10', () => {
  let { ctl, sent } = makeCtl({ A: 40 });
  ctl.setLevel(5);
  assert.deepEqual(sets(sent), [2]);
  ({ ctl, sent } = makeCtl({ A: 200 }));
  ctl.setLevel(5);
  assert.deepEqual(sets(sent), [10]);
});

test('App 中途改了上限,會立刻按新上限重算', () => {
  const { ctl, sent } = makeCtl({ A: 40 });
  ctl.setLevel(25); // 10
  ctl.limits = { A: 80 };
  ctl._applyLevel(); // 20
  assert.deepEqual(sets(sent), [10, 20]);
});

test('失敗滿檔 "max":用 App 上限,不是 200', () => {
  const { ctl, sent } = makeCtl({ A: 40 });
  const p = ctl.burst('max', 20);
  assert.deepEqual(sets(sent), [40]);
  return p.then(() => {
    assert.equal(sets(sent).at(-1), 0);
    assert.ok(sent.some((s) => s[0] === 'clear'));
  });
});

test('失敗輸出指定數字超過上限時,夾到上限(App 會忽略超過上限的指令)', async () => {
  const { ctl, sent } = makeCtl({ A: 40 });
  await ctl.burst(200, 10);
  assert.equal(sets(sent)[0], 40);
});

test('尚未收到 App 上限 → 用保守的 fallbackLimit;maxStrength 為數字時固定用該值', () => {
  let { ctl, sent } = makeCtl({}, { fallbackLimit: 40 });
  ctl.setLevel(50);
  assert.deepEqual(sets(sent), [20]);
  ({ ctl, sent } = makeCtl({ A: 40 }, { maxStrength: 100 }));
  ctl.setLevel(50);
  assert.deepEqual(sets(sent), [20]); // 固定值與 App 上限取較小者(40)的 50%
});

test('絕對模式:level 就是強度數值,不管上限多少(仍夾在上限內)', () => {
  let { ctl, sent } = makeCtl({ A: 40 }, { absolute: true });
  ctl.setLevel(5);
  assert.deepEqual(sets(sent), [5]);
  ctl.setLevel(30);
  ctl.setLevel(50); // 超過上限 → 夾在 40
  assert.deepEqual(sets(sent), [5, 30, 40]);
  ({ ctl, sent } = makeCtl({ A: 200 }, { absolute: true }));
  ctl.setLevel(5);
  assert.deepEqual(sets(sent), [5]);
});

test('絕對模式:累計扣 2% 血 +1 強度(coefficient 0.5),無條件捨去、可逆', () => {
  const { ctl, sent } = makeCtl({ A: 40 }, { absolute: true });
  const t = new PenaltyTracker({ lossCap: 60 });
  const apply = () => ctl.setLevel(levelFromLoss(t.P, { ...mapping, scale: 'absolute' }));
  t.update(0.5);
  const seen = [];
  for (const h of [0.49, 0.48, 0.47, 0.46, 0.45, 0.46, 0.47, 0.48, 0.49, 0.5]) {
    t.update(h);
    apply();
    seen.push(Math.round(ctl.current.A));
  }
  // 扣 1%→0,2%→1,3%→1,4%→2,5%→2;回血 4%→2,3%→1,2%→1,1%→0,0%→0
  assert.deepEqual(seen, [0, 1, 1, 2, 2, 2, 1, 1, 0, 0]);
});

test('絕對模式:還沒收到上限時,夾在保守的 fallbackLimit', () => {
  const { ctl, sent } = makeCtl({}, { absolute: true, fallbackLimit: 40 });
  ctl.setLevel(80);
  assert.deepEqual(sets(sent), [40]);
});

test('絕對模式:失敗 "max" 仍是 App 上限', async () => {
  const { ctl, sent } = makeCtl({ A: 40 }, { absolute: true });
  await ctl.burst('max', 10);
  assert.equal(sets(sent)[0], 40);
});

test('stopAll:歸零並清波形,之後補送歸零', async () => {
  const { ctl, sent } = makeCtl({ A: 40 });
  ctl.setLevel(50);
  ctl.stopAll();
  assert.equal(sets(sent).at(-1), 0);
  assert.ok(sent.some((s) => s[0] === 'clear'));
  const before = sets(sent).length;
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(sets(sent).length, before + 2); // 400ms 與 1500ms 各補一次
  assert.ok(sets(sent).slice(before).every((v) => v === 0));
  ctl.closing = true;
});

// ---------- Bridge 狀態機 ----------
function makeBridge(over = {}) {
  const calls = [];
  const dev = {
    setLevel: (v) => calls.push(['level', v]),
    startPulse: () => calls.push(['start']),
    stopAll: () => calls.push(['stopAll']),
    burst: async (v, ms) => {
      calls.push(['burst', v, ms]);
    },
  };
  let t = 1000;
  const cfg = {
    dataPuller: { staleMs: 5000 },
    mapping,
    events: { zeroOnPause: true, failStrength: 'max', failDurationMs: 2000 },
    log: { losses: false },
    ...over,
  };
  const b = new Bridge(cfg, dev, () => {}, () => t);
  return { b, calls, advance: (ms) => (t += ms) };
}

const run = (b, sec) => {
  for (let i = 0; i < sec * 10; i++) b.tick(0.1);
};

test('Bridge:扣血後強度百分比上升並受限速,回血後下降', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.4 }); // P=10 → 目標 5%
  run(b, 1);
  assert.ok(Math.abs(b.current - 5) < 1e-6);
  b.onLiveData({ PlayerHealth: 0.5 }); // 回 10 → P=0
  b.tick(0.1);
  assert.equal(b.current, 0);
  assert.deepEqual(calls.at(-1), ['level', 0]);
});

test('Bridge:過關 → 全部關閉,且之後的 LiveData 被忽略', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 2);
  assert.ok(b.current > 0);
  b.onMapData({ LevelFinished: true });
  assert.equal(calls.at(-1)[0], 'stopAll');
  assert.equal(b.current, 0);
  const n = calls.length;
  b.onLiveData({ PlayerHealth: 0.1 });
  run(b, 1);
  assert.equal(calls.length, n);
});

test('Bridge:失敗 → 以 "max" 輸出 2000ms', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onMapData({ LevelFailed: true });
  assert.deepEqual(calls.at(-1), ['burst', 'max', 2000]);
  b.onMapData({ LevelFailed: true });
  assert.equal(calls.filter((c) => c[0] === 'burst').length, 1);
});

test('Bridge:新一關開始會重置累計', () => {
  const { b } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.2 });
  assert.ok(b.tracker.P > 0);
  b.onMapData({ LevelFinished: true });
  b.onMapData({});
  assert.equal(b.state, 'playing');
  assert.equal(b.tracker.P, 0);
  b.onLiveData({ PlayerHealth: 0.5 });
  assert.equal(b.tracker.P, 0);
});

test('Bridge:暫停歸零、繼續後重新爬升', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 2);
  assert.ok(b.current > 0);
  b.onMapData({ LevelPaused: true });
  assert.equal(b.current, 0);
  assert.deepEqual(calls.at(-1), ['level', 0]);
  run(b, 1);
  assert.equal(b.current, 0);
  b.onMapData({ LevelPaused: false });
  run(b, 1);
  assert.ok(b.current > 0 && b.current <= 15.5);
});

test('Bridge:逾時沒資料 → 歸零', () => {
  const { b, advance } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 2);
  assert.ok(b.current > 0);
  advance(6000);
  b.tick(0.1);
  assert.equal(b.current, 0);
});

test('Bridge:緊急停止後不再輸出,失敗也不爆發,解除後恢復', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 1);
  b.emergencyStop();
  assert.equal(calls.at(-1)[0], 'stopAll');
  const n = calls.length;
  run(b, 2);
  assert.equal(calls.length, n);
  b.onMapData({ LevelFailed: true });
  assert.equal(calls.filter((c) => c[0] === 'burst').length, 0);
  b.onMapData({});
  b.resume();
  assert.equal(b.emergency, false);
});

test('Bridge:DataPuller 中斷 → 歸零', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 2);
  b.onDataPullerLost();
  assert.equal(b.current, 0);
  assert.equal(calls.at(-1)[0], 'stopAll');
});

test('Bridge:沒收到 MapData 也能由 LiveData 自動開始(中途才連上)', () => {
  const { b } = makeBridge();
  b.onLiveData({ PlayerHealth: 0.5 });
  assert.equal(b.state, 'playing');
});

test('Bridge:波形不會在關卡開始或選單階段就送,第一次需要強度時才開始(且只開一次)', () => {
  const { b, calls } = makeBridge();
  b.onMapData({}); // 連上 / 關卡開始
  b.onLiveData({ PlayerHealth: 0.5 });
  run(b, 2);
  assert.equal(calls.filter((c) => c[0] === 'start').length, 0);
  b.onLiveData({ PlayerHealth: 0.4 }); // 扣血
  run(b, 2);
  assert.equal(calls.filter((c) => c[0] === 'start').length, 1);
  const i = calls.findIndex((c) => c[0] === 'start');
  assert.equal(calls[i + 1][0], 'level'); // 先開波形再設強度
  b.onLiveData({ PlayerHealth: 0.3 });
  run(b, 2);
  assert.equal(calls.filter((c) => c[0] === 'start').length, 1);
});

test('Bridge:過關後下一關重新開始時,波形也重新等到需要時才送', () => {
  const { b, calls } = makeBridge();
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  b.onLiveData({ PlayerHealth: 0.4 });
  run(b, 2);
  b.onMapData({ LevelFinished: true });
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 0.5 });
  run(b, 2);
  assert.equal(calls.filter((c) => c[0] === 'start').length, 1);
  b.onLiveData({ PlayerHealth: 0.4 });
  run(b, 2);
  assert.equal(calls.filter((c) => c[0] === 'start').length, 2);
});

test('一般遊玩天花板 = playCapPercent × App 上限;失敗滿檔不受限', async () => {
  // 上限 100、天花板 85% → 一般最高 85
  let { ctl, sent } = makeCtl({ A: 100 }, { absolute: true, playCapPercent: 85 });
  ctl.setLevel(100);
  assert.deepEqual(sets(sent), [85]);
  // 上限 40 → 34
  ({ ctl, sent } = makeCtl({ A: 40 }, { absolute: true, playCapPercent: 85 }));
  ctl.setLevel(100);
  assert.deepEqual(sets(sent), [34]);
  // 等比例模式同樣是上限的 85%
  ({ ctl, sent } = makeCtl({ A: 200 }, { playCapPercent: 85 }));
  ctl.setLevel(100);
  assert.deepEqual(sets(sent), [170]);
  // 失敗 burst 仍然拉滿到 App 上限
  ({ ctl, sent } = makeCtl({ A: 100 }, { absolute: true, playCapPercent: 85 }));
  await ctl.burst('max', 10);
  assert.equal(sets(sent)[0], 100);
});

test('Bridge:累計扣血上限由天花板自動推算,碰牆後回血不必等很久', () => {
  const { ctl } = makeCtl({ A: 40 }, { absolute: true, playCapPercent: 85 });
  const cfg = { mapping: { ...mapping, scale: 'absolute', maxRisePercentPerSecond: 0 }, events: {}, dataPuller: {} };
  delete cfg.mapping.lossCap;
  const b = new Bridge(cfg, ctl, () => {});
  b.onMapData({});
  b.onLiveData({ PlayerHealth: 1.0 });
  b.onLiveData({ PlayerHealth: 0.0 }); // 瞬間 −100%
  b.tick(0.1);
  assert.ok(Math.abs(b.tracker.P - 68) < 1e-6); // 34 ÷ 0.5
  assert.equal(Math.round(ctl.current.A), 34);
  ctl.stopPulse(); // 關掉波形刷新計時器,否則測試程序不會結束
});
