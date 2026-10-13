import { CompanionBodyRenderer } from './companion-body.js';
import { manifestationStatus } from './manifestation-rules.js';
/** Renderer contract: mount(host), resize(width,height,dpr), setTheme(rgb),
 * setState(readOnlyDTO), setPresence(status), render(ms), destroy().
 * A future Phaser adapter can implement this contract without knowing the API/Core.
 */
export class GameViewport {
  constructor(host, renderer = new HolographicCoreRenderer()) {
    this.host = host; this.renderer = renderer; this.raf = 0; this.last = 0; this.running = false;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.visibility = () => this.schedule();
  }
  mount() {
    this.renderer.mount(this.host);
    this.observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      this.renderer.resize(width, height, Math.min(devicePixelRatio || 1, 1.5));
      this.renderer.render(0);
    });
    this.observer.observe(this.host);
    document.addEventListener('visibilitychange', this.visibility);
    this.motion.addEventListener('change', this.visibility);
    this.running = true; this.schedule();
  }
  schedule() {
    cancelAnimationFrame(this.raf);
    if (!this.running || document.hidden) return;
    if (this.motion.matches) { this.renderer.render(0); return; }
    const tick = time => {
      if (time - this.last >= 1000 / 30) { this.renderer.render(time); this.last = time; }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  setTheme(rgb) { this.renderer.setTheme(rgb); if (this.motion.matches) this.renderer.render(0); }
  setState(state) { this.renderer.setState(structuredClone(state)); if(this.motion.matches) this.renderer.render(0); }
  setFormPreview(value) { this.renderer.setFormPreview(value); this.renderer.render(this.motion.matches ? 0 : this.last); }
  setPresence(status) {
    this.host.dataset.presence = status;
    const label = document.querySelector('#entityPresence');
    if (label) label.textContent = status === 'thinking' ? 'Em conexão com você' : status === 'offline' ? 'Aguardando conexão' : 'Conectada ao núcleo';
    this.renderer.setPresence(status);
  }
  pause() { this.running = false; cancelAnimationFrame(this.raf); }
  resume() { this.running = true; this.schedule(); }
  destroy() {
    this.running = false; cancelAnimationFrame(this.raf); this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.visibility); this.motion.removeEventListener('change', this.visibility);
    this.renderer.destroy();
  }
}

/** Lightweight procedural world. Architecture cached once per resize/theme,
 * only soul + motes animate. No textures, dependencies or per-frame style reads. */
/** Procedural sapphire-blue core chamber; soul identity remains in the Companion DTO. */
export class HolographicCoreRenderer {
  constructor() { this.accent = '63, 140, 255'; this.soulAccent='63, 140, 255'; this.width = 1; this.height = 1; this.presence = 'idle'; this.hover = false; this.hoverAmount = 0; this.lastRenderTime = 0; }
  mount(host) {
    this.host = host;
    this.canvas = document.createElement('canvas'); this.canvas.id = 'worldCanvas';
    this.canvas.setAttribute('aria-label', 'Sua Companion em forma de alma no Refúgio');
    host.append(this.canvas); this.ctx = this.canvas.getContext('2d');
    this.background = document.createElement('canvas');
    this.target = document.querySelector('.entity-target');
    this.enter = () => { this.hover = true; };
    this.leave = () => { this.hover = false; };
    this.target?.addEventListener('pointerenter', this.enter);
    this.target?.addEventListener('pointerleave', this.leave);
  }
  setState(state) {
    const changed = this.state?.identity?.id !== state.identity?.id;
    this.state=state;
    if(changed || state.core?.evolutionStage !== 'SOUL') this.preview=false;
    this.formStatus=state.core ? (state.manifestation || manifestationStatus(state)) : null;
    this.updateBody();
    const hex=state.profile?.appearance?.soulColor;
    this.soulAccent=/^#[0-9a-f]{6}$/i.test(hex||'')?[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', '):'63, 140, 255';
    this.canvas?.setAttribute('aria-label',`${state.identity.name}: ${this.formStatus?.stageName || "Alma"} no Refúgio`);
  }
  setFormPreview(value) { this.preview=Boolean(value && this.state?.core?.evolutionStage==='SOUL'); this.updateBody(); }
  updateBody() {
    const active = Boolean(this.formStatus && (this.formStatus.hasBody || this.preview));
    if(active && this.host && !this.body) { this.body=new CompanionBodyRenderer();this.body.mount(this.host);this.body.onChange=()=>{this.render(0);this.host.dispatchEvent(new Event('companion-art-status'));}; }
    if(active && this.body) { this.body.setRecipe(this.formStatus.recipe,this.state.artwork,this.state.identity.id); if(this.body.canvas) this.body.canvas.hidden=false; }
    else if(this.body?.canvas) this.body.canvas.hidden=true;
    this.bodyActive=active;
    this.canvas?.setAttribute('aria-label', `${this.state?.identity?.name || 'Sua Companion'}: ${this.preview ? 'prévia da forma nascente' : this.formStatus?.stageName || 'alma'} no Refúgio`);
  }
  setPresence(status) { this.presence = status; }
  setTheme(rgb) { this.accent = rgb; if (this.ctx) this.cacheScene(); }
  resize(w, h, dpr) {
    this.width = Math.max(1, w); this.height = Math.max(1, h); this.dpr = dpr;
    for (const canvas of [this.canvas, this.background]) { canvas.width = Math.round(this.width * dpr); canvas.height = Math.round(this.height * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cacheScene();
  }
  cacheScene() {
    const c = this.background.getContext('2d'), w = this.width, h = this.height, a = this.accent;
    c.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    c.fillStyle = '#040a15'; c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * .5, h * .42, 0, w * .5, h * .42, w * .68);
    glow.addColorStop(0, '#112c53'); glow.addColorStop(.42, '#0a1930'); glow.addColorStop(1, '#040914');
    c.fillStyle = glow; c.fillRect(0, 0, w, h);

    // Holographic diagnostic rings inspired by the Companion orbital core.
    const cx = w * .5, cy = h * .45, radius = Math.min(w * .37, h * .46);
    c.save(); c.translate(cx, cy);
    for (let ring = 0; ring < 5; ring++) {
      const r = radius * (.42 + ring * .145);
      c.beginPath(); c.ellipse(0, 0, r, r * (ring < 2 ? .91 : .96), 0, 0, Math.PI * 2);
      c.strokeStyle = ring === 2 ? `rgba(${a},.46)` : `rgba(65,166,255,${.1 + ring * .025})`;
      c.lineWidth = ring === 2 ? 1.2 : .7; c.stroke();
    }
    for (let i = 0; i < 96; i++) {
      const angle = i / 96 * Math.PI * 2, inner = radius * .78, outer = inner + (i % 8 === 0 ? 11 : 3);
      c.strokeStyle = `rgba(87,190,255,${i % 8 === 0 ? .54 : .18})`; c.lineWidth = i % 8 === 0 ? 1 : .7;
      c.beginPath(); c.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); c.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); c.stroke();
    }
    // Short cyan arcs make the core feel like an active instrument panel.
    for (let arc = 0; arc < 4; arc++) {
      const r = radius * (.5 + arc * .13), start = -Math.PI * .8 + arc * .88;
      c.beginPath(); c.ellipse(0, 0, r, r * .94, 0, start, start + .52);
      c.strokeStyle = `rgba(${a},${.65 - arc * .08})`; c.lineWidth = arc === 0 ? 2 : 1.1; c.shadowColor = `rgb(${a})`; c.shadowBlur = 9; c.stroke(); c.shadowBlur = 0;
    }
    c.restore();

    // Fine circuit traces flank the orbital display.
    for (const side of [-1, 1]) {
      const x = cx + side * radius * 1.06;
      for (let row = 0; row < 4; row++) {
        const y = cy - radius * .55 + row * radius * .37, length = radius * (.18 + (row % 2) * .12);
        c.strokeStyle = `rgba(60,167,255,${.18 + row * .025})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + side * 12, y); c.lineTo(x + side * 12, y + radius * .08); c.lineTo(x + side * length, y + radius * .08); c.stroke();
        c.fillStyle = `rgba(${a},.48)`; c.beginPath(); c.arc(x + side * length, y + radius * .08, 1.5, 0, Math.PI * 2); c.fill();
      }
    }

    // Perspective energy grid, like a digital floor under the soul.
    const horizon = h * .69, floor = c.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, 'rgba(6,28,59,.04)'); floor.addColorStop(1, 'rgba(5,42,83,.3)');
    c.fillStyle = floor; c.fillRect(0, horizon, w, h - horizon);
    c.strokeStyle = 'rgba(48,148,235,.19)'; c.lineWidth = .7;
    for (let i = -12; i <= 12; i++) {
      c.beginPath(); c.moveTo(cx + i * 3, horizon); c.lineTo(cx + i * w * .12, h); c.stroke();
    }
    for (let row = 1; row <= 12; row++) {
      const t = row / 12, y = horizon + (h - horizon) * t * t;
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
    // Soft cyan edge light leaves the center open for the Companion.
    const edge = c.createLinearGradient(0, h * .78, 0, h);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(2,8,18,.72)');
    c.fillStyle = edge; c.fillRect(0, h * .78, w, h * .22);
  }

  render(time = 0) {
    if (!this.ctx) return;
    const c = this.ctx, w = this.width, h = this.height, a = this.soulAccent;
    const dt = Math.min(64, Math.max(0, time - this.lastRenderTime));
    this.lastRenderTime = time;
    this.hoverAmount += ((this.hover ? 1 : 0) - this.hoverAmount) * (1 - Math.exp(-dt / 220));
    const hoverScale = 1 + this.hoverAmount * .09;
    c.clearRect(0,0,w,h); c.drawImage(this.background,0,0,w,h);
    const scale = Math.min(w/850,h/590), x = w*.5, y = (w <= 920 ? h*.49 : h*.73 - 120*scale) + Math.sin(time*.0013)*7;
    // Soul presence is visual, never a gameplay/evolution mutation.
    const r = Math.max(22,42*scale) * (this.presence === 'thinking' ? 1.1 : 1);
    if(this.bodyActive && this.body?.available) {
      this.body.resize(w,h,this.dpr,x,y);this.body.render(time,this.hoverAmount,this.presence==='thinking');
    } else {
    const auraRadius = r * (3.4 + this.hoverAmount * .25);
    const aura = c.createRadialGradient(x,y,0,x,y,auraRadius);
    aura.addColorStop(0,'rgba(180,232,255,.65)');aura.addColorStop(.2,`rgba(${a},.4)`);aura.addColorStop(1,`rgba(${a},0)`);
    c.fillStyle=aura;c.fillRect(x-auraRadius,y-auraRadius,auraRadius*2,auraRadius*2);
    c.save();c.translate(x,y);c.scale(hoverScale,hoverScale);
    const energy=c.createRadialGradient(0,0,0,0,0,r*1.6);
    energy.addColorStop(0,'#fff');energy.addColorStop(.12,'#e6f6ff');energy.addColorStop(.3,`rgba(${a},.95)`);energy.addColorStop(.48,`rgba(${a},.68)`);energy.addColorStop(.75,`rgba(${a},.15)`);energy.addColorStop(1,`rgba(${a},0)`);
    c.fillStyle=energy;c.beginPath();c.arc(0,0,r*1.6,0,Math.PI*2);c.fill();c.globalCompositeOperation='screen';
    for(let ring=0;ring<4;ring++){
      c.save();c.rotate(time*.00018*(ring%2?-1:1)+ring*.9);c.strokeStyle=`rgba(${a},.7)`;c.lineWidth=1;c.shadowColor=`rgb(${a})`;c.shadowBlur=8;
      c.beginPath();c.ellipse(0,0,r*(1.3+ring*.28),r*(.36+ring*.12),.4,0,Math.PI*2);c.stroke();
      const phase=time*.0012+ring*1.8;c.fillStyle='#d7eeff';c.beginPath();c.arc(Math.cos(phase)*r*(1.3+ring*.28),Math.sin(phase)*r*(.36+ring*.12),2,0,Math.PI*2);c.fill();c.restore();
    }
    for(let strand=0;strand<5;strand++){
      c.beginPath();c.strokeStyle=`rgba(${a},.6)`;c.lineWidth=1;
      for(let j=0;j<=50;j++){const t=j/50*Math.PI*2,radius=r*(.6+.12*Math.sin(t*4+time*.0015+strand));const px=Math.cos(t+strand)*radius,py=Math.sin(t)*radius;if(j===0)c.moveTo(px,py);else c.lineTo(px,py);}c.stroke();
    }
    for(let i=0;i<28;i++){const phase=time*.00035+i*2.4,radius=r*(1.2+(i%7)*.22);c.fillStyle=`rgba(${a},${.3+(i%4)*.15})`;c.beginPath();c.arc(Math.cos(phase)*radius,Math.sin(phase)*radius*.65,i%5===0?1.9:1,0,Math.PI*2);c.fill();}
    c.restore();
    }
    for(let i=0;i<35;i++){
      const px=(((i*127.1+time*.006)%1000)/1000)*w, py=(((i*61.7-time*.01)%700+700)%700)/700*h;
      c.fillStyle=`rgba(163,223,243,${.12+(i%3)*.1})`;c.beginPath();c.arc(px,py,i%4===0?1.5:.7,0,Math.PI*2);c.fill();
    }
  }
  destroy() { this.target?.removeEventListener('pointerenter',this.enter); this.target?.removeEventListener('pointerleave',this.leave); this.body?.destroy(); this.canvas?.remove(); this.background = null; this.ctx = null; }
}
