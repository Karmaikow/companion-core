export const DIRECTIONS=['S','SW','W','NW','N','NE','E','SE'];
export const ACTIONS=['idle','walk','fly','attack','hurt','faint','pet','sleep','happy','defend'];
export function validateAtlas(input,width,height){
  if(!input||input.version!==1)throw Error('Formato de sprites incompatível.');
  const a=structuredClone(input);
  for(const k of ['frameWidth','frameHeight','columns','rows'])if(!Number.isInteger(a[k])||a[k]<1)throw Error('Grade inválida.');
  if(a.columns*a.rows>512||a.frameWidth*a.columns!==width||a.frameHeight*a.rows!==height||width*height>16777216)throw Error('A grade deve corresponder ao PNG, com até 512 quadros e 16 milhões de pixels.');
  if(!a.pivot||![a.pivot.x,a.pivot.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('Ponto de apoio inválido.');
  if(!a.clips||typeof a.clips!=='object')throw Error('Adicione pelo menos uma animação.');
  let count=0;
  for(const [action,dirs] of Object.entries(a.clips)){
    if(!ACTIONS.includes(action)||!dirs||typeof dirs!=='object')throw Error('Animação inválida.');
    for(const [dir,clip] of Object.entries(dirs)){
      if(!DIRECTIONS.includes(dir)||!Array.isArray(clip.frames)||!clip.frames.length||clip.frames.length>64||!clip.frames.every(n=>Number.isInteger(n)&&n>=0&&n<a.columns*a.rows)||!Number.isFinite(clip.fps)||clip.fps<1||clip.fps>30)throw Error('Sequência de quadros inválida.');
      if(clip.loop!==undefined&&typeof clip.loop!=='boolean')throw Error('Repetição inválida.');
      count++;
    }
  }
  if(!count)throw Error('Adicione pelo menos uma animação.');
  return a;
}
export function selectClip(atlas,action,direction){
  const dirs=atlas.clips[action]||atlas.clips.idle||Object.values(atlas.clips)[0];
  if(dirs[direction])return {clip:dirs[direction],flip:false,exact:Boolean(atlas.clips[action]?.[direction])};
  const mirrored={W:'E',NW:'NE',SW:'SE',E:'W',NE:'NW',SE:'SW'}[direction];
  if(atlas.mirror&&mirrored&&dirs[mirrored])return {clip:dirs[mirrored],flip:true,exact:false};
  // Missing viewpoints are explicit drafts, never synthesized rotations of the illustration.
  return {clip:dirs.S||dirs.SE||dirs.E||Object.values(dirs)[0],flip:false,exact:false};
}
export function frameRect(atlas,index){return {x:(index%atlas.columns)*atlas.frameWidth,y:Math.floor(index/atlas.columns)*atlas.frameHeight,w:atlas.frameWidth,h:atlas.frameHeight};}
export function spritePrompt({action='walk',direction='SE',frames=8}={}){
  if(!ACTIONS.includes(action)||!DIRECTIONS.includes(direction)||!Number.isInteger(frames)||frames<1||frames>16)throw Error('Pedido de animação inválido.');
  const poses={idle:'gentle breathing and blinking with both feet planted',walk:'species-appropriate alternating steps, contact, passing and lift, stable anatomy',fly:'coherent wing upstroke and downstroke with stable body',attack:'anticipation, short strike appropriate to the species, recovery',hurt:'brief impact reaction and recovery without changing identity',faint:'lose balance and settle gently on the floor, hold the final pose',pet:'gentle affectionate response, relaxed eyes and small body movement',sleep:'lie down sleeping, eyes closed, subtle breathing, stable resting body',happy:'joyful species-appropriate bounce and expression, return to starting pose',defend:'brace defensively, lower center of gravity, subtle steady breathing'};
  return `Use the attached character reference, preserving anatomy, colors, feathers and jewelry. Produce ${frames} sequential frames in one horizontal strip, equal cells, same scale and foot anchor. Animation: ${action}: ${poses[action]}. Direction ${direction} in screen space (S faces viewer, N faces away, E faces right), orthographic 3/4 camera elevated about 35 degrees, identical to the Companion World camera. Hand-painted fantasy 2D, soft cool diffuse lighting, transparent PNG, no floor, no shadows, no text, no grid. Complete character within every cell. Animate in place. Loop smoothly for idle, walk, fly, sleep, happy or defend; other actions have anticipation, action and recovery (faint holds its end pose). Do not change viewpoint between frames.`;
}


export function coverage(atlas){return ACTIONS.map(action=>({action,directions:DIRECTIONS.map(direction=>({direction,frames:atlas?.clips[action]?.[direction]?.frames.length||0}))}));}
export function godotSpriteFrames(atlas){
 let next=1,resources=[],animations=[];
 for(const [action,dirs]of Object.entries(atlas.clips))for(const [dir,clip]of Object.entries(dirs)){
  const frames=clip.frames.map(frame=>{const id=next++,r=frameRect(atlas,frame);resources.push(`[sub_resource type="AtlasTexture" id="Atlas_${id}"]\natlas = ExtResource("1")\nregion = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})\n`);return `{ "duration": 1.0, "texture": SubResource("Atlas_${id}") }`;});
  animations.push(`{ "frames": [${frames.join(', ')}], "loop": ${clip.loop??['idle','walk','fly','sleep','happy','defend'].includes(action)}, "name": &"${action}_${dir}", "speed": ${clip.fps}.0 }`.replace(/(\d+\.\d+)\.0/g,'$1'));
 }
 return `[gd_resource type="SpriteFrames" load_steps=${next+1} format=3]\n\n[ext_resource type="Texture2D" path="res://atlas.png" id="1"]\n\n${resources.join('\n')}\n[resource]\nanimations = [${animations.join(',\n')}]\n`;
}
