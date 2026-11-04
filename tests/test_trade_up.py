"""Trade-up contracts use isolated saves; never personal inventory."""
import json
from pathlib import Path
import unittest
import test_surprise as fixtures
ps = fixtures.ps

class TradeUp(unittest.TestCase):
    setUp = fixtures.Packs.setUp
    tearDown = fixtures.Packs.tearDown

    def trade(self, inputs, target):
        return ps.main(['trade-up', json.dumps(inputs), target])

    def save(self, inventory, **extra):
        self.state['inventory'] = inventory
        self.state.update(extra)
        ps.write_json(ps.state_path(), self.state)

    def test_five_common_guarantee_chosen_uncommon_and_preserve_progress(self):
        self.save({'mint': 7})
        self.assertEqual(self.trade({'mint': 5}, 'turboIncubator'), 0)
        after = ps.load_state()
        self.assertEqual(after['inventory'], {'mint': 2, 'turboIncubator': 1})
        self.assertEqual({k:v for k,v in after.items() if k not in ('inventory','lastTradeUp')},
                         {k:v for k,v in self.state.items() if k not in ('inventory','lastTradeUp')})
        for name, data in self.protected.items():
            self.assertEqual((self.folder/name).read_bytes(), data)

    def test_mixed_inputs_each_rarity_and_passive_duplicates(self):
        cases = [({'rareCandy': 2,'turboIncubator': 2}, {'rareCandy': 2,'turboIncubator': 2}, 'luckyClover'),
                 ({'egg:': 1,'luckyClover': 2}, {'egg:': 1,'luckyClover': 2}, 'shinyCharm'),
                 ({'shinyCharm': True,'shinyCharmDuplicates': 1,'egg:rare': 1},
                  {'shinyCharm': 1,'egg:rare': 1}, 'egg:legendary')]
        for inventory, inputs, target in cases:
            with self.subTest(target=target):
                self.save(inventory)
                self.assertEqual(self.trade(inputs, target), 0)
                after = ps.load_state()['inventory']
                self.assertTrue(after[target])
                if 'shinyCharm' in inputs:
                    self.assertIs(after['shinyCharm'], True)
                    self.assertEqual(after['shinyCharmDuplicates'], 0)

    def test_reserved_clover_and_active_charm_cannot_be_consumed(self):
        self.save({'luckyClover': 3}, luckyCloverArmed=True)
        before = Path(ps.state_path()).read_bytes()
        self.assertEqual(self.trade({'luckyClover': 3}, 'egg:rare'), 1)
        self.assertEqual(Path(ps.state_path()).read_bytes(), before)
        self.save({'shinyCharm': True,'shinyCharmDuplicates': 1}, luckyCloverArmed=False)
        self.assertEqual(self.trade({'shinyCharm': 2}, 'egg:legendary'), 1)

    def test_existing_charm_reward_adds_duplicate_and_reserved_surplus_is_usable(self):
        self.save({'luckyClover': 4, 'shinyCharm': True}, luckyCloverPending=True)
        self.assertEqual(self.trade({'luckyClover': 3}, 'shinyCharm'), 0)
        inventory = ps.load_state()['inventory']
        self.assertEqual(inventory['luckyClover'], 1)
        self.assertIs(inventory['shinyCharm'], True)
        self.assertEqual(inventory['shinyCharmDuplicates'], 1)

    def test_exact_quantity_required_for_every_rarity(self):
        for key, count, target in [('mint',5,'rareCandy'), ('rareCandy',4,'egg:'),
                                   ('egg:',3,'egg:rare'), ('egg:rare',2,'egg:legendary')]:
            for amount in (count-1, count+1, 10):
                self.save({key: 20})
                before = Path(ps.state_path()).read_bytes()
                self.assertEqual(self.trade({key: amount}, target), 1)
                self.assertEqual(Path(ps.state_path()).read_bytes(), before)
            self.save({key: count})
            self.assertEqual(self.trade({key: count}, target), 0)

    def test_invalid_contracts_and_stale_inventory_are_atomic(self):
        self.save({'mint': 5,'rareCandy': 4,'egg:legendary': 2})
        before = Path(ps.state_path()).read_bytes()
        cases = [({'mint': 9},'rareCandy'), ({'mint': 11},'rareCandy'),
                 ({'mint': 5,'rareCandy': 5},'egg:'), ({'mint': 10},'egg:legendary'),
                 ({'mint': -10},'rareCandy'), ({'mint': True},'rareCandy'),
                 ({'mint': 10.0},'rareCandy'), ({'unknown': 10},'rareCandy'),
                 ({'egg:legendary': 10},'mint'), ([], 'rareCandy')]
        for inputs, target in cases:
            self.assertEqual(self.trade(inputs, target), 1)
            self.assertEqual(Path(ps.state_path()).read_bytes(), before)
        self.assertEqual(self.trade({'mint': 5}, 'rareCandy'), 0)
        self.assertEqual(self.trade({'mint': 5}, 'rareCandy'), 1)

if __name__ == '__main__':
    unittest.main()
