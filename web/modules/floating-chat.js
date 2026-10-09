import { preferences } from './preferences.js';

/** Chat stays anchored; only its dimensions are adjustable. */
export class FloatingChat {
  constructor(root, world) {
    this.root = root;
    this.world = world;
    this.button = root.querySelector('#minimizeChat');
    this.button?.addEventListener('click', () => this.setMinimized(!root.classList.contains('is-chat-minimized')));
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'chat-resize-handle';
    handle.textContent = '⤢';
    handle.title = 'Arraste para cima ou para a esquerda para ampliar';
    handle.setAttribute('aria-label', 'Ajustar tamanho do chat: arraste ou use as setas');
    root.append(handle);
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: root.offsetWidth, height: root.offsetHeight };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (this.drag?.id !== event.pointerId) return;
      this.resize(this.drag.width + this.drag.x - event.clientX, this.drag.height + this.drag.y - event.clientY);
    });
    const finish = () => { if (this.drag) { this.drag = null; this.save(); } };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('keydown', event => {
      const delta = { ArrowLeft: [20, 0], ArrowRight: [-20, 0], ArrowUp: [0, 20], ArrowDown: [0, -20] }[event.key];
      if (!delta) return;
      event.preventDefault();
      this.resize(root.offsetWidth + delta[0], root.offsetHeight + delta[1]);
      this.save();
    });
    this.observer = new ResizeObserver(() => this.restore());
    this.observer.observe(world);
  }

  resize(width, height) {
    if (!this.world.clientWidth || !this.world.clientHeight) return;
    const heading = this.world.querySelector('.world-heading');
    const reservedTop = heading ? heading.offsetTop + heading.offsetHeight + 16 : 180;
    const bottom = parseFloat(getComputedStyle(this.root).bottom) || 44;
    const maxWidth = Math.max(0, this.world.clientWidth - 24);
    const maxHeight = Math.max(0, this.world.clientHeight - reservedTop - bottom);
    this.root.style.width = `${Math.min(maxWidth, Math.max(Math.min(290, maxWidth), width))}px`;
    this.root.style.height = `${Math.min(maxHeight, Math.max(Math.min(180, maxHeight), height))}px`;
  }

  save() {
    preferences.set('mayuna-chat-size-desktop', JSON.stringify({ width: this.root.offsetWidth, height: this.root.offsetHeight }));
  }

  restore() {
    if (!this.world.clientWidth || !this.world.clientHeight) return;
    if (matchMedia('(max-width: 920px)').matches) {
      this.root.style.width = '';
      this.root.style.height = '';
      return;
    }
    let size;
    try { size = JSON.parse(preferences.get('mayuna-chat-size-desktop')); } catch {}
    this.resize(Number.isFinite(size?.width) ? size.width : this.root.offsetWidth,
      Number.isFinite(size?.height) ? size.height : this.root.offsetHeight);
  }

  setMinimized(value) {
    this.root.classList.toggle('is-chat-minimized', value);
    if (this.button) {
      this.button.textContent = value ? '+' : '—';
      this.button.setAttribute('aria-expanded', String(!value));
    }
  }

  refreshPosition() { this.restore(); }
}
