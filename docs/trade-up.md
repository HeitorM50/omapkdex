# Trade up

Open **Bag → Trade up**, choose the input rarity, add 10 items using +/−,
choose the output and confirm the review. Different items of the same rarity
can be combined. The result is guaranteed and costs no tokens:

Common → Uncommon → Rare → Legendary → Mythic.

Each step consumes 10 items and awards one item of the next rarity. Mythic is
the final tier. Mint can therefore become Rare Candy or Turbo Incubator;
Legendary inputs can become a Mythic Legendary Egg.

Only spare Shiny Charm duplicates can be exchanged; the active Charm remains.
One armed/pending Lucky Clover is excluded from available quantities. Reserved
eggs and Incubators were already removed from the Bag when reserved. Queued
hatches and captured Pokémon are untouched.

The helper revalidates the entire contract under the existing absorb/wallet
lock and commits consumption, reward and `lastTradeUp` receipt together in
state.json. Insufficient or stale selections fail without consuming anything.
Trade ups do not spend tokens, grant growth or change package RNGesus meters.

CLI: `bin/omapkdex-sync trade-up '{"mint":10}' rareCandy`
Tests: `python3 tests/test_trade_up.py` (temporary synthetic saves only).
