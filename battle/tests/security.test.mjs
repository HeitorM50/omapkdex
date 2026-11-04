import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { Frames, localIP } from '../wire.mjs';
import { validateSnapshot } from '../profile.mjs';
test('network boundary rejects public addresses and oversized or malformed frames', () => {
  for (const ip of ['127.0.0.1', '192.168.1.2', '10.1.2.3', '172.16.0.1', '::1', 'fd12::1', 'fe80::1%eth0'])
    assert.equal(localIP(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.15.0.1', 'example.com', 'file:///tmp/file', 'not-ip'])
    assert.equal(localIP(ip), false, ip);
  const socket = new PassThrough(),
    frames = new Frames(socket, 20);
  let error = '';
  frames.on('fault', (e) => (error = e.message));
  socket.write('x'.repeat(21));
  assert.equal(error, 'Message too large');
  const bad = new PassThrough(),
    parsed = new Frames(bad);
  parsed.on('fault', (e) => (error = e.message));
  bad.write('{bad}\n');
  assert.match(error, /JSON|property/i);
});
test('arbitrary simulator properties and foreign species cannot become a snapshot', () => {
  assert.throws(() =>
    validateSnapshot(
      {
        companionId: 'fake',
        speciesId: 25,
        set: { species: 'Pikachu', level: 100, nature: 'hardy', ability: 'Wonder Guard', moves: ['fissure'] },
      },
      'level50',
    ),
  );
});
