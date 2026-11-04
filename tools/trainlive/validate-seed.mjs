import fs from 'node:fs';
import assert from 'node:assert/strict';
const seed = JSON.parse(fs.readFileSync(new URL('../../seed/customer-trust-challenge.v1.json',import.meta.url)));
assert.equal(seed.program.code,'CTC-BPDSULTENG');
assert.equal(seed.items.length,16);
assert.equal(seed.items.filter(i=>i.type==='single_choice').length,11);
assert.equal(seed.items.find(i=>i.key==='PRE').questions.length,10);
assert.equal(seed.items.find(i=>i.key==='POST').questions.length,10);
assert.deepEqual(seed.worksheets.map(x=>x.key),['LK1','LK2','LK3','LK4','LK5']);
assert.deepEqual(seed.items.filter(x=>x.type==='single_choice').map(x=>x.key),
 ['RF1','RF2','RF3','RF4','SC1','SC2','M4Q1','K1','K2','K3','K4']);
for(const item of seed.items) {
 assert.ok(item.key&&item.type&&Number.isInteger(item.module));
 if(item.correct) assert.ok(item.options['ABCD'.indexOf(item.correct)],item.key);
 for(const question of item.questions||[]) assert.ok(question.options['ABCD'.indexOf(question.correct)],item.key);
}
console.info('PASS: 16 items, 11 scenarios, 20 test questions, 5 worksheets.');
