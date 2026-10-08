import { preferences } from './preferences.js';

/** Only HUD geometry lives here; messages and Core state remain outside. */
export class FloatingChat {
  constructor(root, world) {
    this.root = root;
    this.world = world;
    this.header = root.querySelector('.chat-header');
    this.button = root.querySelector('#minimizeChat');
    this.button.addEventListener('click', () => this.setMinimized(!root.classList.contains('is-chat-minimized')));
    this.header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: root.offsetLeft, top: root.offsetTop };
      this.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    this.header.addEventListener('pointermove', event => {
      if (this.drag?.id !== event.pointerId) return;
      this.place(this.drag.left + event.clientX - this.drag.x, this.drag.top + event.clientY - this.drag.y);
    });
    const finish = () => { if (this.drag) { this.drag = null; this.save(); } };
    this.header.addEventListener('pointerup', finish);
    this.header.addEventListener('pointercancel', finish);
    this.header.addEventListener('lostpointercapture', finish);
    this.header.addEventListener('keydown', event => {
      const step = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
      if (!event.altKey || !step || event.target !== this.header) return;
      event.preventDefault(); this.place(root.offsetLeft + step[0], root.offsetTop + step[1]); this.save();
    });
    this.observer = new ResizeObserver(() => {
      const key = matchMedia('(max-width: 920px)').matches ? 'mobile' : 'desktop';
      if (this.layout !== key) { this.layout = key; this.restore(); }
      else this.place(root.offsetLeft, root.offsetTop);
    });
    this.observer.observe(world);
  }

  place(left, top) {
    const maxLeft = Math.max(8, this.world.clientWidth - this.root.offsetWidth - 8);
    const maxTop = Math.max(8, this.world.clientHeight - this.root.offsetHeight - 36);
    Object.assign(this.root.style, { right: 'auto', bottom: 'auto', left: `${Math.max(8, Math.min(left, maxLeft))}px`, top: `${Math.max(8, Math.min(top, maxTop))}px` });
  }

  save() {
    preferences.set(`mayuna-chat-position-${this.layout}`, JSON.stringify({ x: this.root.offsetLeft / this.world.clientWidth, y: this.root.offsetTop / this.world.clientHeight }));
  }

  restore() {
    let position;
    try { position = JSON.parse(preferences.get(`mayuna-chat-position-${this.layout}`)); } catch {}
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) this.place(position.x * this.world.clientWidth, position.y * this.world.clientHeight);
    else this.place(this.world.clientWidth - this.root.offsetWidth - 12, this.world.clientHeight - this.root.offsetHeight - 36);
  }

  setMinimized(value) {
    this.root.classList.toggle('is-chat-minimized', value);
    this.button.textContent = value ? '+' : '—';
    this.button.setAttribute('aria-label', value ? 'Restaurar conversa' : 'Minimizar conversa');
    this.button.setAttribute('aria-expanded', String(!value));
    this.place(this.root.offsetLeft, this.root.offsetTop);
  }
}
