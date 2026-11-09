// 與遊戲內 mod 的通訊:本機 TCP,一行一個 JSON(NDJSON)。
// mod → app: hello / cfg / state / level / ping / estop / resume
// app → mod: welcome / status
import net from 'node:net';
import { EventEmitter } from 'node:events';

export class ModLink extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 9977 } = {}, log = () => {}) {
    super();
    this.host = host;
    this.port = port;
    this.log = log;
    this.sock = null;
    this.server = null;
  }

  get connected() {
    return Boolean(this.sock && !this.sock.destroyed);
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((s) => this._onSocket(s));
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  _onSocket(s) {
    // 同時只接受一個 mod;新的連進來就換掉舊的(遊戲重開時舊連線可能還沒被偵測到斷線)
    if (this.sock && !this.sock.destroyed) this.sock.destroy();
    this.sock = s;
    s.setNoDelay(true);
    s.setEncoding('utf8');
    let buf = '';
    s.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 1_000_000) return s.destroy(); // 異常資料
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m && typeof m === 'object' && typeof m.t === 'string') this.emit('message', m);
      }
    });
    const gone = () => {
      if (this.sock === s) {
        this.sock = null;
        this.emit('disconnect');
      }
    };
    s.on('close', gone);
    s.on('error', () => {});
    this.emit('connect');
  }

  send(obj) {
    if (!this.connected) return false;
    try {
      this.sock.write(`${JSON.stringify(obj)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.sock?.destroy();
    this.server?.close();
  }
}
