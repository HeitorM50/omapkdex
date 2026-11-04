import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Discovery } from '../discovery.mjs';
test('mDNS advertises an anonymous room and discovers its selected address', async (t) => {
  const host = new Discovery(),
    guest = new Discovery(),
    room = randomUUID();
  t.after(() => {
    host.close();
    guest.close();
  });
  guest.scan();
  host.advertise(47853, room, '127.0.0.1');
  let found;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 80));
    found = guest.list().find((r) => r.roomId === room);
    if (found) break;
  }
  assert.ok(found, 'Multicast room discovery must work on the local link');
  assert.equal(found.host, '127.0.0.1');
  assert.equal(found.port, 47853);
  assert.equal(found.name.includes('Trainer'), false);
});
