import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describeColor,readableColor,SOUL_PALETTE} from '../dist/core/color-names.js';
import {AIContextBuilder} from '../dist/ai/ai-context.js';
import {resolveIdentityQuestion} from '../dist/ai/identity-grounding.js';
import {CompanionCore} from '../dist/core/core.js';
import {MAYUNA_PROFILE} from '../dist/companions/mayuna.js';

test('custom shades have Portuguese names; preset names and exact hex remain stable',()=>{
 for(const c of SOUL_PALETTE)assert.deepEqual(describeColor(c.hex.toUpperCase()),{...c,approximate:false});
 for(const [hex,name] of [['#faf80d','Amarelo vivo'],['#000000','Preto'],['#ffffff','Branco'],['#808080','Cinza'],['#001060','Azul escuro'],['#e8f0ff','Azul claro']]){
  const result=describeColor(hex);assert.equal(result.name,name);assert.equal(result.hex,hex);assert.equal(result.approximate,true);
 }
 assert.equal(readableColor('verde-musgo'),'verde-musgo');
 assert.throws(()=>describeColor('yellow'));
 assert.throws(()=>describeColor('#abc'));
});
test('browser and core execute the same compiled color naming module',async()=>{
 assert.equal(await readFile(new URL('../web/modules/color-names.js',import.meta.url),'utf8'),await readFile(new URL('../dist/core/color-names.js',import.meta.url),'utf8'));
});
test('legacy hex is translated for conversation without rewriting signed identity or favorites',()=>{
 const profile=structuredClone(MAYUNA_PROFILE);profile.appearance={soulColor:'#faf80d',formInfluences:[]};profile.preferences.favoriteColor='#bf6cff';
 const core=CompanionCore.create(profile);
 core.addMemory('IDENTITY_FORMING','Cor favorita de Didi','Didi contou que sua cor favorita é #faf80d.',90);
 const before=JSON.stringify(core.getData());
 const context=AIContextBuilder.build(core.getState(),'Qual a nossa cor favorita?');
 assert.match(context.systemPrompt,/Cor permanente da alma: amarelo vivo/);
 assert.doesNotMatch(context.systemPrompt,/#faf80d|#bf6cff/);
 const response=resolveIdentityQuestion(context);assert.match(response,/Você.*amarelo vivo/);assert.match(response,/Eu.*ametista/);assert.doesNotMatch(response,/#/);
 assert.equal(JSON.stringify(core.getData()),before);assert.equal(core.verifyLocal().valid,true);
});
