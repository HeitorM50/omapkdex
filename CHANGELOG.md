# Changelog

## Unreleased

### Added
- Current Trainer team builder with 3–6 individual Pokémon, legal level-up move editing, stats, type matchups and move-effect summaries.
- Gen 5 3v3 team preview, switching and forced replacements, plus local CPU practice, agreed turn timers and replay viewing/export.
- Rare Super Rare Candy grants 250M Pokémon growth without generating wallet tokens.
- Bag trade-up contracts: exchange 5 Common, 4 Uncommon, 3 Rare or 2 Legendary unreserved items for a chosen item of the next rarity, with confirmation and atomic inventory updates.
- Local Trainer profile, avatar, per-individual battle selection and match history.
- Pinned Gen 5 battle simulator, paired TLS LAN rooms, mDNS discovery and manual address connection.
- Committed simultaneous turns, restart/reconnect replay and archived-result recovery.
- Optional trusted-friends stakes with wallet escrow, atomic/idempotent settlement and peer receipts; no change to Pokémon growth.
- Poor (50M), Fancy (200M) and Legendary (500M) packages with visible weighted odds and pixel-art opening animations.
- Item rarities, including Mythic Legendary Egg; Fancy excludes Common rewards; Legendary excludes Common and Uncommon rewards.
- Turbo Incubator and Lucky Clover consumables, and eggs reserved for a natural hatch without replacing the current Pokémon.
- Independent, persisted RNGesus meters (2B/3B/4B) with a Legendary/Mythic guarantee on the opening after the cap.
- Offline, checkout-relative test runner and synthetic usage fixtures.

### Changed
- Replace the plain Egg reward with Fast Hatch: reserve 2× growth for the next generation, stacking with existing growth bonuses and preserving old Egg inventory.
- Use real Pokémon levels and battle protocol 2 for teams; both peers must update. Old 1v1 journals cannot be resumed or replayed by this engine.
- Refreshed Trainer/Battle screens, typed move controls and scrollable panel layout; Settings is the final tab.
- Trade-up inputs use an owned-inventory grid filtered by rarity; click to add, right-click to remove, with selected counts and protected-item indicators.
- Replace direct Shop rows with package selection; retain legacy direct-purchase CLI support and the 50M `surprisePack` alias.
- Store the charge, inventory reward, receipt and meter update together using the existing lock and atomic write.
- Keep existing saves, Pokémon, Pokédex entries, items and wallet history compatible; no migration or reset required.
