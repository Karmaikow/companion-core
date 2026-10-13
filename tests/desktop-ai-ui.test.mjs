import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('desktop conversation remains discoverable after initial unauthorized request and reloads after login',async()=>{
 const code=(await readFile('web/modules/desktop-conversation.js','utf8')).replace("import { mode } from './runtime-mode.js';",'');
 const nodes=new Map();const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,value:'environment',checked:false,disabled:false,textContent:'',addEventListener(){}});return nodes.get(id);};
 let observer;let authenticated=false;
 const context={mode:'local',window:{},document:{getElementById:element,addEventListener(){},body:{classList:{contains:()=>!authenticated}}},MutationObserver:class{constructor(cb){observer=cb;}observe(){}},fetch:async()=>authenticated?{ok:true,json:async()=>({provider:'groq',model:'',baseUrl:'',hasSecret:true,freePlanConfirmed:true})}:{ok:false,status:401}};
 vm.runInNewContext(code,context);await new Promise(r=>setImmediate(r));
 assert.equal(element('desktopConversationTopShortcut').hidden,false);
 assert.equal(element('desktopConversationShortcut').hidden,false);
 assert.match(element('desktopAIStatus').textContent,/Entre/);
 authenticated=true;observer();await new Promise(r=>setImmediate(r));
 assert.equal(element('desktopAIProvider').value,'groq');assert.equal(element('desktopConversation').hidden,false);
});
