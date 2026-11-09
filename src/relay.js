// 內建的精簡版 DG-LAB V3 中轉伺服器(只做這個程式需要的:配對、強度/清除指令、波形排程、App 回報轉送)
// 行為依 dglab-websocket-server 的 V3 文件實作;若要用官方版,把 config.relay.enabled 設成 false 即可。
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const chNum = (c) => {
  const s = String(c ?? '').toUpperCase();
  if (s === 'A' || s === '1') return { letter: 'A', n: 1 };
  if (s === 'B' || s === '2') return { letter: 'B', n: 2 };
  return null;
};
const toInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);

// 把一段波形(16 位十六進位字串陣列)攤成 time×10 個 100ms 影格,再切成每秒一包
export function buildPulsePackets(letter, rawMessage, time, perSecond = 1) {
  const packetCount = Math.max(1, time * perSecond);
  const idx = String(rawMessage).indexOf(':');
  let frames = null;
  if (idx > 0) {
    try {
      const arr = JSON.parse(String(rawMessage).slice(idx + 1));
      if (Array.isArray(arr) && arr.length && arr.every((x) => typeof x === 'string' && /^[0-9a-fA-F]{16}$/.test(x))) {
        frames = arr.map((x) => x.toUpperCase());
      }
    } catch {
      /* 不是波形格式,原樣轉送 */
    }
  }
  if (!frames) return Array.from({ length: packetCount }, () => `pulse-${rawMessage}`);
  const total = Math.max(1, time * 10);
  const fitted = Array.from({ length: total }, (_, i) => frames[i % frames.length]);
  const chunks = Array.from({ length: packetCount }, (_, i) =>
    fitted.slice(Math.floor((i * total) / packetCount), Math.floor(((i + 1) * total) / packetCount)),
  ).filter((c) => c.length);
  return chunks.map((c) => `pulse-${letter}:${JSON.stringify(c)}`);
}

export function startRelay({ port = 9999, host = '0.0.0.0', log = () => {}, heartbeatMs = 60_000, idleMs = 5 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host });
    const conns = new Map(); // id -> { ws, idle }
    const pairOf = new Map(); // id -> peer id
    const appIds = new Set(); // 帶 targetId 連進來的(被控端 = 手機 App)
    const pulseTasks = new Map(); // `${web}:${letter}` -> { timer }

    const send = (ws, o) => {
      if (ws.readyState !== 1) return false;
      ws.send(JSON.stringify(o));
      return true;
    };
    const sendTo = (id, o) => (conns.has(id) ? send(conns.get(id).ws, o) : false);
    const err = (ws, clientId, targetId, code) => send(ws, { type: 'error', clientId, targetId, message: code });
    const bound = (id) => pairOf.has(id);

    const clearTasks = (webId, letter) => {
      for (const [k, t] of pulseTasks) {
        if (k.startsWith(`${webId}:`) && (!letter || k.endsWith(`:${letter}`))) {
          clearInterval(t.timer);
          pulseTasks.delete(k);
        }
      }
    };

    function pair(webId, appId) {
      if (webId === appId || !conns.has(webId) || !conns.has(appId)) return '401';
      if (pairOf.get(webId) === appId) return '200';
      if (bound(webId) || bound(appId)) return '400';
      pairOf.set(webId, appId);
      pairOf.set(appId, webId);
      for (const id of [webId, appId]) clearTimeout(conns.get(id).idle);
      return '200';
    }

    function queuePulse(webId, appId, ch, rawMessage, time, ws) {
      const packets = buildPulsePackets(ch.letter, rawMessage, time);
      const key = `${webId}:${ch.letter}`;
      const start = () => {
        let i = 0;
        const tick = () => {
          if (i >= packets.length || !sendTo(appId, { type: 'msg', clientId: webId, targetId: appId, message: packets[i++] })) {
            clearInterval(pulseTasks.get(key)?.timer);
            pulseTasks.delete(key);
            if (i >= packets.length) send(ws, { type: 'notify', clientId: webId, targetId: appId, message: '發送完畢' });
          }
        };
        const task = { timer: setInterval(tick, 1000) };
        pulseTasks.set(key, task);
        tick();
      };
      if (pulseTasks.has(key)) {
        clearTasks(webId, ch.letter);
        sendTo(appId, { type: 'msg', clientId: webId, targetId: appId, message: `clear-${ch.n}` });
        setTimeout(start, 150); // 清掉舊波形後稍等再送新的
      } else start();
    }

    wss.on('connection', (ws, req) => {
      const id = randomUUID();
      const url = new URL(req.url ?? '/', 'http://x');
      const target = (url.searchParams.get('targetId') || url.searchParams.get('tid') || url.pathname.slice(1)).trim();
      const entry = { ws, idle: null };
      conns.set(id, entry);
      send(ws, { type: 'bind', clientId: id, targetId: '', message: 'targetId' });

      if (target) {
        // 帶 targetId 的是手機 App:直接和該控制端配對
        const ok = conns.has(target) && !bound(target) && conns.get(target).ws.readyState === 1 && pair(target, id) === '200';
        if (!ok) {
          log(`[relay] 拒絕連線:無效的 targetId ${target}`);
          err(ws, id, target, '4001');
          conns.delete(id);
          ws.close(4001, 'invalid_target_id');
          return;
        }
        appIds.add(id);
        const m = { type: 'bind', clientId: target, targetId: id, message: '200' };
        sendTo(target, m);
        send(ws, m);
        log('[relay] 手機 App 已配對');
      } else {
        entry.idle = setTimeout(() => {
          if (!bound(id) && ws.readyState === 1) {
            send(ws, { type: 'error', clientId: id, targetId: '', message: 'idle_timeout' });
            ws.close(1000, 'idle_timeout');
          }
        }, idleMs);
      }

      ws.on('message', (buf) => {
        let d;
        try {
          d = JSON.parse(buf.toString());
        } catch {
          return err(ws, '', '', '403');
        }
        if (!d || typeof d !== 'object' || d.type == null || typeof d.clientId !== 'string' || typeof d.targetId !== 'string' || typeof d.message !== 'string' || !d.clientId || !d.targetId) {
          return err(ws, '', '', '403');
        }
        if (id !== d.clientId && id !== d.targetId) return err(ws, d.clientId, d.targetId, '404');
        if (d.type === 'heartbeat') return;
        if (d.type === 'bind') {
          const code = pair(d.clientId, d.targetId);
          const r = { type: 'bind', clientId: d.clientId, targetId: d.targetId, message: code };
          if (code !== '200') return send(ws, r);
          sendTo(d.clientId, r);
          sendTo(d.targetId, r);
          return;
        }
        // App 的回報(strength-… / feedback-…):轉給控制端
        if (/^(feedback|strength)/.test(d.message)) {
          const peer = pairOf.get(id);
          if (!peer) return err(ws, d.clientId, d.targetId, '402');
          const fromApp = appIds.has(id);
          return sendTo(peer, { type: d.type, clientId: fromApp ? peer : d.clientId, targetId: fromApp ? id : d.targetId, message: d.message });
        }
        // 以下都是控制端 → App
        if (id !== d.clientId) return err(ws, d.clientId, d.targetId, '404');
        if (pairOf.get(d.clientId) !== d.targetId) return err(ws, d.clientId, d.targetId, '402');
        const route = typeof d.type === 'number' ? d.type : /^\d+$/.test(String(d.type)) ? Number(d.type) : null;
        const toApp = (message) => sendTo(d.targetId, { type: 'msg', clientId: d.clientId, targetId: d.targetId, message });

        if (route === 1 || route === 2 || route === 3 || route === 4) {
          const ch = chNum(d.channel ?? 1);
          if (!ch) return err(ws, d.clientId, d.targetId, '406');
          if (route === 4 && d.message.includes('clear')) {
            clearTasks(d.clientId, ch.letter);
            toApp(`clear-${ch.n}`);
            return send(ws, { type: 'notify', clientId: d.clientId, targetId: d.targetId, message: '發送完畢' });
          }
          const msg = route === 1 ? `strength-${ch.n}+0+1` : route === 2 ? `strength-${ch.n}+1+1` : `strength-${ch.n}+2+${toInt(d.strength)}`;
          if (!toApp(msg)) err(ws, d.clientId, d.targetId, '404');
          return;
        }
        if (d.type === 'clientMsg') {
          const ch = chNum(d.channel);
          if (!ch) return err(ws, d.clientId, d.targetId, '406');
          if (!conns.has(d.targetId)) return err(ws, d.clientId, d.targetId, '404');
          const time = toInt(d.time, 5) > 0 ? toInt(d.time, 5) : 5;
          return queuePulse(d.clientId, d.targetId, ch, d.message, time, ws);
        }
        // 其他訊息原樣轉給對端
        const peer = pairOf.get(id);
        if (peer) sendTo(peer, { type: d.type, clientId: d.clientId, targetId: d.targetId, message: d.message });
      });

      ws.on('close', () => {
        clearTimeout(entry.idle);
        const peer = pairOf.get(id);
        conns.delete(id);
        appIds.delete(id);
        clearTasks(id);
        if (peer) {
          clearTasks(peer);
          pairOf.delete(id);
          pairOf.delete(peer);
          if (conns.has(peer)) {
            sendTo(peer, { type: 'break', clientId: peer, targetId: id, message: '209' });
            conns.get(peer).ws.close(1000, 'partner_disconnected');
          }
        }
      });
      ws.on('error', () => {});
    });

    const hb = setInterval(() => {
      for (const [id, c] of conns) send(c.ws, { type: 'heartbeat', clientId: id, targetId: pairOf.get(id) ?? '', message: '200' });
    }, heartbeatMs);

    wss.on('error', (e) => {
      clearInterval(hb);
      reject(e);
    });
    wss.on('listening', () =>
      resolve({
        port,
        close: () => {
          clearInterval(hb);
          for (const t of pulseTasks.values()) clearInterval(t.timer);
          for (const c of conns.values()) c.ws.terminate();
          wss.close();
        },
      }),
    );
  });
}
