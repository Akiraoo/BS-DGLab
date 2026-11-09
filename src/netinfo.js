// 偵測電腦的區網 IPv4 位址(config 的 ip 欄位留空時使用)
import os from 'node:os';

// 虛擬網卡(VMware、Hyper-V、WSL、Docker、VPN…)通常不是手機連得到的那張
const VIRTUAL = /virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|loopback|bluetooth|tailscale|zerotier|hamachi|vpn|tap|tun|npcap/i;

function isPrivate(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** 回傳候選位址,最可能的排最前面:[{name, address, virtual}] */
export function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal) continue;
      if (i.address.startsWith('169.254.')) continue; // 沒拿到 IP 的自動位址
      out.push({ name, address: i.address, virtual: VIRTUAL.test(name), priv: isPrivate(i.address) });
    }
  }
  const score = (c) => (c.virtual ? 0 : 4) + (c.priv ? 2 : 0) + (c.address.startsWith('192.168.') ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a));
}

export function pickLanIp(ifaces) {
  return lanAddresses(ifaces)[0]?.address ?? null;
}
