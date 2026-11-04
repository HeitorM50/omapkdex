import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
export function localIP(ip) {
  if (typeof ip !== 'string') return false;
  if (ip.startsWith('::ffff:')) return localIP(ip.slice(7));
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return isIP(ip.split('%')[0]) === 6 && (/^(fc|fd|fe80:)/i.test(ip) || ip === '::1');
}
export function identity(dir) {
  const folder = join(dir, 'battle-private');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const key = join(folder, 'key.pem'),
    cert = join(folder, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-keyout',
        key + '.new',
        '-out',
        cert + '.new',
        '-days',
        '3650',
        '-subj',
        '/CN=OmaPkDex LAN',
      ],
      { stdio: 'ignore', timeout: 15000 },
    );
    chmodSync(key + '.new', 0o600);
    chmodSync(cert + '.new', 0o600);
    renameSync(key + '.new', key);
    renameSync(cert + '.new', cert);
  }
  const pem = readFileSync(cert);
  return {
    key: readFileSync(key),
    cert: pem,
    fingerprint: new X509Certificate(pem).fingerprint256.replaceAll(':', '').toLowerCase(),
  };
}
export class Frames extends EventEmitter {
  constructor(socket, limit = 65536) {
    super();
    this.socket = socket;
    this.limit = limit;
    this.buffer = Buffer.alloc(0);
    this.rateAt = Date.now();
    this.count = 0;
    socket.on('data', (chunk) => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        let end;
        while ((end = this.buffer.indexOf(10)) >= 0) {
          if (end > limit) throw Error('Message too large');
          const line = this.buffer.subarray(0, end).toString('utf8');
          this.buffer = this.buffer.subarray(end + 1);
          if (Date.now() - this.rateAt > 1000) {
            this.rateAt = Date.now();
            this.count = 0;
          }
          if (++this.count > 120) throw Error('Too many messages');
          this.emit('message', JSON.parse(line));
        }
        if (this.buffer.length > limit) throw Error('Message too large');
      } catch (e) {
        this.emit('fault', e);
        socket.destroy();
      }
    });
    socket.on('error', (e) => this.emit('fault', e));
    socket.on('close', () => this.emit('closed'));
  }
  send(value) {
    const data = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(data) > this.limit) throw Error('Message too large');
    if (this.socket.destroyed) throw Error('Peer disconnected');
    this.socket.write(data);
  }
  close() {
    this.socket.destroy();
  }
}
export function secureOptions(keys) {
  return {
    key: keys.key,
    cert: keys.cert,
    minVersion: 'TLSv1.3',
    requestCert: true,
    rejectUnauthorized: false,
    handshakeTimeout: 10000,
  };
}
export function fingerprint(socket) {
  const cert = socket.getPeerX509Certificate();
  if (!cert) throw Error('Peer certificate required');
  return cert.fingerprint256.replaceAll(':', '').toLowerCase();
}
export function pairCode(socket) {
  return createHash('sha256')
    .update(socket.exportKeyingMaterial(32, 'omapkdex-pair-v1'))
    .digest('hex')
    .slice(0, 12)
    .toUpperCase()
    .match(/.{4}/g)
    .join('-');
}
export function connectTLS(keys, host, port) {
  return tls.connect({ ...secureOptions(keys), host, port });
}
