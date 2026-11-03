import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
const dir = fileURLToPath(new URL('../', import.meta.url))
const B = vm.createContext({})
vm.runInContext(readFileSync(dir + 'Balance.js', 'utf8').replace(/^\.pragma library\s*/m,''), B)
assert.equal(B.PACK_PRICE, 50000000)
const rewards = B.packRewards()
assert.equal(rewards.length, 9)
assert.ok(Math.abs(rewards.reduce((s,r)=>s+r.chance,0)-1)<1e-12)
assert.equal(rewards.map(r=>r.rarity).join(','),'common,uncommon,uncommon,rare,rare,rare,legendary,legendary,mythical')
assert.ok(rewards.every((r,i)=>i===0 || r.chance<rewards[i-1].chance))
const rows=B.bagEntries({'egg:':2,'egg:rare':1, mint:1, shinyCharm:true})
assert.equal(rows.length,4)
assert.equal(rows.find(r=>r.key==='egg:rare').rarity,'legendary')
assert.equal(rows.find(r=>r.key==='egg:').count,2)
const python = execFileSync('python3',['-c',`
import importlib.machinery,json
import importlib.util
loader=importlib.machinery.SourceFileLoader('ps',${JSON.stringify(dir+'bin/omapkdex-sync')})
spec=importlib.util.spec_from_loader(loader.name,loader)
ps=importlib.util.module_from_spec(spec)
loader.exec_module(ps)
print(json.dumps([{'key': k, 'rarity': ps.item_rarity(k), 'weight': ps.MINT_PRICE/ps.pack_reference_price(k)} for k in ps.PACK_REWARDS]))
`],{encoding:'utf8'})
const py=JSON.parse(python), total=py.reduce((s,r)=>s+r.weight,0)
rewards.forEach((r,i)=>{
 assert.equal(r.key,py[i].key)
 assert.equal(r.rarity,py[i].rarity)
 assert.ok(Math.abs(r.chance-py[i].weight/total)<1e-12)
})
console.log('PASS: all rewards, odds, Python/JS parity, fixed price and egg inventory')
console.log(rewards.map(r=>`${r.label}: ${(r.chance*100).toFixed(2)}%`).join('\n'))

assert.equal(B.itemRarity('turboIncubator'),'uncommon')
assert.equal(B.itemRarity('luckyClover'),'rare')
assert.equal(B.hatchThreshold(1,true),2500000)
assert.equal(B.bagEntries({turboIncubator:2,luckyClover:1}).length,2)

assert.equal(B.itemRarity('egg:legendary'),'mythical')
assert.equal(B.rarityLabel('mythical'),'Mythic')
assert.notEqual(B.rarityColor('mythical','#fff'),B.rarityColor('legendary','#fff'))
assert.equal(B.bagEntries({'egg:legendary':1})[0].rarity,'mythical')
assert.equal(rewards.at(-1).key,'egg:legendary')
assert.ok(rewards.at(-1).chance<rewards.find(r=>r.key==='shinyCharm').chance)

const pyPackages=JSON.parse(execFileSync('python3',['-c',`
import importlib.machinery,json
import importlib.util
loader=importlib.machinery.SourceFileLoader('ps',${JSON.stringify(dir+'bin/omapkdex-sync')})
spec=importlib.util.spec_from_loader(loader.name,loader)
ps=importlib.util.module_from_spec(spec)
loader.exec_module(ps)
result={}
for package,config in ps.PACKAGES.items():
 keys,weights=ps.pack_pool(package)
 result[package]={'price':config['price'],'odds':dict(zip(keys,[w/sum(weights) for w in weights]))}
print(json.dumps(result))
`],{encoding:'utf8'}))
let previousRare=0, previousMythic=0
for (const packageKey of B.PACKAGE_ORDER) {
 const rows=B.packRewards(packageKey), py=pyPackages[packageKey]
 assert.equal(B.PACKAGES[packageKey].price,py.price)
 assert.ok(Math.abs(rows.reduce((s,r)=>s+r.chance,0)-1)<1e-12)
 assert.equal(rows.length,Object.keys(py.odds).length)
 for (const r of rows) assert.ok(Math.abs(r.chance-py.odds[r.key])<1e-12)
 const rare=rows.filter(r=>['rare','legendary','mythical'].includes(r.rarity)).reduce((s,r)=>s+r.chance,0)
 const mythic=rows.find(r=>r.rarity==='mythical').chance
 assert.ok(rare>previousRare);assert.ok(mythic>previousMythic)
 previousRare=rare;previousMythic=mythic
 if(packageKey==='legendaryPackage')assert.ok(rows.every(r=>r.rarity!=='common'))
 console.log(`${B.PACKAGES[packageKey].label}: ${py.price/1e6}M; Rare+ ${(rare*100).toFixed(2)}%; Mythic ${(mythic*100).toFixed(2)}%`)
}

const guaranteeParity=JSON.parse(execFileSync('python3',['-c',`
import importlib.machinery,json
import importlib.util
loader=importlib.machinery.SourceFileLoader('ps',${JSON.stringify(dir+'bin/omapkdex-sync')})
spec=importlib.util.spec_from_loader(loader.name,loader)
ps=importlib.util.module_from_spec(spec)
loader.exec_module(ps)
result={}
for package in ps.PACKAGES:
 keys,weights=ps.pack_pool(package,rngesus_only=True)
 result[package]={'limit':ps.rngesus_meter({},package)['limit'],'odds':dict(zip(keys,[w/sum(weights) for w in weights]))}
print(json.dumps(result))
`],{encoding:'utf8'}))
for(const key of B.PACKAGE_ORDER){
 const limit=guaranteeParity[key].limit
 assert.equal(B.PACKAGES[key].meterLimit,limit)
 assert.equal(B.rngesusMeter(null,key).tokens,0)
 assert.equal(B.rngesusMeter({rngesusMeters:{[key]:limit-1}},key).ready,false)
 assert.equal(B.rngesusMeter({rngesusMeters:{[key]:limit}},key).ready,true)
 assert.equal(B.rngesusMeter({rngesusMeters:{[key]:limit+100}},key).tokens,limit)
 const rows=B.packRewards(key,true)
 assert.equal(rows.length,3)
 assert.ok(Math.abs(rows.reduce((s,r)=>s+r.chance,0)-1)<1e-12)
 for(const row of rows){
  assert.ok(['legendary','mythical'].includes(row.rarity))
  assert.ok(Math.abs(row.chance-guaranteeParity[key].odds[row.key])<1e-12)
 }
}
assert.equal(B.rngesusMeter({rngesusMeters:{poorPackage:50000000}},'fancyPackage').tokens,0)
console.log('PASS: RNGesus thresholds, independent meters, guarantee eligibility and Python/JS odds parity')
