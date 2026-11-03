# Changelog

## Unreleased

### Added
- Poor (50M), Fancy (200M) and Legendary (500M) packages with visible weighted odds and pixel-art opening animations.
- Item rarities, including Mythic Legendary Egg; Legendary packages exclude Common rewards.
- Turbo Incubator and Lucky Clover consumables, and eggs reserved for a natural hatch without replacing the current Pokémon.
- Independent, persisted RNGesus meters (2B/3B/4B) with a Legendary/Mythic guarantee on the opening after the cap.
- Offline, checkout-relative test runner and synthetic usage fixtures.

### Changed
- Replace direct Shop rows with package selection; retain legacy direct-purchase CLI support and the 50M `surprisePack` alias.
- Store the charge, inventory reward, receipt and meter update together using the existing lock and atomic write.
- Keep existing saves, Pokémon, Pokédex entries, items and wallet history compatible; no migration or reset required.
