export const DIRECTIONS=['S','SW','W','NW','N','NE','E','SE'];
export const ACTIONS=['idle','walk','fly','attack'];
export function validateAtlas(input,width,height){
  if(!input||input.version!==1)throw Error('Formato de sprites incompatível.');
  const a=structuredClone(input);
  for(const k of ['frameWidth','frameHeight','columns','rows'])if(!Number.isInteger(a[k])||a[k]<1)throw Error('Grade inválida.');
  if(a.columns*a.rows>256||a.frameWidth*a.columns!==width||a.frameHeight*a.rows!==height||width*height>16777216)throw Error('A grade deve corresponder ao PNG, com até 256 quadros e 16 milhões de pixels.');
  if(!a.pivot||![a.pivot.x,a.pivot.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('Ponto de apoio inválido.');
  if(!a.clips||typeof a.clips!=='object')throw Error('Adicione pelo menos uma animação.');
  let count=0;
  for(const [action,dirs] of Object.entries(a.clips)){
    if(!ACTIONS.includes(action)||!dirs||typeof dirs!=='object')throw Error('Animação inválida.');
    for(const [dir,clip] of Object.entries(dirs)){
      if(!DIRECTIONS.includes(dir)||!Array.isArray(clip.frames)||!clip.frames.length||clip.frames.length>64||!clip.frames.every(n=>Number.isInteger(n)&&n>=0&&n<a.columns*a.rows)||!Number.isFinite(clip.fps)||clip.fps<1||clip.fps>30)throw Error('Sequência de quadros inválida.');
      count++;
    }
  }
  if(!count)throw Error('Adicione pelo menos uma animação.');
  return a;
}
export function selectClip(atlas,action,direction){
  const dirs=atlas.clips[action]||atlas.clips.idle||Object.values(atlas.clips)[0];
  if(dirs[direction])return {clip:dirs[direction],flip:false,exact:true};
  const mirrored={W:'E',NW:'NE',SW:'SE',E:'W',NE:'NW',SE:'SW'}[direction];
  if(atlas.mirror&&mirrored&&dirs[mirrored])return {clip:dirs[mirrored],flip:true,exact:false};
  // Missing viewpoints are explicit drafts, never synthesized rotations of the illustration.
  return {clip:dirs.S||dirs.SE||dirs.E||Object.values(dirs)[0],flip:false,exact:false};
}
export function frameRect(atlas,index){return {x:(index%atlas.columns)*atlas.frameWidth,y:Math.floor(index/atlas.columns)*atlas.frameHeight,w:atlas.frameWidth,h:atlas.frameHeight};}
export function spritePrompt({action='walk',direction='SE',frames=8}={}){
  if(!ACTIONS.includes(action)||!DIRECTIONS.includes(direction)||!Number.isInteger(frames)||frames<1||frames>16)throw Error('Pedido de animação inválido.');
  const poses={idle:'gentle breathing and blinking with both feet planted',walk:'alternating left and right bird feet, contact, passing and lift, wings folded',fly:'coherent wing upstroke and downstroke with stable body',attack:'anticipation, short beak strike, recovery'};
  return `Use the attached character reference, preserving anatomy, colors, feathers and jewelry. Produce ${frames} sequential frames in one horizontal strip, equal cells, same scale and foot anchor. Animation: ${action}: ${poses[action]}. Direction ${direction} in screen space (S faces viewer, N faces away, E faces right), slightly elevated camera. Hand-painted fantasy 2D, soft cool diffuse lighting, transparent PNG, no floor, no shadows, no text, no grid. Complete character within every cell. Animate in place. Loop smoothly except attack. Do not change viewpoint between frames.`;
}
