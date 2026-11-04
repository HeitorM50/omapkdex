# Trainer profiles and LAN battles

This branch implements local trainer profiles, teams and Gen 5 3v3 battles
(each player brings 3 of a team of up to 6) between two Omarchy installations. Friendly battles use no tokens;
optional stakes use the plugin's virtual wallet, never provider credits or real money.

## Install the optional battle runtime

The original collection, growth and Shop remain Python/QML features. Trainer
and LAN features additionally need Node.js 22+, npm and OpenSSL. From the plugin
checkout, run:

```bash
node battle/setup.mjs
```

Or enable **Battle system** in Trainer; it installs the runtime when needed. The installer uses the
committed lockfile and `npm ci --ignore-scripts --omit=optional`; dependencies
live under `$XDG_CACHE_HOME/omarchy/io.github.heitorm50.omapkdex/battle-runtime`
(or `~/.cache/...`), outside the hot-reloaded plugin directory. No dependency
lifecycle script executes. A development checkout can instead run
`npm ci --ignore-scripts --omit=optional --prefix battle`.

Pinned runtime: `@pkmn/sim@0.10.13`, an MIT-licensed extraction of the Pokémon
Showdown simulator, and `bonjour-service@1.4.4` for mDNS/DNS-SD. We use the
simulator instead of rebuilding move effects, statuses, accuracy, priority,
immunities and PP rules. The smaller simulator extraction avoids the full
Showdown server's database and web-server dependencies. See the lockfile and
THIRD_PARTY_NOTICES.md for exact dependency identities and licensing.

## Start a battle

1. On both computers, open **Trainer**, set a display name and local ball avatar,
   and build a team of 3 to 6 individual Pokémon (the numbered circle adds or
   removes one). Teams use companionId, independently of the pinned bar sprite;
   one Pokémon per species (Species Clause). Eggs, released individuals and
   unrevealed Ditto are ineligible. **Edit moves** chooses 1 to 4 moves from what
   the Pokémon would have learned by its level (Gen 5 level-up moves, including
   its pre-evolutions); OHKO moves, Double Team and Minimize are not offered.
2. On the host, open **Battle** and select the LAN interface and port (default
   47853). Battles always use real levels. Leave stake at zero for a friendly
   match; a nonzero stake requires accepting the trusted-friends notice.
3. Click **Create LAN room**. On the other computer, use **Find LAN rooms**, or
   enter the host's local IP and port manually. This does not scan the network.
4. Compare the displayed pairing code on both computers and confirm it on
   **both**. Profiles and Pokémon are not exchanged before pairing.
5. Review the level format and stake, then accept the rules and lock the selected
   Pokémon on both sides. Stake acceptance is explicit for each player.
6. Choose a move each turn. Both peers commit before either choice is revealed.
   The result is independently simulated and checked by both peers. The UI shows
   temporary HP, PP, status, battle events and the result.

Discovery may fail on guest Wi-Fi, isolated clients, VLANs or blocked multicast.
Manual connection still requires actual network connectivity and an allowed host
port. The plugin never changes firewall or router settings automatically.
IPv4 private/loopback/link-local and IPv6 local/ULA/link-local addresses are
accepted; public addresses and DNS hostnames are not accepted as manual targets.

The local service starts only when Trainer/Battle is opened. It listens on a
private, user-owned Unix control socket. LAN listening and discovery start only
through the explicit room/discovery actions. Closing the popup leaves a room or
match available; use **Close / cancel room** to stop its LAN sockets and adverts.
For an idle/finalized service, `node battle/cli.mjs stop` also stops the local
helper. It refuses to discard an unresolved staked match.

## Pokémon and rules

Teams are frozen at readiness: reached species, deterministic IVs, nature,
ability, gender, shiny flag, level and the chosen moves (default: the last four
level-up moves). The existing Profile.js and Collection.js projections provide
identity, level and IV rules. The battle data layer is Gen 5; this can differ
from modern base stats shown in PokéAPI species details. Battles use the
individual's growth-derived level; EVs are zero and held items are absent. No
Mega Evolution or Dynamax. Collection records are not modified by battle
damage, surrender or results.

Format: `[Gen 5] Custom Game` with Team Preview, Picked Team Size = 3, Species
Clause, Sleep Clause Mod, OHKO Clause, Evasion Moves Clause and Endless Battle
Clause. At team preview both players see the other's six and pick three in
order; the first leads. Each decision point is a *round*: both sides choose
(`team 123`, `move 2`, `switch 3`) at preview and on a normal turn, only the
owner of a fainted Pokémon chooses a replacement. Choices are committed and
revealed together whenever both sides choose. Both clients simulate the whole
battle, so each holds the other's full team; the UI shows only what has been
revealed, which fits the trusted-friends model but is not anti-cheat.

Protocol 2 replaces the 1×1 protocol: peers on the older version are rejected
and matches saved by it cannot be resumed.

The full generation engine resolves mechanics. Both sides use the same pinned
runtime and protocol. A battle ends by knockout, surrender, engine tie, or the
300-turn cap. Surrender requires confirmation. PP exhaustion uses Struggle.
Only validated Gen 5 species, abilities, moves, IVs and formats reach the engine;
unknown simulator fields, remote paths and arbitrary URLs are discarded/rejected.

Sprites use the existing local cache, including shiny GIFs. A paired, validated
opponent species can trigger the existing allowlisted sprite downloader. Missing
images remain a local placeholder while fetching; battle simulation and wallet
operations do not depend on that download succeeding.

## Practice, timer and replays

**Practice vs CPU** plays a full 3v3 locally, with no network, wallet or history
entry. The CPU builds a team of five Gen 5 Pokémon at your team's average level
(fully evolved, no legendaries, default moves), picks three at preview and chooses
moves by expected damage (type effectiveness, STAB, accuracy), switching out when
clearly outmatched. It uses the same engine and journal, so a practice battle
survives a restart.

**Turn timer** (Options when creating a room: off, 30 s, 60 s, 2 min, 3 min; part
of the agreed rules). When your time runs out the simulator's default choice is
played for you (first usable move, first healthy replacement, the first three at
preview). If the opponent never chooses and is gone, after the timer plus a short
grace period the waiting player can **claim the win**. The claim is stored in the
journal and verified by the other peer when it reconnects (same round, and that
peer had not chosen); it is refused while the other side can still choose. This is
a courtesy between friends, not anti-cheat.

**Replays:** after a match, **Watch replay** steps through the saved journal round
by round (« Start, ‹ Prev, Next ›, End »); Trainer → Recent battles also has a
**Replay** button. **Save replay log** writes the public battle log in the
Showdown protocol format to `battle-replays/<matchId>.log` with the trainers'
names. Old 1v1 journals cannot be replayed.

## Stakes: trusted friends, with durable recovery

This is a **trusted-friends LAN** implementation. TLS and replay verification
protect transport and detect divergent results. They cannot stop a player who
edits or rolls back their own wallet/collection, modifies their client or refuses
to cooperate. No neutral wallet authority or competitive anti-cheat is claimed.

Stakes are integers from 1 to 1B virtual tokens. Friendly is the default. Each
player reserves their own stake before sending readiness. The wallet calculation
used by both Shop and battle is:

```
available = max(0, lifetimeTokens - spentTokens + battleNet - reservedStakes)
```

A win adds the opponent's stake to battleNet; a loss subtracts the player's
stake; a draw or agreed pre-start cancellation changes battleNet by zero. The
own reservation is released at settlement. No fee is charged. The two available
balances are conserved after a completed match. Prizes never increase
lifetimeTokens or Pokémon growth, and do not directly advance the RNGesus Meter; later package purchases count normally.

All wallet mutations go through `omapkdex-battle-wallet`, which uses the same
flock and atomic state writer as growth and Shop purchases. A matchId settles
once; a conflicting replay is rejected. A reserved stake cannot be spent in the
Shop or reserved for another match. Prepared offers persist before reservation,
so recovery can complete the offer after a crash between the two file writes.

Disconnects never auto-refund or auto-award stakes. **Reconnect saved match**
uses the pinned peer identity, same seed, locked snapshots and durable turn
journal; an address or port can be updated if needed. Moves committed before a
restart remain committed. Result hashes cover the engine state, excluding wall
clock log timestamps. Peers acknowledge durable settlement before the UI treats
a staked room as fully complete.

A pre-start staked cancellation requires both peers, even if only one was ready.
An active staked match ends by battle, draw or surrender; it cannot be unilaterally
cancelled for a refund. If a result is saved on only one side, reconnect the same
match to finish the idempotent settlement. Old match journals are retained; use
**Recover** beside a history entry to reopen its saved room/result, coordinating
with the other player. This also works after another room was created. Close any
current room first. Neither peer should delete the journal or restore only one
wallet while a stake is pending. Upstream's abandoned-reservation recovery is
preserved: after seven days without the opponent, closing the disconnected room
can void its local reservation without minting tokens. Before that deadline it
refuses to release the stake.

## Local data and privacy

Existing state, collection, companion IDs, inventory, Pokédex and growth are not
reset. Additional files in the plugin's state directory:

- `trainer.json`: local identity, display name, avatar and team members/move selections.
- `battle-session.json` and `battle-matches/<matchId>.json`: current and archived
  recovery journals, snapshots, commitments and outcomes.
- `battle-history.json`: idempotent finalized results for trainer stats.
- `battle-private/`: certificate/private key and local service log.
- `state.json` gains optional battleNet, battleEscrows and battleSettled fields.

New profile/history/journal files use mode 0600; private directories use 0700.
The control socket is user-owned and mode 0600. The network sees an anonymous
room ID and protocol version during discovery, then the paired trainer summary,
selected snapshot, moves and agreed stake. AI usage records, full collection,
wallet totals, local paths and private keys are not transmitted.

TLS 1.3 uses per-installation self-signed certificates. Initial trust comes from
comparing a channel-bound pairing code; reconnects pin the saved certificate
fingerprint. Discovery is not authentication. Frames, message rates, sequence
numbers, rules, snapshots, turn commitments and result checkpoints are bounded
and validated. The helper never accepts a peer-provided shell command or path.

## Validation

From a checkout with the pinned battle dependencies installed:

```bash
python3 tests/run.py
npm audit --omit=dev --prefix battle
```

The suites use synthetic records and temporary state, not the player's wallet.
They cover profile persistence and individual identity, deterministic Gen 5
replays, wallet conservation/idempotence and Shop reservation exclusion, private
IPC, mDNS discovery, TLS pairing, committed moves, disconnect/reload, agreed
cancellation, archived-result recovery, malformed frames and independent service
processes completing and recovering a staked battle.

Quickshell fixtures and an actual BattleAgent-to-service run verify the Trainer,
lobby and battle screens, without a real stake or collection mutation. Final
user validation should additionally use two physical Omarchy computers on the
intended Wi-Fi; the automated end-to-end peers run as separate local processes.
