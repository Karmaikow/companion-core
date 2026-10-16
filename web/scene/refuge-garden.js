import * as THREE from 'three';

// A small, deterministic painted garden. Geometry and navigation share positions.
export const GARDEN_OBSTACLES=[{x:-1,z:-8,w:5.8,d:4.2},{x:6,z:2,w:6.4,d:4.6}];
const TREE_POSITIONS=[[-10,-9,1.3],[-6,-11,1.15],[5,-10,1.4],[10,-6,1.2],[-11,-2,1.1],[-10,6,1.2],[11,9,1.2],[-6,12,.9],[11,-11,1.4]];
export function createGarden(scene){
 let seed=73;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const obstacles=GARDEN_OBSTACLES.map(o=>({...o}));
 const group=new THREE.Group();group.name='painted-garden';scene.add(group);
 const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,flatShading:true});
 const mesh=(geometry,mat,x,y,z,parent=group)=>{const o=new THREE.Mesh(geometry,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const c=canvas.getContext('2d'),unit=2048/36;
 c.fillStyle='#71874b';c.fillRect(0,0,2048,2048);
 const colors=['#7b9552','#849b58','#657d43','#95a85e','#5d763f','#a2af67'];
 for(let i=0;i<14000;i++){c.fillStyle=colors[i%colors.length];c.globalAlpha=.10+random()*.19;c.beginPath();c.ellipse(random()*2048,random()*2048,4+random()*35,3+random()*15,random()*Math.PI,0,Math.PI*2);c.fill();}c.globalAlpha=1;
 const px=x=>(x+18)*unit;
 const pathX=z=>-1+Math.sin((z+8)*.20)*1.9;
 function routePoint(t,branch){return branch?{x:1+t*5,z:3-t*1.1}:{x:pathX(-6+t*20),z:-6+t*20};}
 function road(branch){
  c.lineCap='round';c.lineJoin='round';const width=branch?1.9:2.8;
  for(const [extra,color]of [[.48,'#617747'],[.25,'#a7a17b'],[0,'#b9ac8c']]){c.beginPath();for(let i=0;i<=100;i++){const p=routePoint(i/100,branch);i?c.lineTo(px(p.x),px(p.z)):c.moveTo(px(p.x),px(p.z));}c.strokeStyle=color;c.lineWidth=(width+extra)*unit;c.stroke();}
  const count=branch?10:32;
  for(let i=0;i<count;i++)for(let k=0;k<3;k++){
   const t=(i+.5)/count,p=routePoint(t,branch),next=routePoint(t+.001,branch),angle=Math.atan2(next.z-p.z,next.x-p.x),offset=(k-1)*width/3;
   c.save();c.translate(px(p.x-Math.sin(angle)*offset),px(p.z+Math.cos(angle)*offset));c.rotate(angle);
   c.fillStyle=['#d1c4a3','#c2b594','#e0d1af','#b9b18f'][(i+k)%4];c.strokeStyle='#8f8d70';c.lineWidth=2.5;c.beginPath();c.roundRect(-unit*.25,-unit*width/6+2,unit*.48,unit*width/3-5,7);c.fill();c.stroke();c.restore();
  }
 }
 road(false);road(true);
 for(let i=0;i<22000;i++) {const x=random()*36-18,z=random()*36-18;if(Math.abs(x-pathX(z))<1.8&&z>-7&&z<15)continue;if(x>0&&x<7&&Math.abs(z-(3-(x-1)*.22))<1.3)continue;c.strokeStyle=i%2?'#bdc88066':'#3f633b55';c.lineWidth=1.5;c.beginPath();c.moveTo(px(x),px(z));c.lineTo(px(x)+2,px(z)-3-random()*5);c.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const ground=mesh(new THREE.PlaneGeometry(36,36),new THREE.MeshStandardMaterial({map:texture,roughness:1}),0,0,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
 mesh(new THREE.BoxGeometry(36,.8,36),material('#5b6350'),0,-.44,0);
 // Broad, soft tree canopies replace the metallic, fragmented placeholder foliage.
 const foliageCanvas=document.createElement('canvas');foliageCanvas.width=foliageCanvas.height=256;const leaf=foliageCanvas.getContext('2d');leaf.fillStyle='#a7b987';leaf.fillRect(0,0,256,256);
 for(let i=0;i<650;i++){const x=random()*256,y=random()*256;leaf.fillStyle=['#d4dba1','#8fa774','#b9c78e','#6e905e'][i%4];leaf.globalAlpha=.28;leaf.beginPath();leaf.ellipse(x,y,5+random()*13,3+random()*7,-.5,0,Math.PI*2);leaf.fill();}leaf.globalAlpha=1;
 const foliageMap=new THREE.CanvasTexture(foliageCanvas);foliageMap.colorSpace=THREE.SRGBColorSpace;
 const barkCanvas=document.createElement('canvas');barkCanvas.width=barkCanvas.height=128;const barkPaint=barkCanvas.getContext('2d');barkPaint.fillStyle='#9b825e';barkPaint.fillRect(0,0,128,128);
 for(let i=0;i<20;i++){const x=random()*128;barkPaint.strokeStyle=i%2?'#6d604566':'#d4b98b55';barkPaint.lineWidth=2+random()*4;barkPaint.beginPath();barkPaint.moveTo(x,0);barkPaint.bezierCurveTo(x-10,40,x+10,90,x,128);barkPaint.stroke();}
 const barkMap=new THREE.CanvasTexture(barkCanvas);barkMap.colorSpace=THREE.SRGBColorSpace;
 const bark=new THREE.MeshStandardMaterial({map:barkMap,roughness:1}),leaves=['#88a06d','#9aaf75','#b2c183'].map(color=>new THREE.MeshStandardMaterial({color,map:foliageMap,roughness:1})),stone=material('#a6ad93');
 for(const [x,z,s]of TREE_POSITIONS){
  const tree=new THREE.Group();tree.position.set(x,0,z);tree.scale.setScalar(s);group.add(tree);
  mesh(new THREE.CylinderGeometry(.18,.35,2.6,7),bark,0,1.3,0,tree);
  for(const [dx,dy,dz,r]of [[0,3.3,0,1.5],[-.8,2.8,.2,1.15],[.8,3,.3,1.25],[0,3.8,-.3,1.1]]){const crown=mesh(new THREE.SphereGeometry(r,12,8),leaves[Math.floor(random()*3)],dx,dy,dz,tree);crown.scale.y=.8;}
  obstacles.push({x,z,w:.7*s,d:.7*s});
 }
 // Pond: earth bank, pale stone edging, opaque stylized water (no costly reflections).
 const pond=new THREE.Group();pond.position.set(6,0,2);group.add(pond);
 const bank=mesh(new THREE.CylinderGeometry(1,1.05,.14,48),material('#9caa7b'),0,.06,0,pond);bank.scale.set(3.45,1,2.5);
 const water=mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:'#64b8b1',roughness:.42,metalness:.05}),0,.15,0,pond);water.rotation.x=-Math.PI/2;water.scale.set(3.05,2.08,1);water.castShadow=false;
 for(let i=0;i<32;i++){const a=i/32*Math.PI*2;const rock=mesh(new THREE.IcosahedronGeometry(.25+random()*.16,0),stone,Math.cos(a)*3.25,.16,Math.sin(a)*2.3,pond);rock.scale.set(1.2,.65,1);rock.rotation.y=random()*6;}
 const ripples=[];
 for(let i=0;i<4;i++){const ring=mesh(new THREE.RingGeometry(.5+i*.42,.515+i*.42,64),new THREE.MeshBasicMaterial({color:'#dbefcf',transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide}),0,.17,0,pond);ring.rotation.x=-Math.PI/2;ring.scale.set(1.3,.8,1);ring.castShadow=false;ripples.push(ring);}
 // Sanctuary: cream stone steps, columns and a sapphire crystal focal point.
 const shrine=new THREE.Group();shrine.position.set(-1,0,-8);group.add(shrine);
 const pale=material('#d8d2b5'),trim=material('#92aaa0'),blue=material('#487d94');
 for(let i=0;i<3;i++)mesh(new THREE.BoxGeometry(5.6-i*.35,.18,3.8-i*.25),i===2?pale:trim,0,.09+i*.18,0,shrine);
 for(const x of [-2,2])for(const z of [-1.1,1.1]) {mesh(new THREE.CylinderGeometry(.23,.29,2.8,8),pale,x,1.9,z,shrine);mesh(new THREE.BoxGeometry(.72,.18,.72),trim,x,3.35,z,shrine);}
 mesh(new THREE.BoxGeometry(5.2,.28,3.2),pale,0,3.55,0,shrine);
 const roof=mesh(new THREE.ConeGeometry(3.65,1.3,4),blue,0,4.3,0,shrine);roof.rotation.y=Math.PI/4;roof.scale.z=.72;
 mesh(new THREE.CylinderGeometry(.85,1,.35,8),trim,0,.72,0,shrine);
 const crystal=mesh(new THREE.OctahedronGeometry(.84),new THREE.MeshStandardMaterial({color:'#7bcfe0',emissive:'#237d9a',emissiveIntensity:.35,roughness:.35,metalness:.1}),0,1.75,0,shrine);crystal.scale.y=1.45;
 // Low detail ground dressing, shared geometry/materials to keep the mobile scene small.
 const tuftGeometry=new THREE.ConeGeometry(.20,.5,4),tuftMaterial=material('#658449'),flowerGeometry=new THREE.IcosahedronGeometry(.08,0),flowerMaterial=material('#e7d89e');
 for(let i=0;i<110;i++){const x=random()*29-14.5,z=random()*29-14.5;if(Math.abs(x-pathX(z))<2.1||obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.8&&Math.abs(z-o.z)<o.d/2+.8))continue;
  const tuft=mesh(tuftGeometry,tuftMaterial,x,.22,z);tuft.scale.y=.6+random()*.6;tuft.castShadow=false;
  if(i%3===0)mesh(flowerGeometry,flowerMaterial,x+.12,.38,z+.05).castShadow=false;
 }
 for(const [x,z]of [[-5,4],[-4,-4],[9,6],[-7,9],[5,10]]){const rock=mesh(new THREE.IcosahedronGeometry(.55,0),stone,x,.25,z);rock.scale.set(1.4,.65,1);}
 return {ground,obstacles,update(time,reduced){if(reduced)return;crystal.rotation.y=time*.00018;for(let i=0;i<ripples.length;i++)ripples[i].material.opacity=.13+.1*Math.sin(time*.0014+i);}};
}
