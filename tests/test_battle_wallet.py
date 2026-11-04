"""Battle stakes use temporary state; never change growth or real usage."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
class Wallet(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.env={**os.environ,'XDG_STATE_HOME':self.tmp.name}
  self.folder=Path(self.tmp.name)/'omarchy/io.github.heitorm50.omapkdex';self.folder.mkdir(parents=True)
  self.file=self.folder/'state.json';self.file.write_text(json.dumps({'lifetimeTokens':1000,'spentTokens':100,'tokensIntoStage':321,'inventory':{'mint':2}}))
 def tearDown(self):self.tmp.cleanup()
 def call(self,op,**data):
  r=subprocess.run([str(ROOT/'bin/omapkdex-battle-wallet'),op,json.dumps(data)],env=self.env,capture_output=True,text=True)
  return r,json.loads(r.stdout or '{}')
 def test_reserve_competes_with_shop_and_settlement_is_idempotent(self):
  args={'matchId':'match-one','amount':500,'rulesHash':'a'*64,'opponent':'b'*64}
  r,d=self.call('reserve',**args);self.assertEqual(r.returncode,0);self.assertEqual(d['available'],400)
  r,_=self.call('reserve',matchId='other',amount=500,rulesHash='a'*64,opponent='b'*64);self.assertNotEqual(r.returncode,0)
  r,d=self.call('settle',matchId='match-one',outcome='win',resultHash='c'*64);self.assertEqual(r.returncode,0);self.assertEqual(d['available'],1400)
  self.call('settle',matchId='match-one',outcome='win',resultHash='c'*64)
  state=json.loads(self.file.read_text());self.assertEqual(state['battleNet'],500);self.assertEqual(state['lifetimeTokens'],1000);self.assertEqual(state['tokensIntoStage'],321);self.assertEqual(state['inventory'],{'mint':2})
  r,_=self.call('settle',matchId='match-one',outcome='loss',resultHash='c'*64);self.assertNotEqual(r.returncode,0)
 def test_loss_and_draw_do_not_mint_growth(self):
  for result,net in [('loss',-200),('draw',0),('void',0)]:
   self.call('reserve',matchId='match-'+result,amount=200,rulesHash='a'*64,opponent='b'*64)
   self.call('settle',matchId='match-'+result,outcome=result,resultHash='c'*64)
   state=json.loads(self.file.read_text());self.assertEqual(state['battleNet'], -200 if result!='loss' else net)
  self.assertEqual(state['spentTokens'],100)
 def test_reserved_tokens_cannot_be_spent_in_shop(self):
  self.file.write_text(json.dumps({'lifetimeTokens':1000000000,'spentTokens':0,'inventory':{},'tokensIntoStage':321}))
  r,_=self.call('reserve',matchId='shop-race',amount=600000000,rulesHash='a'*64,opponent='b'*64)
  self.assertEqual(r.returncode,0)
  command=[str(ROOT/'bin/omapkdex-sync'),'buy','rareCandy','1']
  r=subprocess.run(command,env=self.env,capture_output=True,text=True);self.assertNotEqual(r.returncode,0)
  self.assertEqual(json.loads(self.file.read_text())['inventory'],{})
  self.call('settle',matchId='shop-race',outcome='draw',resultHash='c'*64)
  r=subprocess.run(command,env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,0)
  state=json.loads(self.file.read_text());self.assertEqual(state['inventory']['rareCandy'],1);self.assertEqual(state['tokensIntoStage'],321)

if __name__=='__main__':unittest.main()
