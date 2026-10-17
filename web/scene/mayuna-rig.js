import * as THREE from 'three';

// Authored study, not a reconstruction of the painted reference.
export function createMayuna(){
 const rig=new THREE.Group();rig.name='MayunaBirdStudy';
 const bones=[],byName={};
 function bone(name,pos,parent){const b=new THREE.Bone();b.name=name;b.position.set(...pos);(parent||rig).add(b);bones.push(b);byName[name]=b;return b;}
 const root=bone('root',[0,0,0]),body=bone('body',[0,.8,0],root);
 bone('head',[0,.75,.12],body);bone('wingL',[-.48,.35,0],body);bone('wingR',[.48,.35,0],body);bone('tail',[0,.1,-.35],body);
 bone('footL',[-.22,.18,.08],root);bone('footR',[.22,.18,.08],root);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(128,128);
 let seed=19;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=224+(seed%30);pixels.data.set([n,n,n,255],i);}ctx.putImageData(pixels,0,0);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const materials={};for(const [name,color]of Object.entries({blue:'#2965bf',light:'#559ee5',dark:'#142e67',cream:'#f7ebda',gold:'#d9a84d',black:'#11192e',iris:'#2388ee',white:'#ffffff'}))materials[name]=new THREE.MeshToonMaterial({color,map:texture});
 const parts=[];
 function mesh(geometry,name,mat){const m=new THREE.SkinnedMesh(geometry,materials[mat]);m.name=name;rig.add(m);parts.push(m);return m;}
 function skin(g,b){const n=g.attributes.position.count,index=bones.indexOf(byName[b]);const ids=new Uint16Array(n*4),weights=new Float32Array(n*4);for(let i=0;i<n;i++){ids[i*4]=index;weights[i*4]=1;}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));}
 function oval(name,pos,scale,mat,b='body',rot=[0,0,0]){const g=new THREE.SphereGeometry(1,24,16);g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale)));skin(g,b);return mesh(g,name,mat);}
 function feather(name,start,end,width,mat,b){const a=new THREE.Vector3(...start),d=new THREE.Vector3(...end).sub(a),verts=[],uv=[],idx=[];const axis=d.clone().normalize(),side=new THREE.Vector3(1,0,0);if(Math.abs(axis.dot(side))>.9)side.set(0,0,1);side.cross(axis).normalize();const normal=axis.clone().cross(side).normalize();
  for(let i=0;i<=16;i++){const t=i/16,w=Math.pow(Math.sin(Math.PI*t),.75)*width;for(let j=0;j<=8;j++){const q=j/8*Math.PI*2,p=a.clone().addScaledVector(d,t).addScaledVector(side,Math.cos(q)*w).addScaledVector(normal,Math.sin(q)*w*.2+.12*Math.sin(Math.PI*t));verts.push(p.x,p.y,p.z);uv.push(j/8,t);if(i<16&&j<8){const k=i*9+j;idx.push(k,k+9,k+1,k+1,k+9,k+10);}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();skin(g,b);mesh(g,name,mat);
 }
 oval('body',[0,.91,0],[.57,.68,.43],'blue');oval('breast',[0,.88,.32],[.44,.53,.22],'cream');
 oval('head',[0,1.62,.12],[.62,.57,.49],'blue','head');
 for(const s of [-1,1]){
  oval('cheek',[s*.29,1.48,.48],[.29,.30,.12],'cream','head');
  oval('eye-outline',[s*.27,1.70,.535],[.185,.218,.064],'dark','head');
  oval('eye',[s*.27,1.70,.586],[.143,.177,.035],'iris','head');
  oval('pupil',[s*.27,1.72,.612],[.078,.125,.022],'black','head');
  oval('eye-glint',[s*.27-.036,1.79,.631],[.035,.044,.012],'white','head');
  oval('eye-glint-small',[s*.27+.036,1.63,.626],[.016,.022,.01],'white','head');
  const wing=s<0?'wingL':'wingR',foot=s<0?'footL':'footR';
  oval('wing',[s*.52,1.02,-.01],[.19,.40,.27],'dark',wing,[0,0,s*.16]);
  for(let i=0;i<6;i++)feather('wing-feather',[s*(.44+i*.025),1.30-i*.035,.14-i*.065],[s*(.61+i*.025),.56-i*.032,-.16-i*.045],.115,i%2?'blue':'light',wing);
  oval('ankle',[s*.22,.19,.08],[.052,.17,.05],'dark',foot);
  for(let i=-1;i<=1;i++)oval('toe',[s*.22+i*.055,.055,.19],[.033,.035,.16],'dark',foot,[0,i*.25,0]);
  for(let i=0;i<3;i++)feather('face-tuft',[s*.43,1.60-i*.1,.13],[s*(.69-i*.025),1.36-i*.09,.12],.13,'blue','head');
 }
 oval('beak',[0,1.49,.63],[.115,.09,.14],'gold','head');
 for(let i=-2;i<=2;i++)feather('crest',[i*.075,2.00,.02],[i*.14,2.48-Math.abs(i)*.12,-.25],.12,i%2?'light':'blue','head');
 for(let i=-2;i<=2;i++)feather('tail',[i*.07,.84,-.30],[i*.26,1.10+(.2-Math.abs(i)*.06),-1.10-Math.abs(i)*.07],.16,i%2?'light':'blue','tail');
 for(let i=-2;i<=2;i++)feather('chest-feather',[i*.13,1.19,.43],[i*.14,.74,.46],.10,'cream','body');
 function gem(name,pos,size,b){const g=new THREE.OctahedronGeometry(size);g.scale(.7,1,.35);g.translate(...pos);skin(g,b);mesh(g,name,'iris');}
 oval('pendant-gold',[0,1.10,.51],[.14,.18,.045],'gold');gem('sapphire',[0,1.10,.56],.14,'body');
 gem('forehead-mark',[0,1.98,.49],.10,'head');
 rig.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);for(const m of parts)m.bind(skeleton);
 const rest=new Map(bones.map(b=>[b,b.position.clone()]));
 function pose(action,t){for(const b of bones){b.rotation.set(0,0,0);b.position.copy(rest.get(b));b.scale.set(1,1,1);}const phase=t*Math.PI*2;
  if(action==='walk'){byName.footL.rotation.x=Math.sin(phase)*.5;byName.footR.rotation.x=-Math.sin(phase)*.5;byName.footL.position.y+=Math.max(0,Math.sin(phase))*.08;byName.footR.position.y+=Math.max(0,-Math.sin(phase))*.08;body.position.y+=.035*(1-Math.cos(phase*2));body.rotation.z=Math.sin(phase)*.035;byName.tail.rotation.x=Math.sin(phase)*.08;}
  else if(action==='attack'){const pulse=Math.sin(Math.PI*Math.min(1,t));body.rotation.x=pulse*.32;byName.head.rotation.x=pulse*.22;byName.wingL.rotation.z=-pulse*.65;byName.wingR.rotation.z=pulse*.65;}
  else{body.scale.set(1+Math.sin(phase)*.012,1+Math.sin(phase)*.018,1+Math.sin(phase)*.012);byName.head.rotation.z=Math.sin(phase)*.018;}
  rig.updateMatrixWorld(true);
 }
 const clips=['idle','walk','attack'].map(action=>{const tracks=[],times=Array.from({length:9},(_,i)=>i/8),samples=bones.map(()=>({position:[],quaternion:[],scale:[]}));for(const t of times){pose(action,t);bones.forEach((b,i)=>{samples[i].position.push(...b.position);samples[i].quaternion.push(...b.quaternion);samples[i].scale.push(...b.scale);});}bones.forEach((b,i)=>{tracks.push(new THREE.VectorKeyframeTrack(b.name+'.position',times,samples[i].position),new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,samples[i].quaternion),new THREE.VectorKeyframeTrack(b.name+'.scale',times,samples[i].scale));});return new THREE.AnimationClip(action,1,tracks);});pose('idle',0);
 return {rig,bones,skeleton,pose,clips,version:'mayuna-bird-study-0.1',seed:19};
}
