# Trainer profiles and LAN battles

This branch implements local trainer profiles, Pokémon selection and Gen 5
1×1 battles between two Omarchy installations. Friendly battles use no tokens;
optional stakes use the plugin's virtual wallet, never provider credits or real money.

## Install the optional battle runtime

The original collection, growth and Shop remain Python/QML features. Trainer
and LAN features additionally need Node.js 22+, npm and OpenSSL. From the plugin
checkout, run:

```bash
node battle/setup.mjs
```

Or click **Install / repair battle runtime** in Trainer. The installer uses the
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
   and select an individual Pokémon. Selection uses companionId, independently
   of the pinned bar sprite. Different individuals of the same species remain
   selectable. Eggs, released individuals and unrevealed Ditto are ineligible.
2. On the host, open **Battle** and select the LAN interface and port (default
   47853). Choose level 50 or real level. Leave stake at zero for a friendly
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

Snapshots are frozen at readiness: reached species, deterministic IVs, nature,
ability, gender, shiny flag, Gen 5 level-up moves and level. The existing
Profile.js and Collection.js projections provide identity, level and IV rules.
The battle data layer is Gen 5; this can differ from modern base stats displayed
in PokéAPI species details. Level-50 mode changes only the battle snapshot's
level; real-level mode retains the individual's growth-derived level. EVs are
zero and held items are absent. Each side has one Pokémon; no team switching,
Mega Evolution or Dynamax. The selected Pokémon's collection record is not
modified by battle damage, surrender or results.

The full generation engine resolves mechanics. Both sides use the same pinned
runtime and protocol. A battle ends by knockout, surrender, engine tie, or the
300-turn cap. Surrender requires confirmation. PP exhaustion uses Struggle.
Only validated Gen 5 species, abilities, moves, IVs and formats reach the engine;
unknown simulator fields, remote paths and arbitrary URLs are discarded/rejected.

Sprites use the existing local cache, including shiny GIFs. A paired, validated
opponent species can trigger the existing allowlisted sprite downloader. Missing
images remain a local placeholder while fetching; battle simulation and wallet
operations do not depend on that download succeeding.

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

Disconnects never auto-refund or auto-award stakes. The one exception is explicit:
if the opponent has not reconnected **7 days** after the reservation,
**Close / cancel room** voids the stake locally (outcome `void`, battleNet
unchanged) and frees the room. Before that, closing is refused and says how many
hours are left. A match voided this way cannot be settled later. **Reconnect saved match**
uses the pinned peer identity, same seed, locked snapshots and durable turn
journal; an address or port can be updated if needed. Moves committed before a
restart remain committed. Result hashes cover the engine state, excluding wall
clock log timestamps. Peers acknowledge durable settlement before the UI treats
a staked room as fully complete.

A pre-start staked cancellation requires both peers, even if only one was ready.
An active staked match ends by battle, draw or surrender; it cannot be unilaterally
cancelled for a refund while the opponent can still return (see the 7-day
expiry above). If a result is saved on only one side, reconnect the same
match to finish the idempotent settlement. Old match journals are retained; use
**Recover** beside a history entry to reopen its saved room/result, coordinating
with the other player. This also works after another room was created. Close any
current room first. Neither peer should delete the journal or restore only one
wallet while a stake is pending.

## Local data and privacy

Existing state, collection, companion IDs, inventory, Pokédex and growth are not
reset. Additional files in the plugin's state directory:

- `trainer.json`: local identity, display name, avatar and selected companionId.
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
