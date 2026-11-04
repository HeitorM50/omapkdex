import tls from 'node:tls';
import { networkInterfaces, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { TrainerStore, roster, snapshot, validateSnapshot } from './profile.mjs';
import { ROOT, readJSON, writeJSON, text, integer, id } from './storage.mjs';
import { identity, Frames, secureOptions, fingerprint, pairCode, localIP, connectTLS } from './wire.mjs';
import { Discovery } from './discovery.mjs';
import { MatchEngine } from './engine.mjs';
import { wallet } from './wallet.mjs';
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const MODES = ['level50', 'natural'];
const ENGINE = 'gen5-pkmn-0.10.13-v1';
export class LanSession extends EventEmitter {
  constructor(dir, { discovery = true } = {}) {
    super();
    this.dir = dir;
    this.trainer = new TrainerStore(dir);
    this.keys = identity(dir);
    this.file = join(dir, 'battle-session.json');
    this.s = readJSON(this.file, null);
    this.engine = null;
    this.peer = null;
    this.server = null;
    this.sockets = new Set();
    this.discovery = discovery ? new Discovery() : null;
    this.error = '';
    this.queue = Promise.resolve();
    this.seq = 0;
    this.received = 0;
    this.sentHash = '';
    this.seedSent = false;
    this.revealSent = '';
    if (this.s && this.s.phase !== 'finished' && this.s.phase !== 'closed') this.s.phase = 'disconnected';
    if (this.s?.seed) this.replay();
    this.heartbeat = setInterval(() => {
      if (!this.peer) return;
      if (Date.now() - this.lastSeen > 30000) this.peer.close();
      else this.send('ping', {});
    }, 10000);
    this.heartbeat.unref();
  }
  enqueue(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }
  archive() {
    if (this.s?.matchId) writeJSON(join(this.dir, 'battle-matches', id(this.s.matchId) + '.json'), this.s);
  }
  save() {
    if (this.s) {
      writeJSON(this.file, this.s);
      this.archive();
    }
    this.emit('changed');
  }
  interfaces() {
    return Object.values(networkInterfaces())
      .flat()
      .filter((a) => a && localIP(a.address))
      .map((a) => a.address)
      .filter((a, i, all) => all.indexOf(a) === i)
      .sort(
        (a, b) => Number(a === '::1' || a.startsWith('127.')) - Number(b === '::1' || b.startsWith('127.')),
      );
  }
  battleView() {
    if (!this.engine) return null;
    const view = this.engine.view(),
      cache = join(
        process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
        'omarchy/io.github.heitorm50.omapkdex/sprites',
      );
    view.players = view.players.map((mon) => {
      const base = String(mon.speciesId) + (mon.shiny ? '-shiny' : '');
      const file = ['gif', 'png'].map((ext) => join(cache, base + '.' + ext)).find(existsSync);
      return { ...mon, sprite: file ? 'file://' + file : '' };
    });
    return view;
  }
  warmSprite(mon) {
    const args = ['sprites', String(mon.speciesId)];
    if (mon.set.shiny) args.push('--shiny');
    // Only validated species IDs reach the existing allowlisted HTTP helper.
    if (process.env.OMAPKDEX_BATTLE_OFFLINE === '1') return;
    execFile(join(ROOT, 'bin/omapkdex-sync'), args, { timeout: 30000 }, () => {});
  }
  async status() {
    const w = await wallet(this.dir);
    return {
      profile: this.trainer.get(),
      roster: roster(this.dir).map(({ entry, ...r }) => r),
      stats: this.trainer.stats(),
      history: this.trainer.history().slice(0, 30),
      wallet: {
        available: w.available,
        reserved: Object.values(w.reservations).reduce((s, r) => s + r.amount, 0),
        net: w.net,
      },
      interfaces: this.interfaces(),
      rooms: this.discovery?.list() || [],
      discoveryError: this.discovery?.error || '',
      error: this.error,
      session: this.s
        ? {
            matchId: this.s.matchId,
            phase: this.s.phase,
            role: this.s.role,
            host: this.s.host,
            port: this.s.port,
            rules: this.s.rules,
            pairCode: this.code || '',
            paired: !!this.s.paired,
            peer: this.s.theirOffer?.trainer || null,
            ownReady: !!this.s.ownOffer,
            peerReady: !!this.s.theirOffer,
            waiting: !!this.s.choice,
            verified: this.s.verifiedTurns === this.s.turns.length && !!this.s.initialVerified,
            battle: this.battleView(),
            outcome: this.s.outcome || null,
            settled: !!this.s.settled,
            pendingStake: !!this.s.rules?.stake && !this.s.settled && !!this.s.ownOffer,
          }
        : null,
    };
  }
  async command(op, data = {}) {
    return this.enqueue(async () => {
      if (op !== 'status') this.error = '';
      await this.recoverReservation();
      if (op === 'profile') this.trainer.update(data);
      else if (op === 'scan') this.discovery?.scan();
      else if (op === 'host') await this.host(data);
      else if (op === 'join') await this.join(data);
      else if (op === 'pair') {
        if (!this.peer || !this.code) throw Error('No peer to pair');
        this.s.localPair = true;
        this.send('pair', {});
        await this.maybePaired();
      } else if (op === 'ready') await this.ready(data);
      else if (op === 'move') await this.choose(data.slot);
      else if (op === 'forfeit') await this.forfeit();
      else if (op === 'resume') await this.resume(data);
      else if (op === 'recover') {
        this.canReplace();
        this.archive();
        const saved = readJSON(join(this.dir, 'battle-matches', id(data.matchId) + '.json'), null);
        if (!saved || !saved.paired) throw Error('No saved peer for that match');
        await this.resetTransport();
        this.s = saved;
        this.s.phase = 'disconnected';
        if (this.s.seed) this.replay();
        this.save();
        await this.resume(data);
      } else if (op === 'close') await this.closeRoom();
      else if (op !== 'status') throw Error('Unknown battle command');
      return this.status();
    });
  }
  canReplace() {
    if (this.s && !['finished', 'closed'].includes(this.s.phase))
      throw Error('Close or resume the current room first');
    if (this.s?.rules.stake && this.s.ownOffer && !this.s.settled)
      throw Error('A stake is still pending; resume that match');
  }
  async host(data) {
    this.canReplace();
    this.archive();
    await this.resetTransport();
    const host =
      data.host || this.interfaces().find((ip) => !ip.startsWith('127.') && ip.includes('.')) || '127.0.0.1';
    if (!this.interfaces().includes(host)) throw Error('Choose one of this computer’s local interfaces');
    const mode = data.mode || 'level50';
    if (!MODES.includes(mode)) throw Error('Unknown battle format');
    const stake = integer(data.stake || 0, 0, 1000000000);
    if (stake && !data.trustedStakesAccepted) throw Error('Accept the trusted-friends stake rules');
    this.s = {
      schemaVersion: 1,
      matchId: randomUUID(),
      role: 0,
      host,
      port: integer(data.port ?? 47853, 0, 65535),
      rules: { version: 1, mode, stake },
      phase: 'waiting',
      turns: [],
      forfeits: [false, false],
      ownSeed: randomBytes(16).toString('hex'),
      verifiedTurns: 0,
    };
    await this.listen();
    this.save();
  }
  async listen() {
    const server = tls.createServer(secureOptions(this.keys), (socket) => {
      if (!localIP(socket.remoteAddress) || this.peer) {
        socket.destroy();
        return;
      }
      try {
        this.attach(socket);
      } catch (e) {
        socket.destroy();
        this.fail(e);
      }
    });
    server.maxConnections = 3;
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    server.on('tlsClientError', () => {});
    server.on('error', (e) => this.fail(e));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.s.port, this.s.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.s.port = server.address().port;
    this.discovery?.advertise(this.s.port, this.s.matchId, this.s.host);
  }
  async join(data) {
    this.canReplace();
    this.archive();
    await this.resetTransport();
    if (!localIP(data.host)) throw Error('Enter a local IP address');
    const port = integer(data.port, 1, 65535);
    this.s = {
      schemaVersion: 1,
      role: 1,
      host: data.host,
      port,
      matchId: '',
      phase: 'connecting',
      turns: [],
      forfeits: [false, false],
      ownSeed: randomBytes(16).toString('hex'),
      verifiedTurns: 0,
    };
    this.save();
    await this.connect();
  }
  async connect() {
    const socket = connectTLS(this.keys, this.s.host, this.s.port);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(Error('Connection timed out; check address, port and firewall'));
      }, 8000);
      socket.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        try {
          this.attach(socket);
          resolve();
        } catch (e) {
          socket.destroy();
          reject(e);
        }
      });
    });
  }
  attach(socket) {
    const fp = fingerprint(socket);
    if (this.s.peerFingerprint && this.s.peerFingerprint !== fp)
      throw Error('Peer identity changed. Existing match cannot be resumed with another peer.');
    this.peerFingerprint = fp;
    this.code = pairCode(socket);
    this.seq = 0;
    this.received = 0;
    this.sentHash = '';
    this.seedSent = false;
    this.resumeReceived = false;
    this.seedReceived = false;
    this.revealSent = '';
    this.lastSeen = Date.now();
    const frames = new Frames(socket);
    this.peer = frames;
    socket.setKeepAlive(true, 1000);
    this.peer.on('message', (m) =>
      this.enqueue(() => this.receive(m)).catch((e) => {
        this.fail(e);
        this.peer?.close();
      }),
    );
    this.peer.on('fault', (e) => this.fail(e));
    this.peer.on('closed', () => {
      if (this.peer !== frames) return;
      this.peer = null;
      this.code = '';
      if (this.s && !['finished', 'closed'].includes(this.s.phase)) {
        this.s.phase = 'disconnected';
        this.save();
      }
    });
    this.s.phase = this.s.paired ? 'reconnecting' : 'pairing';
    this.send('hello', {
      protocol: 1,
      engine: ENGINE,
      matchId: this.s.role === 0 ? this.s.matchId : null,
      resume: !!this.s.paired,
    });
    this.save();
  }
  send(type, payload) {
    if (this.peer) this.peer.send({ v: 1, matchId: this.s.matchId, type, seq: ++this.seq, payload });
  }
  fail(e) {
    this.error = e.message || String(e);
    this.emit('changed');
  }
  async receive(m) {
    if (
      !m ||
      m.v !== 1 ||
      !Number.isSafeInteger(m.seq) ||
      m.seq !== this.received + 1 ||
      typeof m.type !== 'string' ||
      !m.payload ||
      typeof m.payload !== 'object'
    )
      throw Error('Invalid or replayed protocol message');
    if (this.received === 0 && m.type !== 'hello') throw Error('Protocol hello required');
    this.received = m.seq;
    this.lastSeen = Date.now();
    const p = m.payload;
    if (m.type === 'hello') {
      if (this.received !== 1) throw Error('Repeated protocol hello');
      if (p.protocol !== 1 || p.engine !== ENGINE) throw Error('Incompatible battle protocol');
      if (this.s.role === 1) {
        id(p.matchId);
        if (this.s.matchId && this.s.matchId !== p.matchId) throw Error('Different match');
        this.s.matchId = p.matchId;
      } else if (p.matchId && p.matchId !== this.s.matchId) throw Error('Different match');
      if (this.s.paired) {
        if (!p.resume) throw Error('Opponent lost the saved session');
        this.sendResume();
      }
      this.save();
      return;
    }
    if (m.matchId !== this.s.matchId) throw Error('Wrong match ID');
    if (m.type === 'ping') return;
    if (!this.s.paired) {
      if (m.type !== 'pair') throw Error('Confirm the pairing code on both computers first');
      this.s.remotePair = true;
      await this.maybePaired();
      return;
    }
    if (m.type === 'pair') return;
    if (m.type === 'offer') await this.acceptOffer(p);
    else if (m.type === 'rules') {
      if (this.s.role !== 1 || this.s.ownOffer || !MODES.includes(p.mode) || p.version !== 1)
        throw Error('Invalid room rules');
      integer(p.stake, 0, 1000000000);
      this.s.rules = { version: 1, mode: p.mode, stake: p.stake };
      this.save();
    } else if (m.type === 'seed') {
      if (
        !this.s.theirOffer ||
        typeof p.seed !== 'string' ||
        !/^[a-f0-9]{32}$/.test(p.seed) ||
        hash(p.seed) !== this.s.theirOffer.seedCommit
      )
        throw Error('Invalid battle randomness commitment');
      if (this.seedReceived) return;
      this.seedReceived = true;
      this.s.remoteSeed = p.seed;
      this.startEngine();
    } else if (m.type === 'commit') {
      if (!this.engine || p.turn !== this.engine.view().turn || !/^[a-f0-9]{64}$/.test(p.hash))
        throw Error('Invalid turn commitment');
      if (this.s.remoteCommit && this.s.remoteCommit !== p.hash)
        throw Error('Cannot change a committed turn');
      this.s.remoteCommit = p.hash;
      this.save();
      this.reveal();
    } else if (m.type === 'reveal') {
      if (
        !this.engine ||
        p.turn !== this.engine.view().turn ||
        typeof p.nonce !== 'string' ||
        !/^[a-f0-9]{32}$/.test(p.nonce) ||
        hash([this.s.matchId, p.turn, p.slot, p.nonce]) !== this.s.remoteCommit
      )
        throw Error('Invalid revealed turn');
      integer(p.slot, 1, 4);
      this.s.remoteChoice = { slot: p.slot, nonce: p.nonce };
      this.applyTurn();
    } else if (m.type === 'checkpoint') await this.checkpoint(p);
    else if (m.type === 'settled') {
      if (p.hash !== this.currentHash() || (!this.s.cancelled && !this.engine?.view().finished))
        throw Error('Invalid settlement receipt');
      this.s.peerSettled = true;
      if (!this.s.settled) await this.finalize();
      else {
        this.s.phase = this.s.cancelled ? 'closed' : 'finished';
        this.save();
      }
    } else if (m.type === 'resume') {
      if (this.resumeReceived) throw Error('Repeated resume state');
      this.resumeReceived = true;
      await this.acceptResume(p);
    } else if (m.type === 'forfeit') {
      if (!this.engine || (this.engine.view().finished && !this.s.forfeits.some(Boolean)))
        throw Error('No active battle');
      this.s.forfeits[1 - this.s.role] = true;
      this.replay();
      this.s.phase = 'verifying';
      this.save();
      this.sendCheckpoint();
    } else if (m.type === 'cancel') {
      if (this.engine) throw Error('An active battle must end by battle or surrender');
      this.s.cancelled = true;
      this.s.phase = 'verifying';
      this.save();
      this.sendCheckpoint();
    } else throw Error('Unknown protocol action');
  }
  async maybePaired() {
    if (!this.s.localPair || !this.s.remotePair) return;
    this.s.paired = true;
    this.s.peerFingerprint = this.peerFingerprint;
    this.s.phase = 'lobby';
    this.save();
    if (this.s.role === 0) this.send('rules', this.s.rules);
  }
  publicTrainer() {
    const p = this.trainer.get();
    return { trainerId: p.trainerId, displayName: p.displayName, avatarKey: p.avatarKey };
  }
  async recoverReservation() {
    if (!this.s?.reservationIntent) return;
    const w = await wallet(this.dir),
      entry = w.reservations[this.s.matchId];
    if (entry) {
      if (
        entry.amount !== this.s.rules.stake ||
        entry.rulesHash !== hash(this.s.rules) ||
        entry.opponent !== this.s.peerFingerprint
      )
        throw Error('Reservation does not match saved room');
      this.s.ownOffer = this.s.reservationIntent;
    }
    delete this.s.reservationIntent;
    this.save();
  }
  async ready(data) {
    if (this.s?.phase !== 'lobby' || !this.s.rules || this.s.ownOffer)
      throw Error('Wait for pairing and room rules');
    const profile = this.trainer.get(),
      selected = profile.selectedCompanionId;
    const mon = snapshot(this.dir, selected, this.s.rules.mode),
      rulesHash = hash(this.s.rules);
    const offer = {
      trainer: this.publicTrainer(),
      snapshot: mon,
      rulesHash,
      seedCommit: hash(this.s.ownSeed),
    };
    if (this.s.rules.stake) {
      if (!data.trustedStakesAccepted)
        throw Error('Both players must explicitly accept this trusted-friends stake');
      this.s.reservationIntent = offer;
      this.save();
      try {
        await wallet(this.dir, 'reserve', {
          matchId: this.s.matchId,
          amount: this.s.rules.stake,
          rulesHash,
          opponent: this.s.peerFingerprint,
        });
      } catch (e) {
        delete this.s.reservationIntent;
        this.save();
        throw e;
      }
    }
    this.s.ownOffer = offer;
    delete this.s.reservationIntent;
    this.save();
    this.send('offer', this.s.ownOffer);
    this.revealSeed();
  }
  async acceptOffer(p) {
    if (!this.s.rules || p.rulesHash !== hash(this.s.rules) || !/^[a-f0-9]{64}$/.test(p.seedCommit))
      throw Error('Rules do not match');
    text(p.trainer?.displayName);
    id(p.trainer?.trainerId);
    if (!['pokeball', 'greatball', 'ultraball'].includes(p.trainer.avatarKey))
      throw Error('Invalid trainer avatar');
    const clean = {
      trainer: {
        trainerId: p.trainer.trainerId,
        displayName: p.trainer.displayName,
        avatarKey: p.trainer.avatarKey,
      },
      snapshot: validateSnapshot(p.snapshot, this.s.rules.mode),
      rulesHash: p.rulesHash,
      seedCommit: p.seedCommit,
    };
    if (this.s.theirOffer && hash(clean) !== hash(this.s.theirOffer))
      throw Error('Opponent changed the locked Pokémon');
    if (!this.s.theirOffer) this.warmSprite(clean.snapshot);
    this.s.theirOffer = clean;
    this.save();
    this.revealSeed();
  }
  revealSeed() {
    if (this.s.ownOffer && this.s.theirOffer && !this.seedSent && !this.s.cancelled) {
      this.seedSent = true;
      this.send('seed', { seed: this.s.ownSeed });
      this.startEngine();
    }
  }
  startEngine() {
    if (this.s.cancelled || !this.s.remoteSeed || !this.s.ownOffer || !this.s.theirOffer) return;
    if (!this.s.seed) {
      const seeds =
          this.s.role === 0 ? [this.s.ownSeed, this.s.remoteSeed] : [this.s.remoteSeed, this.s.ownSeed],
        bytes = Buffer.from(hash(seeds), 'hex');
      this.s.seed = [0, 2, 4, 6].map((n) => bytes.readUInt16BE(n));
      this.s.players =
        this.s.role === 0
          ? [this.s.ownOffer.snapshot, this.s.theirOffer.snapshot]
          : [this.s.theirOffer.snapshot, this.s.ownOffer.snapshot];
    }
    if (!this.engine) this.replay();
    if (this.incomingTurns) {
      this.adoptTurns(this.incomingTurns);
      this.incomingTurns = null;
    }
    if (this.s.phase !== 'active') this.s.phase = 'verifying';
    this.save();
    this.sendCheckpoint();
  }
  replay() {
    this.engine?.destroy();
    this.engine = new MatchEngine(this.s.players, this.s.seed, this.s.rules.mode);
    for (const turn of this.s.turns) {
      this.engine.turn(turn.actions);
      if (this.engine.digest() !== turn.hash) throw Error('Saved battle replay does not match');
    }
    if (this.s.forfeits.every(Boolean)) this.engine.battle.tie();
    else if (this.s.forfeits.some(Boolean)) this.engine.forfeit(this.s.forfeits[0] ? 0 : 1);
  }
  async choose(slot) {
    if (
      !this.peer ||
      !this.engine ||
      this.s.phase !== 'active' ||
      this.engine.view().finished ||
      this.s.choice ||
      this.s.verifiedTurns !== this.s.turns.length
    )
      throw Error('Wait for the peer and the next turn');
    const options = this.engine.view().players[this.s.role].moves,
      m = options[integer(slot, 1, options.length) - 1];
    if (m.disabled || (m.pp <= 0 && m.id !== 'struggle')) throw Error('Move unavailable');
    const turn = this.engine.view().turn,
      nonce = randomBytes(16).toString('hex');
    this.s.choice = { slot, turn, nonce, hash: hash([this.s.matchId, turn, slot, nonce]) };
    this.save();
    this.send('commit', { turn, hash: this.s.choice.hash });
    this.reveal();
  }
  reveal() {
    if (this.s.choice && this.s.remoteCommit && this.revealSent !== this.s.choice.hash) {
      this.revealSent = this.s.choice.hash;
      this.send('reveal', { turn: this.s.choice.turn, slot: this.s.choice.slot, nonce: this.s.choice.nonce });
      this.applyTurn();
    }
  }
  applyTurn() {
    if (!this.s.choice || !this.s.remoteChoice || this.s.cancelled) return;
    const actions =
      this.s.role === 0
        ? [this.s.choice.slot, this.s.remoteChoice.slot]
        : [this.s.remoteChoice.slot, this.s.choice.slot];
    this.engine.turn(actions);
    this.s.turns.push({ actions, hash: this.engine.digest() });
    delete this.s.choice;
    delete this.s.remoteChoice;
    delete this.s.remoteCommit;
    this.revealSent = '';
    this.s.phase = 'verifying';
    this.save();
    this.sendCheckpoint();
  }
  currentHash() {
    return this.s.cancelled ? hash(['void', this.s.matchId, this.s.rules]) : this.engine?.digest();
  }
  sendCheckpoint() {
    const digest = this.currentHash();
    if (!digest) return;
    const key = this.s.turns.length + ':' + digest;
    if (this.sentHash === key) return;
    this.sentHash = key;
    this.send('checkpoint', { index: this.s.turns.length, hash: digest });
  }
  async checkpoint(p) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index > 300 || !/^[a-f0-9]{64}$/.test(p.hash))
      throw Error('Invalid checkpoint');
    if (p.index > this.s.turns.length) {
      this.pendingCheckpoint = p;
      return;
    }
    if (p.index < this.s.turns.length) return;
    if (p.hash !== this.currentHash()) {
      if (!this.currentHash()) {
        this.pendingCheckpoint = p;
        return;
      }
      throw Error('Battle states disagree; stakes remain reserved');
    }
    this.s.verifiedTurns = p.index;
    this.s.initialVerified = true;
    if (this.s.cancelled || this.engine?.view().finished) await this.finalize();
    else {
      this.s.phase = 'active';
      this.save();
    }
  }
  async finalize() {
    const v = this.engine?.view(),
      winner = v?.winner;
    const outcome = this.s.cancelled
      ? 'void'
      : winner === null
        ? 'draw'
        : winner === this.s.role
          ? 'win'
          : 'loss';
    if (this.s.rules.stake && this.s.ownOffer)
      await wallet(this.dir, 'settle', { matchId: this.s.matchId, outcome, resultHash: this.currentHash() });
    this.s.outcome = outcome;
    this.s.settled = true;
    this.s.phase = this.s.peerSettled ? (this.s.cancelled ? 'closed' : 'finished') : 'settling';
    if (!this.s.cancelled)
      this.trainer.record({
        matchId: this.s.matchId,
        result: outcome,
        opponent: this.s.theirOffer?.trainer.displayName || 'Trainer',
        stake: this.s.rules.stake,
        turns: this.s.turns.length,
      });
    this.save();
    this.send('settled', { hash: this.currentHash() });
  }
  async forfeit() {
    if (!this.peer || !this.engine || this.engine.view().finished)
      throw Error('Reconnect before surrendering');
    this.s.forfeits[this.s.role] = true;
    this.replay();
    this.s.phase = 'verifying';
    this.save();
    this.send('forfeit', {});
    this.sendCheckpoint();
  }
  sendResume() {
    this.send('resume', {
      rules: this.s.rules,
      offer: this.s.ownOffer || null,
      seed: this.s.theirOffer ? this.s.ownSeed : null,
      turns: this.s.turns,
      forfeits: this.s.forfeits,
      cancelled: !!this.s.cancelled,
    });
  }
  async acceptResume(p) {
    if (!this.s.paired) throw Error('Pairing required');
    if (!p.rules && this.s.role === 0 && !this.s.seed && !p.offer && !p.turns?.length) {
      this.s.phase = 'lobby';
      this.send('rules', this.s.rules);
      this.save();
      return;
    }
    if (this.s.rules && hash(this.s.rules) !== hash(p.rules)) throw Error('Saved rules changed');
    if (!this.s.rules) {
      if (!MODES.includes(p.rules?.mode)) throw Error('Invalid format');
      integer(p.rules.stake, 0, 1000000000);
      this.s.rules = p.rules;
    }
    if (p.offer) await this.acceptOffer(p.offer);
    if (p.seed) {
      if (!this.s.theirOffer || hash(p.seed) !== this.s.theirOffer.seedCommit) throw Error('Changed seed');
      this.s.remoteSeed = p.seed;
    }
    if (!Array.isArray(p.turns) || p.turns.length > 300) throw Error('Invalid replay length');
    if (
      !Array.isArray(p.forfeits) ||
      p.forfeits.length !== 2 ||
      p.forfeits.some((v) => typeof v !== 'boolean') ||
      (p.forfeits[this.s.role] && !this.s.forfeits[this.s.role])
    )
      throw Error('Invalid surrender history');
    this.s.forfeits[1 - this.s.role] ||= p.forfeits[1 - this.s.role];
    if (p.cancelled) {
      if (this.engine) throw Error('Cannot cancel a started game');
      this.s.cancelled = true;
    }
    this.incomingTurns = p.turns;
    this.startEngine();
    if (this.s.cancelled) {
      this.save();
      this.sendCheckpoint();
    }
    if (this.s.choice) {
      this.send('commit', { turn: this.s.choice.turn, hash: this.s.choice.hash });
      this.reveal();
    }
    if (this.pendingCheckpoint) {
      const pending = this.pendingCheckpoint;
      this.pendingCheckpoint = null;
      await this.checkpoint(pending);
    }
    if (!this.engine && !this.s.cancelled) {
      this.s.phase = 'lobby';
      this.save();
    }
  }
  adoptTurns(turns) {
    const common = Math.min(turns.length, this.s.turns.length);
    for (let i = 0; i < common; i++)
      if (hash(turns[i]) !== hash(this.s.turns[i])) throw Error('Divergent replay; stake remains pending');
    if (turns.length <= this.s.turns.length) return;
    if (this.s.choice && turns[this.s.turns.length].actions[this.s.role] !== this.s.choice.slot)
      throw Error('Replay changed your committed move');
    const before = this.s.turns;
    this.s.turns = turns;
    try {
      this.replay();
    } catch (e) {
      this.s.turns = before;
      this.replay();
      throw e;
    }
    delete this.s.choice;
    delete this.s.remoteCommit;
    delete this.s.remoteChoice;
    this.s.initialVerified = false;
    this.save();
  }
  async resume(data) {
    if (!this.s || this.peer) throw Error('No disconnected match');
    this.sentHash = '';
    this.s.phase = 'reconnecting';
    this.save();
    if (this.s.role === 0) {
      if (!this.server) {
        if (data.host) {
          if (!this.interfaces().includes(data.host)) throw Error('Choose a local interface');
          this.s.host = data.host;
        }
        if (data.port) this.s.port = integer(data.port, 1, 65535);
        await this.listen();
        this.save();
      }
    } else {
      if (data.host) {
        if (!localIP(data.host)) throw Error('Enter a local IP');
        this.s.host = data.host;
      }
      if (data.port) this.s.port = integer(data.port, 1, 65535);
      await this.connect();
    }
  }
  async closeRoom() {
    if (this.peer && this.engine && !this.engine.view().finished)
      throw Error('Finish or surrender before closing the battle');
    if (this.s?.rules?.stake && this.s.paired && this.s.settled && !this.s.peerSettled)
      throw Error('Result saved locally. Reconnect to confirm the opponent’s settlement.');
    if (this.s?.rules?.stake && this.s.paired && !this.s.settled) {
      if (!this.peer) throw Error('Reconnect to cancel this paired staked room or finish the match.');
      if (this.engine) throw Error('Finish or surrender before closing a staked match');
      this.s.cancelled = true;
      this.s.phase = 'verifying';
      this.save();
      this.send('cancel', {});
      this.sendCheckpoint();
      return;
    }
    if (this.s) {
      this.s.phase = 'closed';
      this.save();
    }
    await this.resetTransport();
    this.engine?.destroy();
    this.engine = null;
  }
  async resetTransport() {
    const peer = this.peer;
    this.peer = null;
    peer?.close();
    this.code = '';
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = null;
    if (server) await new Promise((resolve) => server.close(resolve));
    this.discovery?.close();
    this.engine?.destroy();
    this.engine = null;
  }
  async shutdown() {
    clearInterval(this.heartbeat);
    if (this.s && !['finished', 'closed'].includes(this.s.phase)) {
      this.s.phase = 'disconnected';
      this.save();
    }
    await this.resetTransport();
    this.engine?.destroy();
  }
}
