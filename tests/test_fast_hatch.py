"""Fast Hatch replaces the plain Egg without rewriting existing inventories."""
import copy
from pathlib import Path
import unittest
from unittest.mock import patch
import test_surprise as fixtures
ps = fixtures.ps

class FastHatch(unittest.TestCase):
    setUp = fixtures.Packs.setUp
    tearDown = fixtures.Packs.tearDown

    def test_reserving_legacy_egg_preserves_current_generation_and_wallet(self):
        self.state['inventory']['egg:'] = 2
        ps.write_json(ps.state_path(), self.state)
        self.assertEqual(ps.cmd_use(['egg:','1']), 0)
        after = ps.load_state()
        self.assertTrue(after['fastHatchQueued'])
        self.assertEqual(after['inventory']['egg:'], 1)
        self.assertNotIn('fastHatchActive', after)
        self.assertNotIn('queuedEgg', after)
        for field in ('tokensIntoStage','stage','hatched','lifetimeTokens','spentTokens','futureField'):
            self.assertEqual(after[field], self.state[field])
        for name, data in self.protected.items():
            self.assertEqual((self.folder/name).read_bytes(),data)
        self.assertEqual(ps.cmd_use(['fastHatch','1']), 1)
        self.assertEqual(ps.load_state(), after)

    def test_one_generation_double_growth_and_booster_stacking(self):
        state=copy.deepcopy(self.state)
        state.update(stage=0, tokensIntoStage=ps.graduation_total('common'), fastHatchQueued=True)
        self.assertTrue(ps.advance_stages(state,'common',1,1))
        self.assertTrue(state['fastHatchActive'])
        self.assertNotIn('fastHatchQueued', state)
        self.assertEqual(ps.effective_hatch_threshold(state,1), ps.hatch_threshold(1)//2)
        state['turboIncubatorActive']=True
        self.assertEqual(ps.effective_hatch_threshold(state,1), ps.hatch_threshold(1)//4)
        ps.consume_hatch_items(state)
        self.assertTrue(state['fastHatchActive'], 'bonus survives the egg')
        state.update(hatched=True, stage=0, tokensIntoStage=ps.graduation_total('common')//2)
        self.assertTrue(ps.advance_stages(state,'common',1,1,2))
        self.assertFalse(state.get('fastHatchActive'), 'bonus ends on graduation')
        self.assertEqual(ps.effective_hatch_threshold(state,1), ps.hatch_threshold(1))

    def test_old_reserved_plain_egg_becomes_next_generation_bonus(self):
        state=copy.deepcopy(self.state)
        state.update(stage=0,tokensIntoStage=ps.graduation_total('common'),queuedEgg='egg:')
        self.assertTrue(ps.advance_stages(state,'common',1,1))
        self.assertTrue(state['fastHatchActive'])
        self.assertNotIn('queuedEgg', state)

    def test_growth_multiplier_applies_to_live_absorb_and_candy(self):
        self.state.update(stage=0, tokensIntoStage=0, fastHatchActive=True, difficulty=1,
                          lastSeen={'claude':0})
        ps.write_json(ps.state_path(), self.state)
        with patch.object(ps,'load_records',return_value={'claude':{}}), \
             patch.object(ps,'record_tokens',return_value=100), \
             patch.object(ps,'growth_boost',return_value=2), \
             patch.object(ps,'advance_stages',wraps=ps.advance_stages) as advance:
            self.assertEqual(ps.cmd_absorb(['1']),0)
            self.assertEqual(advance.call_args.args[-1],4)
        with patch.object(ps,'growth_boost',return_value=2), \
             patch.object(ps,'advance_stages',wraps=ps.advance_stages) as advance:
            self.assertEqual(ps.cmd_use(['rareCandy','1']),0)
            self.assertEqual(advance.call_args.args[-1],4)
        self.assertEqual(ps.load_state()['lifetimeTokens'],self.state['lifetimeTokens']+100)

    def test_requeue_and_difficulty_change_keep_current_fraction(self):
        state=copy.deepcopy(self.state)
        state.update(fastHatchActive=True,fastHatchQueued=True,hatched=False,tokensIntoStage=500000)
        ps.rescale_progress(state,'common',1,1,2,2)
        self.assertEqual(state['tokensIntoStage'],1000000)
        state.update(hatched=True,stage=0,tokensIntoStage=ps.graduation_total('common')//2)
        self.assertTrue(ps.advance_stages(state,'common',1,1,2))
        self.assertTrue(state['fastHatchActive'])
        self.assertNotIn('fastHatchQueued',state)

    def test_fast_hatch_and_rarity_egg_can_be_reserved_together(self):
        self.state['inventory'].update({'egg:':1,'egg:rare':1})
        ps.write_json(ps.state_path(),self.state)
        self.assertEqual(ps.cmd_use(['egg:rare','1']),0)
        self.assertEqual(ps.cmd_use(['fastHatch','1']),0)
        after=ps.load_state()
        self.assertEqual(after['queuedEgg'],'egg:rare')
        self.assertTrue(after['fastHatchQueued'])
        self.assertFalse(after.get('fastHatchActive'))

    def test_network_failure_keeps_generation_bonus_and_special_egg_guarantee(self):
        self.state.update(fastHatchActive=True,hatched=False,queuedEgg='egg:uncommon')
        ps.write_json(ps.state_path(),self.state)
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps,'load_index',return_value=[]), patch.object(ps,'pick_species',return_value=None):
            self.assertEqual(ps.cmd_hatch([]),1)
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)

if __name__=='__main__': unittest.main()
