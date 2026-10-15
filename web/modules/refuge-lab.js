import { GameViewport } from './game-viewport.js';
const viewport=new GameViewport(document.getElementById('gameRenderer'));viewport.mount();
viewport.setState({identity:{id:'MC-MAYUNA-REFUGE-LAB',name:'Mayuna'},core:{evolutionStage:'AWAKENED',level:5,xp:0},profile:{appearance:{soulColor:'#3f8cff'}},manifestation:{hasBody:true,generation:1,stageName:'Pássaro',recipe:{}},artwork:null});
for(const [id,factor]of [['zoomIn',1.15],['zoomOut',1/1.15]])document.getElementById(id).onclick=()=>{const c=viewport.renderer.camera;if(c){c.zoom=Math.max(.65,Math.min(1.8,c.zoom*factor));c.updateProjectionMatrix();viewport.renderer.render(performance.now());}};
window.addEventListener('pagehide',()=>viewport.destroy(),{once:true});
if('serviceWorker'in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});
