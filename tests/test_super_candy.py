"""Super Candy growth and package rarity floors use temporary saves."""
from pathlib import Path
import unittest
from unittest.mock import patch
import test_surprise as fixtures
ps = fixtures.ps

class SuperCandy(unittest.TestCase):
    setUp = fixtures.Packs.setUp
    tearDown = fixtures.Packs.tearDown

    def test_250m_growth_without_wallet_income_or_capture_changes(self):
        self.state.update(stage=0, inventory={'superRareCandy': 1})
        ps.write_json(ps.state_path(), self.state)
        ps.write_json(ps.companion_path(), {'companionId':'keep','rarity':'legendary',
                                          'evolutionLine':[{'id':25}]})
        with patch.object(ps, 'fetch', side_effect=AssertionError('network')):
            self.assertEqual(ps.cmd_use(['superRareCandy','1']), 0)
        after = ps.load_state()
        self.assertEqual(after['tokensIntoStage'], 250012345)
        self.assertEqual(after['inventory']['superRareCandy'], 0)
        self.assertEqual(ps.available_tokens(after), ps.available_tokens(self.state))
        self.assertEqual(after['lifetimeTokens'], self.state['lifetimeTokens'])
        self.assertEqual((self.folder/'collection.json').read_bytes(), self.protected['collection.json'])
        before = Path(ps.state_path()).read_bytes()
        self.assertEqual(ps.cmd_use(['superRareCandy','1']), 1)
        self.assertEqual(Path(ps.state_path()).read_bytes(), before)

    def test_unhatched_candy_is_not_consumed(self):
        self.state.update(hatched=False, inventory={'superRareCandy': 1})
        ps.write_json(ps.state_path(), self.state)
        before = Path(ps.state_path()).read_bytes()
        self.assertEqual(ps.cmd_use(['superRareCandy','1']), 1)
        self.assertEqual(Path(ps.state_path()).read_bytes(), before)

    def test_pool_and_minimum_package_rarities(self):
        self.assertIn('superRareCandy', ps.PACK_REWARDS)
        self.assertEqual(ps.item_rarity('superRareCandy'), 'rare')
        ranks={'common':0,'uncommon':1,'rare':2,'legendary':3,'mythical':4}
        for package, minimum in [('poorPackage',0),('fancyPackage',1),('legendaryPackage',2)]:
            keys, _ = ps.pack_pool(package)
            self.assertIn('superRareCandy', keys)
            self.assertTrue(all(ranks[ps.item_rarity(k)] >= minimum for k in keys))

    def test_super_candy_can_be_traded_as_rare(self):
        self.state['inventory'] = {'superRareCandy': 3}
        ps.write_json(ps.state_path(), self.state)
        self.assertEqual(ps.main(['trade-up','{"superRareCandy":3}','egg:rare']), 0)
        self.assertEqual(ps.load_state()['inventory'], {'superRareCandy':0,'egg:rare':1})

if __name__ == '__main__':
    unittest.main()
