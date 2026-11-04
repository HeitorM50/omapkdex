# Packages, item rarity and RNGesus Meter

The Shop offers **Poor Package (50M)**, **Fancy Package (200M)** and
**Legendary Package (500M)**. Each grants exactly one item. Select a package
to inspect its odds, then click Buy and confirm. Switching packages cancels
confirmation; packages cannot change during a purchase or its animation.

Poor allows every rarity. Fancy excludes Common and flattens reference-price
weights with a square root; Legendary uses a fourth root and allows only Rare
or better (no Common or Uncommon).
For an eligible reward, weight is `(100,000,000 / reference_price) ** power`,
where power is 1, 0.5 or 0.25. Normalize only across that package's eligible pool.
More expensive items stay rarer within each package, including Mythic Legendary
Egg, while the combined chances of Rare+, Legendary+ and Mythic all increase
from Poor to Fancy to Legendary. An owned Shiny Charm stays eligible.

| Reward | Rarity | Poor · 50M | Fancy · 200M | Legendary · 500M |
| --- | --- | ---: | ---: | ---: |
| Mint | Common | 60.94% | Excluded | Excluded |
| Rare Candy | Uncommon | 12.19% | 20.39% | Excluded |
| Turbo Incubator | Uncommon | 8.13% | 16.65% | Excluded |
| Egg | Rare | 6.09% | 14.42% | 18.38% |
| Super Rare Candy | Rare | 4.88% | 12.90% | 17.38% |
| Uncommon Egg | Rare | 2.44% | 9.12% | 14.61% |
| Lucky Clover | Rare | 2.03% | 8.33% | 13.96% |
| Rare Egg | Legendary | 1.52% | 7.21% | 12.99% |
| Shiny Charm | Legendary | 1.02% | 5.89% | 11.74% |
| Legendary Egg | Mythical | 0.76% | 5.10% | 10.93% |

The live UI displays these same normalized odds. Growth settings and the old
shopDifficulty multiplier cannot alter package prices or odds. Legacy direct
CLI purchases remain compatible; `buy surprisePack` is an alias for Poor Package.

Buying a pack uses the existing absorb lock and one atomic state.json write
for the debit, inventory increment and lastPack receipt, including the package
key and exact charged price. Old receipts without those fields stay readable. It performs no network
requests, does not touch companion.json or collection.json, and does not reset
growth, captured Pokémon, Pokédex data, existing items or the wallet history.
The animation follows the persisted receipt, so closing the panel loses no reward.
No migration or reset is needed.

Eggs stay in the Bag. “Reserve” consumes one into queuedEgg, preserving all current
growth. Only one egg can be reserved at a time. The next natural species selection
uses its guarantee and clears the reservation after successful sprite hydration;
a failed network request keeps the reservation. An existing eggTier guarantee is
respected if stronger. A plain egg uses the ordinary pool.

Shiny Charm remains a permanent boolean for compatibility; repeated charms add
shinyCharmDuplicates. They remain collectible but do not multiply the passive bonus.

Verification: run tests/test_surprise.py and tests/test_surprise.mjs plus the
existing Python and JS suites. All save mutations in tests use temporary XDG state.

## Consumable boosters

Turbo Incubator uses a 750M reference price for its pack weight (not sold
separately). Reserve one from the Bag. Its pending flag survives restarts and
becomes active when the current Pokémon graduates and the next egg starts.
That egg needs half the usual hatch tokens; difficulty changes preserve its
progress fraction. The current Pokémon and an already incubating egg keep
their progress. Another incubator can be reserved for the following egg.

Lucky Clover now uses a 3B pack reference price and Rare rarity; Shiny Charm
uses a 6B reference price and keeps Legendary rarity. Reserve one from
the Bag: the next species roll doubles shiny probability, including Shiny Charm
(1/32 without charm, 1/24 with charm). The item remains in inventory while
reserved. After a successful roll it stays pending until the egg's token
threshold is reached, then one is consumed. Offline sprite or species failure
leaves it reserved and unspent. Only one clover can be reserved at a time.

New fields are optional and require no save migration. Existing progress and
inventory are retained. Package tiers change only prices and reward odds; item effects are unchanged.

## Mythic Legendary Egg

Legendary Egg is a **Mythic** item (purple), with an 8B reference price. It has
the smallest weight of all ten pack rewards. Its item rarity is distinct from
the Pokémon rarity: reserving it guarantees a species explicitly marked
`isLegendary` in the cached index at the next natural species selection. A low
capture rate alone does not qualify; species marked only mythical do not qualify.
If no eligible species can be resolved, the reservation stays in the save,
without a fallback to a weaker rarity. Buying or reserving it never replaces
the current Pokémon or resets growth. Existing guarantees respect the stronger
tier, including Legendary.

The Clover and Charm pack weights have been swapped. Legacy direct CLI prices
remain compatible; the visible Shop sells only the three package tiers. Existing owned items,
bonuses and capture records require no migration.

## RNGesus Meter (bad-luck guarantee)

Each package has its own persisted `state.json.rngesusMeters[packageKey]`,
measured in tokens spent since its last Legendary or Mythic **item** drop.
The Shop displays the selected package's progress, plus a small bar on each
package selector. The meter survives reopening the panel and restarting the shell.

| Package | Meter limit | Dry openings to fill | Guaranteed following opening |
| --- | ---: | ---: | ---: |
| Poor | 2B | 40 | 41st |
| Fancy | 3B | 15 | 16th |
| Legendary | 4B | 8 | 9th |

Only a successful purchase advances the meter. Check readiness **before**
charging: reaching the cap after a non-RNGesus drop arms the *following*
opening of that same package. It does not retroactively replace the reward
that filled the bar. The guaranteed opening still costs the package's normal
price and grants exactly one item, drawn exclusively from Rare Egg, Shiny Charm
and Legendary Egg, retaining their relative weights for that package.
The displayed odds switch to this restricted pool while the meter is ready.

Any Legendary or Mythic item drop, including duplicate Shiny Charm and natural
RNGesus drops below the cap, resets only the purchased package's meter to zero.
A guaranteed receipt records `rngesusGuaranteed: true`. Debit, inventory,
meter change and receipt are committed in one atomic write under the existing
absorb lock. Insufficient balance, lock contention or failed writes never spend
or consume a ready guarantee. Buying another package cannot affect it.

Existing saves default to zero and need no migration. Counting begins with
purchases after installing this feature: previous saves retain only the most
recent receipt and cannot reconstruct complete per-package spending. Historical
spentTokens, captured Pokémon and existing inventory are never rewritten to
infer missing history.

## Super Rare Candy

Super Rare Candy is Rare and grants **250M growth tokens** when used on a
hatched Pokémon, following the same evolution/graduation flow as Rare Candy.
It does not increase lifetimeTokens or the spendable wallet. Its reference
price is 1.25B (2.5 times Rare Candy), and it is eligible in all three packages
and as a Rare input/output in trade ups. Missing inventory fields in old saves
default to zero; no save migration is required.
