#!/usr/bin/env node
// Beat Saber → DG-LAB 郊狼
//   input = "mod"(預設):遊戲內 mod 透過本機 TCP 送資料;本程式內建中轉伺服器並顯示 QR code
//   input = "datapuller":舊做法,讀 BSDataPuller 的 WebSocket
import { readFileSync } from 'node:fs';
import readline from 'node:readline';
import WebSocket from 'ws';
import { DglabController } from './dglab.js';
import { Bridge } from './bridge.js';
import { ModSession } from './session.js';
import { ModLink } from './modlink.js';
import { startRelay } from './relay.js';
import { lanAddresses, pickLanIp } from './netinfo.js';

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (m) => console.log(`${stamp()} ${m}`);

const cfgPath = process.argv[2] ?? new URL('../config.json', import.meta.url);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const input = cfg.input ?? 'mod';

let dev;
let relay;
let modlink;
let handler; // { emergencyStop, resume }
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('正在關閉:輸出歸零…');
  try {
    dev?.close();
  } catch {
    /* ignore */
  }
  try {
    modlink?.close();
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      relay?.close();
    } catch {
      /* ignore */
    }
    process.exit(code);
  }, 400);
}

// ---------- 中轉伺服器 + 位址 ----------

async function prepareRelay() {
  const rc = cfg.relay ?? {};
  const out = { ...cfg.dglab };
  if (rc.enabled === false) {
    log(`[relay] 使用外部中轉伺服器 ${out.serverUrl}(手機掃碼位址 ${out.appServerUrl ?? out.serverUrl})`);
    return out;
  }
  const port = rc.port ?? 9999;
  try {
    relay = await startRelay({ port, host: '0.0.0.0', log });
    log(`[relay] 內建中轉伺服器已啟動(埠 ${port})`);
  } catch (e) {
    if (e?.code !== 'EADDRINUSE') throw e;
    log(`[relay] 埠 ${port} 已被佔用,當作已有中轉伺服器在跑,直接連過去`);
  }
  let ip = String(rc.host ?? '').trim();
  if (ip) {
    log(`[relay] 手機要連的 IP: ${ip}(來自 config.relay.host)`);
  } else {
    const all = lanAddresses();
    ip = all[0]?.address ?? '';
    if (!ip) {
      log('[relay] 偵測不到區網 IP!請確認電腦已連上網路,或在 config.relay.host 手動填入');
      ip = '127.0.0.1';
    } else {
      log(`[relay] 自動偵測區網 IP: ${ip}(${all[0].name})`);
      if (all.length > 1) {
        log(`[relay] 其他候選: ${all.slice(1).map((c) => `${c.address}(${c.name})`).join(', ')} — 若手機連不上,把正確的填到 config.relay.host`);
      }
    }
  }
  out.serverUrl = `ws://127.0.0.1:${port}`;
  out.appServerUrl = `ws://${ip}:${port}`;
  return out;
}

// ---------- DataPuller(舊做法) ----------

function connectDataPuller(path, onMessage, onLost) {
  const url = `ws://${cfg.dataPuller.host}:${cfg.dataPuller.port}/BSDataPuller/${path}`;
  let warned = false;
  const open = () => {
    if (shuttingDown) return;
    const ws = new WebSocket(url);
    ws.on('open', () => {
      warned = false;
      log(`[dp] 已連上 ${url}`);
    });
    ws.on('message', (buf) => {
      try {
        onMessage(JSON.parse(buf.toString()));
      } catch (e) {
        log(`[dp] 解析 ${path} 失敗: ${e.message}`);
      }
    });
    ws.on('close', () => {
      onLost();
      if (!warned) log(`[dp] ${path} 未連線,每 2 秒重試(遊戲要開著並裝好 DataPuller)`);
      warned = true;
      setTimeout(open, 2000);
    });
    ws.on('error', () => {});
  };
  open();
}

// ---------- 主流程 ----------

async function main() {
  process.stdout.write('\x1b]0;BS-DGLab\x07');
  const dglabCfg = input === 'mod' ? await prepareRelay() : cfg.dglab;

  dev = new DglabController(dglabCfg, log, {
    maxStrength: cfg.mapping.maxStrength ?? 'auto',
    fallbackLimit: cfg.mapping.fallbackLimit ?? 40,
    absolute: input === 'mod' ? true : cfg.mapping.scale === 'absolute',
    playCapPercent: cfg.mapping.playCapPercent ?? 100,
  });
  dev.on('lost', () => {
    if (shuttingDown) return;
    log('DG-LAB 連線中斷,程式結束(重新執行並重新掃 QR code)');
    shutdown(1);
  });

  await dev.connect();

  let tickFn;
  if (input === 'mod') {
    const mc = cfg.mod ?? {};
    modlink = new ModLink({ host: mc.host ?? '127.0.0.1', port: mc.port ?? 9977 }, log);
    const session = new ModSession(cfg, dev, log);
    handler = session;
    modlink.on('message', (m) => session.onMessage(m));
    modlink.on('connect', () => log('[mod] 遊戲連進來了'));
    modlink.on('disconnect', () => {
      log('[mod] 遊戲中斷連線');
      session.onModDisconnected();
    });
    await modlink.listen();
    log(`[mod] 等待遊戲內 mod 連線(127.0.0.1:${modlink.port})`);
    let lastKey = '';
    setInterval(() => {
      const st = session.status();
      const key = JSON.stringify(st);
      if (key !== lastKey || Date.now() % 2000 < 500) {
        modlink.send(st);
        lastKey = key;
      }
    }, 500);
    tickFn = (dt) => session.tick(dt);
  } else {
    const bridge = new Bridge(cfg, dev, log);
    handler = bridge;
    connectDataPuller('MapData', (m) => bridge.onMapData(m), () => bridge.onDataPullerLost());
    connectDataPuller('LiveData', (d) => bridge.onLiveData(d), () => bridge.onDataPullerLost());
    tickFn = (dt) => bridge.tick(dt);
  }

  log('等待手機 App 掃碼連線…');
  await dev.waitAttached();
  dev.stopAll(); // 起始先確保歸零

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    tickFn((now - last) / 1000);
    last = now;
  }, 100);

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_s, key) => {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') return shutdown(0);
      if (key.name === 'x' || key.name === 'space') return handler.emergencyStop();
      if (key.name === 'r') return handler.resume();
    });
    log('快捷鍵: x 或 空白鍵 = 緊急停止 | r = 解除 | q 或 Ctrl+C = 結束');
  } else {
    log('(非互動終端機,沒有鍵盤快捷鍵;Ctrl+C 仍會歸零後結束)');
  }
  log(input === 'mod' ? '就緒,等待遊戲內 mod。' : '就緒,等待遊戲資料。');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (e) => {
  log(`未預期錯誤: ${e?.stack ?? e}`);
  shutdown(1);
});
process.on('unhandledRejection', (e) => {
  log(`未處理的 Promise 錯誤: ${e?.stack ?? e}`);
  shutdown(1);
});

main().catch((e) => {
  log(`啟動失敗: ${e?.message ?? e}`);
  if (input !== 'mod' || cfg.relay?.enabled === false) {
    log(`請確認中繼伺服器已經啟動,且本機連得到 config.dglab.serverUrl = ${cfg.dglab?.serverUrl}`);
  }
  shutdown(1);
});
