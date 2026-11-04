# ADR-0002: Pinned Gen 5 simulator and trusted-friends LAN stakes

## Status

Accepted for the local implementation branch, pending final user validation.
Builds on [ADR-0001](0001-local-profiles-and-lan-battles.md).

## Context

The user authorized end-to-end implementation, with validation at the end and
no new upstream PR until that validation. There is no neutral identity/wallet
service in the project. Implementing all Pokémon mechanics manually would add
substantial correctness risk. The full Showdown server package also includes
web/database components that the desktop plugin does not need.

## Decision

Use the exact, lockfile-pinned @pkmn/sim 0.10.13 extraction and bonjour-service
1.4.4, installed with lifecycle scripts disabled. Keep those optional runtime
dependencies in the user's cache rather than the plugin's watched source tree.
Keep QML as presentation; a private local Node service handles trainer state,
LAN transport and the simulator. The existing Python writer remains the sole
wallet mutation path, with absorb's lock and atomic write.

Use mutual code confirmation over TLS 1.3 for first pairing and certificate
pinning for reconnect. Use simultaneous move commitments, joint seed commitments,
engine-state checkpoints and durable journals. Preserve completed archives so a
late peer can recover after a later room has been created.

Implement only the explicit trusted-friends stake model. Friendly remains the
default. Both users must accept a stake. Reserve funds before readiness; settle
idempotently by matchId after matching results, then exchange settlement receipts.
Do not refund or award on a unilateral network timeout. Keep prizes separate from
lifetimeTokens and growth. Persist an intent before wallet reservation to recover
an interrupted cross-file operation.

## Consequences

Node 22+, npm and OpenSSL are required for Trainer/LAN, but existing core
collection/Shop features retain their original runtime. No public server,
telemetry, account system or firewall changes are introduced. Local saves remain
editable by their owner; this implementation does not claim competitive anti-cheat
or globally enforceable balances. An uncooperative peer can leave a stake pending.
A neutral-authority mode would require a separate future design.

Tests cover separate service processes, multicast discovery, replay and stake
recovery. Physical two-device Wi-Fi validation is left to the final user check.
The branch remains local and no new PR is opened before that validation.
