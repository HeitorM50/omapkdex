"""Surprise packs: isolated saves, deterministic rewards, no network."""
import copy
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

PLUGIN = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader('surprise_sync', str(PLUGIN / 'bin/omapkdex-sync'))
spec = importlib.util.spec_from_loader(loader.name, loader)
ps = importlib.util.module_from_spec(spec)
loader.exec_module(ps)

class Packs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'XDG_STATE_HOME': self.tmp.name})
        self.env.start()
        self.folder = Path(ps.state_dir())
        self.folder.mkdir(parents=True)
        self.state = copy.deepcopy(ps.DEFAULT_STATE)
        self.state.update(lifetimeTokens=200000000, spentTokens=7, stage=1,
                          hatched=True, tokensIntoStage=12345,
                          inventory={'rareCandy': 2, 'mint': 3, 'shinyCharm': True},
                          futureField={'keep': True})
        ps.write_json(ps.state_path(), self.state)
        for name, value in [('companion.json', {'evolutionLine': [{'id': 25}], 'companionId': 'keep', 'shiny': True}),
                            ('collection.json', {'entries': [{'companionId': 'keep', 'finalStage': 1}]})]:
            ps.write_json(str(self.folder / name), value)
        self.protected = {n: (self.folder/n).read_bytes() for n in ['companion.json','collection.json']}

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_each_reward_costs_exactly_50m_and_preserves_progress(self):
        for key in ps.PACK_REWARDS:
            with self.subTest(key=key):
                ps.write_json(ps.state_path(), self.state)
                with patch.object(ps, 'roll_pack', return_value=key), patch.object(ps, 'fetch', side_effect=AssertionError('network')):
                    self.assertEqual(ps.cmd_buy(['surprisePack', '0.1']), 0)
                after = ps.load_state()
                self.assertEqual(after['spentTokens'], 50000007)
                changed = {'spentTokens', 'inventory', 'lastPack', 'rngesusMeters'}
                self.assertEqual({k:v for k,v in after.items() if k not in changed},
                                 {k:v for k,v in self.state.items() if k not in changed})
                for name, data in self.protected.items():
                    self.assertEqual((self.folder/name).read_bytes(), data)
                self.assertEqual(after['lastPack']['key'], key)
                if key == 'shinyCharm':
                    self.assertIs(after['inventory'][key], True)
                    self.assertEqual(after['inventory']['shinyCharmDuplicates'], 1)
                else:
                    self.assertEqual(after['inventory'][key], self.state['inventory'].get(key,0)+1)

    def test_insufficient_funds_changes_nothing_and_does_not_roll(self):
        self.state['lifetimeTokens'] = 50000006
        ps.write_json(ps.state_path(), self.state)
        before = Path(ps.state_path()).read_bytes()
        with patch.object(ps, 'roll_pack') as roll:
            self.assertEqual(ps.cmd_buy(['surprisePack','2']), 1)
            roll.assert_not_called()
        self.assertEqual(Path(ps.state_path()).read_bytes(), before)

    def test_exact_balance_and_unique_receipts(self):
        self.state.update(lifetimeTokens=100000000, spentTokens=0)
        ps.write_json(ps.state_path(), self.state)
        with patch.object(ps, 'roll_pack', return_value='mint'):
            self.assertEqual(ps.cmd_buy(['surprisePack']),0)
            first = ps.load_state()['lastPack']['id']
            self.assertEqual(ps.cmd_buy(['surprisePack']),0)
            self.assertNotEqual(ps.load_state()['lastPack']['id'],first)
            self.assertEqual(ps.available_tokens(ps.load_state()),0)
            self.assertEqual(ps.cmd_buy(['surprisePack']),1)

    def test_queue_egg_does_not_replace_current_pokemon(self):
        self.state['inventory']['egg:rare'] = 2
        ps.write_json(ps.state_path(),self.state)
        self.assertEqual(ps.cmd_use(['egg:rare','1']),0)
        after = ps.load_state()
        self.assertEqual(after['queuedEgg'],'egg:rare')
        self.assertEqual(after['inventory']['egg:rare'],1)
        self.assertEqual(after['tokensIntoStage'],12345)
        self.assertEqual(after['stage'],1)
        self.assertTrue(after['hatched'])
        self.assertEqual(after['spentTokens'],7)
        for n,b in self.protected.items(): self.assertEqual((self.folder/n).read_bytes(),b)
        self.assertEqual(ps.cmd_use(['egg:rare','1']),1)
        self.assertEqual(ps.load_state(),after)

    def test_weights_cover_all_nine_and_cheaper_is_more_likely(self):
        self.assertEqual(set(ps.PACK_REWARDS), {'mint','rareCandy','egg:','egg:uncommon','shinyCharm','egg:rare','turboIncubator','luckyClover','egg:legendary'})
        prices=[ps.pack_reference_price(k) for k in ps.PACK_REWARDS]
        self.assertEqual(prices,sorted(prices))
        class Rng:
            def choices(self, population, weights, k):
                self.population,self.weights=population,weights
                return [population[-1]]
        rng=Rng()
        self.assertEqual(ps.roll_pack(rng),'egg:legendary')
        self.assertTrue(all(a>b for a,b in zip(rng.weights,rng.weights[1:])))
        self.assertAlmostEqual(sum(w/sum(rng.weights) for w in rng.weights),1)

    def test_busy_lock_never_charges_or_rolls(self):
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps, '_acquire', return_value=False), patch.object(ps, 'roll_pack') as roll:
            self.assertEqual(ps.cmd_buy(['surprisePack']),1)
            roll.assert_not_called()
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)

    def test_next_natural_hatch_honors_reservation_and_keeps_it_offline(self):
        self.state['queuedEgg'] = 'egg:rare'
        ps.write_json(ps.state_path(), self.state)
        ps.write_json(str(self.folder/'collection.json'), {'schemaVersion':1,'entries':[]})
        entry={'id':25, 'name':'pikachu','captureRate':45}
        with patch.object(ps,'load_index',return_value=[entry]), patch.object(ps,'pick_species',return_value=entry) as pick, patch.object(ps,'evolution_line',return_value=[]), patch.object(ps,'hydrate_sprites',side_effect=OSError('offline')):
            with self.assertRaises(OSError): ps.cmd_hatch([])
            self.assertEqual(pick.call_args.kwargs['tier'],'rare')
            self.assertEqual(ps.load_state()['queuedEgg'],'egg:rare')
            self.assertEqual((self.folder/'companion.json').read_bytes(),self.protected['companion.json'])
        line=[{'id':25,'name':'pikachu','sprite':'/tmp/test.png'}]
        with patch.object(ps,'load_index',return_value=[entry]), patch.object(ps,'pick_species',return_value=entry) as pick, patch.object(ps,'evolution_line',return_value=[]), patch.object(ps,'hydrate_sprites',return_value=line), patch.object(ps,'notify'):
            self.assertEqual(ps.cmd_hatch([]),0)
            self.assertEqual(pick.call_args.kwargs['tier'],'rare')
            self.assertNotIn('queuedEgg',ps.load_state())
            self.assertEqual(ps.load_state()['spentTokens'],7)

    def test_new_items_reserve_without_changing_current_pokemon(self):
        for key, flag in [('turboIncubator','turboIncubatorQueued'),('luckyClover','luckyCloverArmed')]:
            with self.subTest(key=key):
                state=copy.deepcopy(self.state)
                state['inventory'][key]=2
                ps.write_json(ps.state_path(),state)
                self.assertEqual(ps.cmd_use([key,'1']),0)
                after=ps.load_state()
                self.assertTrue(after[flag])
                self.assertEqual(after['inventory'][key], 2 if key=='luckyClover' else 1)
                for field in ['stage','hatched','tokensIntoStage','spentTokens']:
                    self.assertEqual(after[field],state[field])
                for n,data in self.protected.items(): self.assertEqual((self.folder/n).read_bytes(),data)
                self.assertEqual(ps.cmd_use([key,'1']),1)
                self.assertEqual(ps.load_state(),after)

    def test_incubator_only_speeds_next_egg_and_rescaling_keeps_fraction(self):
        state=copy.deepcopy(self.state)
        state['turboIncubatorQueued']=True
        self.assertEqual(ps.effective_hatch_threshold(state,1),ps.hatch_threshold(1))
        state['tokensIntoStage']=ps.graduation_total('common')
        self.assertTrue(ps.advance_stages(state,'common',1,1))
        self.assertTrue(state['turboIncubatorActive'])
        self.assertNotIn('turboIncubatorQueued',state)
        self.assertEqual(ps.effective_hatch_threshold(state,1),ps.hatch_threshold(1)//2)
        state['tokensIntoStage']=1000000
        ps.rescale_progress(state,'common',1,1,2)
        self.assertEqual(state['tokensIntoStage'],2000000)

    def test_clover_doubles_shiny_odds_and_only_consumes_on_success(self):
        for charm, expected in [(False,32),(True,24)]:
            self.state['inventory'].update(luckyClover=2,shinyCharm=charm)
            self.state['luckyCloverArmed']=True
            ps.write_json(ps.state_path(),self.state)
            ps.write_json(str(self.folder/'collection.json'),{'schemaVersion':1,'entries':[]})
            entry={'id':25,'name':'pikachu','captureRate':45}
            with patch.object(ps,'load_index',return_value=[entry]), patch.object(ps,'pick_species',return_value=entry), patch.object(ps,'evolution_line',return_value=[]), patch.object(ps,'roll_shiny',return_value=False) as roll, patch.object(ps,'hydrate_sprites',side_effect=OSError('offline')):
                with self.assertRaises(OSError): ps.cmd_hatch([])
                self.assertEqual(roll.call_args.kwargs['denominator'],expected)
                self.assertEqual(ps.load_state()['inventory']['luckyClover'],2)
                self.assertTrue(ps.load_state()['luckyCloverArmed'])
            with patch.object(ps,'load_index',return_value=[entry]), patch.object(ps,'pick_species',return_value=entry), patch.object(ps,'evolution_line',return_value=[]), patch.object(ps,'roll_shiny',return_value=False), patch.object(ps,'hydrate_sprites',return_value=[{'id':25,'name':'pikachu','sprite':'test'}]), patch.object(ps,'notify'):
                self.assertEqual(ps.cmd_hatch([]),0)
                self.assertEqual(ps.load_state()['inventory']['luckyClover'],1)
                self.assertNotIn('luckyCloverArmed',ps.load_state())

    def test_clover_reserved_at_species_roll_but_consumed_only_at_birth(self):
        self.state.update(hatched=False,luckyCloverArmed=True)
        self.state['inventory']['luckyClover']=2
        ps.write_json(ps.state_path(),self.state)
        ps.write_json(str(self.folder/'collection.json'),{'schemaVersion':1,'entries':[]})
        entry={'id':25,'name':'pikachu','captureRate':45}
        with patch.object(ps,'load_index',return_value=[entry]), patch.object(ps,'pick_species',return_value=entry), patch.object(ps,'evolution_line',return_value=[]), patch.object(ps,'roll_shiny',return_value=False), patch.object(ps,'hydrate_sprites',return_value=[{'id':25,'name':'pikachu','sprite':'test'}]), patch.object(ps,'notify'):
            self.assertEqual(ps.cmd_hatch([]),0)
        state=ps.load_state()
        self.assertEqual(state['inventory']['luckyClover'],2)
        self.assertTrue(state['luckyCloverPending'])
        self.assertNotIn('luckyCloverArmed',state)
        self.assertEqual(ps.cmd_use(['luckyClover','1']),1)
        state['turboIncubatorActive']=True
        ps.consume_hatch_items(state)
        self.assertEqual(state['inventory']['luckyClover'],1)
        self.assertNotIn('luckyCloverPending',state)
        self.assertNotIn('turboIncubatorActive',state)
        ps.consume_hatch_items(state)
        self.assertEqual(state['inventory']['luckyClover'],1)

    def test_absorb_hatches_at_half_cost_and_consumes_clover_once(self):
        state=copy.deepcopy(self.state)
        state.update(hatched=False,stage=0,tokensIntoStage=0,
                     turboIncubatorActive=True,luckyCloverPending=True,
                     lastSeen={'claude':0},difficulty=1)
        state['inventory']['luckyClover']=2
        ps.write_json(ps.state_path(),state)
        ps.write_json(str(self.folder/'collection.json'),{'schemaVersion':1,'entries':[]})
        companion={'companionId':'new','baseSpeciesId':25,'name':'pikachu','rarity':'common','evolutionLine':[{'id':25,'name':'pikachu','sprite':'test'}]}
        with patch.object(ps,'load_records',return_value={'claude':{}}), patch.object(ps,'record_tokens',return_value=2499999) as tokens, patch.object(ps,'load_companion',return_value=companion), patch.object(ps,'grant_candies',return_value=[]), patch.object(ps,'notify'):
            self.assertEqual(ps.cmd_absorb(['1']),0)
            self.assertFalse(ps.load_state()['hatched'])
            self.assertEqual(ps.load_state()['inventory']['luckyClover'],2)
            tokens.return_value=2500000
            self.assertEqual(ps.cmd_absorb(['1']),0)
            after=ps.load_state()
            self.assertTrue(after['hatched'])
            self.assertEqual(after['tokensIntoStage'],0)
            self.assertEqual(after['inventory']['luckyClover'],1)
            self.assertNotIn('luckyCloverPending',after)
            self.assertNotIn('turboIncubatorActive',after)
            self.assertEqual(after['spentTokens'],self.state['spentTokens'])
            self.assertEqual(ps.cmd_absorb(['1']),0)
            self.assertEqual(ps.load_state()['inventory']['luckyClover'],1)

    def test_legendary_egg_only_draws_legendary_species(self):
        ordinary={'id':1,'captureRate':3,'isLegendary':False,'isMythical':False}
        legendary={'id':144,'captureRate':3,'isLegendary':True,'isMythical':False}
        mythical={'id':151,'captureRate':3,'isLegendary':False,'isMythical':True}
        self.assertIn('legendary',ps.EGG_TIERS)
        self.assertFalse(ps.meets_tier(ordinary,'legendary'))
        self.assertFalse(ps.meets_tier(mythical,'legendary'))
        self.assertTrue(ps.meets_tier(legendary,'legendary'))
        for _ in range(10):
            self.assertEqual(ps.pick_species([ordinary,legendary,mythical],tier='legendary'),legendary)
        self.assertIsNone(ps.pick_species([ordinary,mythical],tier='legendary'))

    def test_swapped_rarities_and_mythic_egg_is_rarest(self):
        self.assertEqual(ps.item_rarity('luckyClover'),'rare')
        self.assertEqual(ps.item_rarity('shinyCharm'),'legendary')
        self.assertEqual(ps.item_rarity('egg:legendary'),'mythical')
        self.assertEqual(ps.pack_reference_price('luckyClover'),3000000000)
        self.assertEqual(ps.pack_reference_price('shinyCharm'),6000000000)
        self.assertTrue(all(ps.pack_reference_price('egg:legendary')>ps.pack_reference_price(k) for k in ps.PACK_REWARDS if k!='egg:legendary'))

    def test_legendary_reservation_survives_empty_pool_and_overrides_rare(self):
        self.state['inventory']['egg:legendary']=1
        self.state['eggTier']='rare'
        ps.write_json(ps.state_path(),self.state)
        self.assertEqual(ps.cmd_use(['egg:legendary','1']),0)
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps,'load_index',return_value=[]),patch.object(ps,'pick_species',return_value=None) as pick:
            self.assertEqual(ps.cmd_hatch([]),1)
            self.assertEqual(pick.call_args.kwargs['tier'],'legendary')
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)
        for n,data in self.protected.items(): self.assertEqual((self.folder/n).read_bytes(),data)

    def test_package_prices_and_atomic_delivery_preserve_captures(self):
        for package,price in [('poorPackage',50000000),('fancyPackage',200000000),('legendaryPackage',500000000)]:
            with self.subTest(package=package):
                state=copy.deepcopy(self.state)
                state.update(lifetimeTokens=price,spentTokens=0)
                ps.write_json(ps.state_path(),state)
                with patch.object(ps,'roll_pack',return_value='rareCandy') as roll:
                    self.assertEqual(ps.cmd_buy([package,'0.1']),0)
                    self.assertEqual(roll.call_args.kwargs['package'],package)
                after=ps.load_state()
                self.assertEqual(after['spentTokens'],price)
                self.assertEqual(after['inventory']['rareCandy'],3)
                self.assertEqual(after['lastPack']['package'],package)
                for field in ['hatched','stage','tokensIntoStage']:
                    self.assertEqual(after[field],state[field])
                for n,data in self.protected.items():self.assertEqual((self.folder/n).read_bytes(),data)
                before=Path(ps.state_path()).read_bytes()
                with patch.object(ps,'roll_pack') as roll:
                    self.assertEqual(ps.cmd_buy([package]),1)
                    roll.assert_not_called()
                self.assertEqual(Path(ps.state_path()).read_bytes(),before)

    def test_premium_odds_improve_and_legendary_excludes_common(self):
        ranks={'common':0,'uncommon':1,'rare':2,'legendary':3,'mythical':4}
        pools=[]
        for package in ['poorPackage','fancyPackage','legendaryPackage']:
            keys,weights=ps.pack_pool(package)
            self.assertTrue(all(w>0 for w in weights))
            odds={key:w/sum(weights) for key,w in zip(keys,weights)}
            pools.append(odds)
            if package=='legendaryPackage':
                self.assertNotIn('mint',keys)
                self.assertTrue(all(ranks[ps.item_rarity(key)]>=1 for key in keys))
            else:self.assertIn('mint',keys)
        for rank in [2,3,4]:
            chances=[sum(p for k,p in odds.items() if ranks[ps.item_rarity(k)]>=rank) for odds in pools]
            self.assertLess(chances[0],chances[1])
            self.assertLess(chances[1],chances[2])
        self.assertTrue(all(odds['egg:legendary']<odds['shinyCharm'] for odds in pools))

    def test_legendary_roll_never_includes_mint(self):
        class Rng:
            def choices(self,keys,weights,k):
                self.keys=keys
                return [keys[0]]
        rng=Rng()
        self.assertEqual(ps.roll_pack(rng,package='legendaryPackage'),'rareCandy')
        self.assertNotIn('mint',rng.keys)
        self.assertEqual(len(rng.keys),8)

    def test_rngesus_threshold_requires_the_following_opening(self):
        for package,price,limit in [('poorPackage',50000000,2000000000),('fancyPackage',200000000,3000000000),('legendaryPackage',500000000,4000000000)]:
            with self.subTest(package=package):
                state=copy.deepcopy(self.state)
                state.update(lifetimeTokens=10000000000,spentTokens=0,
                             rngesusMeters={package:limit-price,'untouchedPackage':123})
                ps.write_json(ps.state_path(),state)
                with patch.object(ps,'roll_pack',return_value='rareCandy') as roll:
                    self.assertEqual(ps.cmd_buy([package]),0)
                    self.assertFalse(roll.call_args.kwargs['rngesus_only'])
                after=ps.load_state()
                self.assertEqual(after['rngesusMeters'][package],limit)
                self.assertFalse(after['lastPack']['rngesusGuaranteed'])
                self.assertTrue(ps.rngesus_meter(after,package)['ready'])
                with patch.object(ps,'roll_pack',return_value='egg:legendary') as roll:
                    self.assertEqual(ps.cmd_buy([package]),0)
                    self.assertTrue(roll.call_args.kwargs['rngesus_only'])
                after=ps.load_state()
                self.assertEqual(after['rngesusMeters'][package],0)
                self.assertTrue(after['lastPack']['rngesusGuaranteed'])
                self.assertEqual(after['spentTokens'],2*price)
                self.assertEqual(after['rngesusMeters']['untouchedPackage'],123)
                self.assertEqual(after['inventory']['egg:legendary'],1)
                for n,data in self.protected.items():self.assertEqual((self.folder/n).read_bytes(),data)

    def test_each_package_has_independent_meter_and_natural_drops_reset_it(self):
        state=copy.deepcopy(self.state)
        state.update(lifetimeTokens=10000000000,spentTokens=0,
                     rngesusMeters={'poorPackage':100000000,'fancyPackage':400000000,'legendaryPackage':500000000})
        ps.write_json(ps.state_path(),state)
        with patch.object(ps,'roll_pack',return_value='mint'):
            self.assertEqual(ps.cmd_buy(['surprisePack']),0)
        self.assertEqual(ps.load_state()['rngesusMeters'],{'poorPackage':150000000,'fancyPackage':400000000,'legendaryPackage':500000000})
        for reward in ['egg:rare','shinyCharm','egg:legendary']:
            ps.write_json(ps.state_path(),state)
            with patch.object(ps,'roll_pack',return_value=reward):
                self.assertEqual(ps.cmd_buy(['fancyPackage']),0)
            self.assertEqual(ps.load_state()['rngesusMeters'],{'poorPackage':100000000,'fancyPackage':0,'legendaryPackage':500000000})

    def test_rngesus_pool_only_contains_legendary_or_mythical(self):
        for package in ps.PACKAGES:
            keys,weights=ps.pack_pool(package,rngesus_only=True)
            self.assertEqual(set(keys),{'egg:rare','shinyCharm','egg:legendary'})
            self.assertTrue(all(ps.item_rarity(k) in ('legendary','mythical') for k in keys))
            class Rng:
                def choices(self,keys,weights,k):
                    self.keys=keys
                    return [keys[-1]]
            rng=Rng()
            self.assertEqual(ps.roll_pack(rng,package=package,rngesus_only=True),'egg:legendary')
            self.assertEqual(set(rng.keys),set(keys))

    def test_ready_meter_survives_insufficient_balance_and_disk_failure(self):
        state=copy.deepcopy(self.state)
        state.update(lifetimeTokens=0,rngesusMeters={'poorPackage':2000000000})
        ps.write_json(ps.state_path(),state)
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps,'roll_pack') as roll:
            self.assertEqual(ps.cmd_buy(['poorPackage']),1)
            roll.assert_not_called()
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)
        state['lifetimeTokens']=100000000
        ps.write_json(ps.state_path(),state)
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps,'roll_pack',return_value='egg:rare'),patch.object(ps.os,'replace',side_effect=OSError('disk')):
            with self.assertRaises(OSError):ps.cmd_buy(['poorPackage'])
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)

    def test_failed_write_keeps_original_save(self):
        before=Path(ps.state_path()).read_bytes()
        with patch.object(ps,'roll_pack',return_value='mint'), patch.object(ps.os,'replace',side_effect=OSError('disk')):
            with self.assertRaises(OSError): ps.cmd_buy(['surprisePack'])
        self.assertEqual(Path(ps.state_path()).read_bytes(),before)

if __name__ == '__main__': unittest.main()
