import fs from 'node:fs';
import assert from 'node:assert/strict';
const load = n => JSON.parse(fs.readFileSync(new URL(`../../seed/customer-trust-challenge.v${n}.json`,import.meta.url)));

function common(seed, label) {
 assert.equal(seed.program.code,'CTC-BPDSULTENG',label);
 assert.equal(seed.items.find(i=>i.key==='PRE').questions.length,10,label);
 assert.equal(seed.items.find(i=>i.key==='POST').questions.length,10,label);
 assert.deepEqual(seed.worksheets.map(x=>x.key),['LK1','LK2','LK3','LK4','LK5'],label);
 assert.equal(new Set(seed.items.map(i=>i.key)).size,seed.items.length,`${label}: duplicate item key`);
 for(const item of seed.items) {
  assert.ok(item.key&&item.type&&Number.isInteger(item.module),`${label}:${item.key}`);
  if(item.correct) assert.ok(item.options['ABCD'.indexOf(item.correct)],`${label}:${item.key}`);
  for(const question of item.questions||[]) if(question.correct) assert.ok(question.options?.['ABCD'.indexOf(question.correct)],`${label}:${item.key}`);
 }
}

// v1 is published in production and immutable; it must stay byte-identical in shape.
const v1 = load(1);
common(v1,'v1');
assert.equal(v1.items.length,16);
assert.deepEqual(v1.items.filter(x=>x.type==='single_choice').map(x=>x.key),
 ['RF1','RF2','RF3','RF4','SC1','SC2','M4Q1','K1','K2','K3','K4']);

// v2 follows deck revision 13 (83 slides): adds the Trust Equation quiz (slide 15).
const v2 = load(2);
common(v2,'v2');
assert.equal(v2.release?.version_no,2);
assert.equal(v2.items.length,17);
assert.deepEqual(v2.items.filter(x=>x.type==='single_choice').map(x=>x.key),
 ['TE1','RF1','RF2','RF3','RF4','SC1','SC2','M4Q1','K1','K2','K3','K4']);
const slides = v2.items.filter(i=>i.slide!=null).map(i=>i.slide);
assert.deepEqual(slides,[...slides].sort((a,b)=>a-b),'v2 items must follow deck slide order');
assert.ok(slides.every(s=>s>=1&&s<=v2.release.deck_slides),'v2 slide out of deck range');
for(const q of v2.items.find(i=>i.key==='EVAL').questions)
 assert.ok([q.scale,q.options,q.type==='open_text'].filter(Boolean).length===1,'EVAL question must be scale, options or open_text');
console.info('PASS: v1 16 items/11 scenarios; v2 17 items/12 scenarios; 20 test questions and 5 worksheets each.');
