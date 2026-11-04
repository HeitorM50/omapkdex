import { Bonjour } from './deps.mjs';
import { localIP } from './wire.mjs';
export class Discovery {
  constructor() {
    this.rooms = new Map();
    this.mdns = null;
    this.browser = null;
    this.publication = null;
    this.error = '';
  }
  ensure() {
    if (!this.mdns)
      this.mdns = new Bonjour({}, (e) => {
        this.error = 'Local discovery unavailable: ' + e.message;
      });
    return this.mdns;
  }
  advertise(port, roomId, address) {
    this.publication = this.ensure().publish({
      name: 'OmaPkDex ' + roomId.slice(0, 8),
      host: 'omapkdex-' + roomId + '.local',
      type: 'omapkdex',
      protocol: 'tcp',
      port,
      txt: { v: '1', room: roomId, address },
    });
    this.publication.on('error', (e) => {
      this.error = e.message;
    });
  }
  scan() {
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(() => this.scan(), 45000);
      this.refreshTimer.unref();
    }
    this.browser?.stop();
    this.rooms.clear();
    this.browser = this.ensure().find({ type: 'omapkdex' }, (service) => {
      if (service.txt?.v !== '1' || typeof service.txt?.room !== 'string') return;
      const addresses = [service.txt?.address, ...(service.addresses || [])].filter(localIP);
      if (!addresses.length) return;
      this.rooms.set(service.fqdn, {
        roomId: service.txt.room,
        host: addresses.find((ip) => ip.includes('.')) || addresses[0],
        port: service.port,
        name: service.name,
        seen: Date.now(),
      });
    });
    this.browser.on('down', (s) => this.rooms.delete(s.fqdn));
  }
  list() {
    return [...this.rooms.values()].filter((r) => Date.now() - r.seen < 120000);
  }
  close() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.browser?.stop();
    this.publication?.stop();
    this.mdns?.destroy();
    this.browser = null;
    this.publication = null;
    this.mdns = null;
    this.rooms.clear();
  }
}
