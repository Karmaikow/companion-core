import { describeColor } from './color-names.js';
export class CreationRitual {
 constructor(root){
  this.root=root;this.form=document.querySelector('#createCompanionForm');this.color=document.querySelector('#newSoulColor');this.traits=new Set();this.motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.color.addEventListener('input',()=>this.paintColor());
  document.querySelector('#creationTraits').addEventListener('click',event=>{
   const button=event.target.closest('[data-trait]');if(!button)return;
   if(this.traits.has(button.dataset.trait))this.traits.delete(button.dataset.trait);
   else {if(button.dataset.exclusive==='true')for(const other of button.closest('fieldset').querySelectorAll('[data-trait]'))this.traits.delete(other.dataset.trait);this.traits.add(button.dataset.trait);}
   for(const badge of document.querySelectorAll('[data-trait]'))badge.setAttribute('aria-pressed',String(this.traits.has(badge.dataset.trait)));
   this.summary();const hint=button.closest('fieldset').querySelector('.trait-description');if(hint)hint.textContent=button.dataset.description;
  });
  document.querySelector('#newCompanionName').addEventListener('input',()=>this.summary());
  document.querySelector('#creationCancel').addEventListener('click',()=>this.close());
  document.addEventListener('visibilitychange',()=>{if(!this.form.hidden)this.animate();});
  this.motion.addEventListener('change',()=>{if(!this.form.hidden)this.animate();});
 }
 configure(policy){
  this.policy=policy;const host=document.querySelector('#creationTraits');host.replaceChildren();
  for(const [index,group] of policy.groups.entries()){
   const field=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=group.title;field.append(legend);
   for(const option of group.options){const button=document.createElement('button');button.type='button';button.className='trait-badge';button.dataset.trait=option.id;button.dataset.exclusive=String(index>=5);button.setAttribute('aria-pressed',String(this.traits.has(option.id)));button.textContent=option.label;button.dataset.description=option.description||option.label;button.title=button.dataset.description;button.setAttribute('aria-describedby',`trait-help-${group.id}`);const describe=()=>{field.querySelector('.trait-description').textContent=button.dataset.description;};button.addEventListener('mouseenter',describe);button.addEventListener('focus',describe);field.append(button);}const hint=document.createElement('p');hint.id=`trait-help-${group.id}`;hint.className='trait-description';hint.textContent='Toque ou passe o mouse sobre um traço para conhecer sua inclinação.';hint.setAttribute('aria-live','polite');field.append(hint);host.append(field);
  }
  const palette=document.querySelector('#creationPalette');palette.replaceChildren();
  for(const color of policy.colors){const button=document.createElement('button');button.type='button';button.className='ritual-swatch';button.style.setProperty('--swatch',color.hex);button.setAttribute('aria-label',color.name);button.title=color.name;button.dataset.hex=color.hex;button.addEventListener('click',()=>{this.color.value=color.hex;this.paintColor();});palette.append(button);}
 }
 open(state){
  this.form.hidden=false;this.root.classList.add('is-creating');
  document.querySelector('#newOwnerName').value=state?.profile.companionOf.name||'';
  document.querySelector('#newPreferredAddress').value=state?.profile.companionOf.preferredAddress||'';
  this.paintColor();this.summary();this.animate();document.querySelector('#newCompanionName').focus();
 }
 close(){if(this.root.classList.contains('is-creating'))document.querySelector('#accessTitle').textContent='Seu Hub';this.form.hidden=true;this.root.classList.remove('is-creating');cancelAnimationFrame(this.raf);document.querySelector('#showCreateCompanion').focus();}
 reset(){this.form.reset();this.traits.clear();for(const b of document.querySelectorAll('[data-trait]'))b.setAttribute('aria-pressed','false');this.close();}
 paintColor(){this.form.style.setProperty('--soul',this.color.value);const color=describeColor(this.color.value);document.querySelector('#soulColorName').textContent=`${color.name}${color.approximate?' · nome aproximado':''}`;for(const b of document.querySelectorAll('[data-hex]'))b.setAttribute('aria-pressed',String(b.dataset.hex===this.color.value));this.draw(0);}
 summary(){const count=this.traits.size;document.querySelector('#creationSummary').textContent=`${document.querySelector('#newCompanionName').value.trim()||'Uma nova alma'} · ${count} traço${count===1?'':'s'} escolhido${count===1?'':'s'}`;}
 payload(){return {soulColor:this.color.value,traits:[...this.traits]};}
 animate(){cancelAnimationFrame(this.raf);if(this.form.hidden||document.hidden)return;if(this.motion.matches){this.draw(0);return;}let last=0;const tick=t=>{if(t-last>33){this.draw(t);last=t;}this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);}
 draw(t){const canvas=document.querySelector('#creationSoul');const c=canvas.getContext('2d');if(!c)return;const w=360,h=230;canvas.width=w;canvas.height=h;c.clearRect(0,0,w,h);const hex=this.color.value;const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
  const glow=c.createRadialGradient(180,112,2,180,112,105);glow.addColorStop(0,'#ffffff');glow.addColorStop(.12,hex);glow.addColorStop(.4,`rgba(${rgb},.3)`);glow.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=glow;c.fillRect(0,0,w,h);
  c.globalCompositeOperation='screen';for(let i=0;i<48;i++){const phase=t*.00065+i*2.4;const radius=18+(i%12)*6;const x=180+Math.cos(phase)*radius;const y=112+Math.sin(phase)*radius*.65-((t*.025+i*9)%38);c.strokeStyle=`rgba(${rgb},.65)`;c.lineWidth=1+(i%3);c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.sin(phase)*9,y+12,180+(x-180)*.7,125);c.stroke();c.fillStyle='#fff';c.beginPath();c.arc(x,y,1.2,0,Math.PI*2);c.fill();}c.globalCompositeOperation='source-over';
 }
}
