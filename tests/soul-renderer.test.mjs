import test from 'node:test';
import assert from 'node:assert/strict';
import { HolographicCoreRenderer } from '../web/modules/game-viewport.js';
test('changing UI color never changes permanent soul color; legacy identities stay blue',()=>{
 const renderer=new HolographicCoreRenderer();
 renderer.setState({identity:{name:'Aurora'},profile:{appearance:{soulColor:'#64834b'}}});
 assert.equal(renderer.soulAccent,'100, 131, 75');
 renderer.setTheme('255, 0, 0');assert.equal(renderer.accent,'255, 0, 0');assert.equal(renderer.soulAccent,'100, 131, 75');
 renderer.setState({identity:{name:'Mayuna'},profile:{}});assert.equal(renderer.soulAccent,'63, 140, 255');
});
