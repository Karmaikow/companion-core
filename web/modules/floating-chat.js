import { preferences } from './preferences.js';

/** Only HUD geometry lives here; messages and Core state remain outside. */
export class FloatingChat {
  constructor(root, world) {
    this.root = root;
    this.world = world;
    this.button = root.querySelector('#minimizeChat');
    this.button?.addEventListener('click', () => this.setMinimized(!root.classList.contains('is-chat-minimized')));
    this.observer = new ResizeObserver(() => {
      const key = matchMedia('(max-width: 920px)').matches ? 'mobile' : 'desktop';
      if (this.layout !== key) { this.layout = key; this.restore(); }
    });
    this.observer.observe(world);
    this.observer.observe(root);
    this.sizeObserver = new ResizeObserver(() => {
      if (this.layout === 'desktop') {
        preferences.set('mayuna-chat-size-desktop', JSON.stringify({ width: root.offsetWidth, height: root.offsetHeight }));
      }
    });
    this.sizeObserver.observe(root);
  }

  restore() {
    if (this.layout === 'desktop') {
      try {
        const size = JSON.parse(preferences.get('mayuna-chat-size-desktop'));
        if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
          this.root.style.width = `${Math.max(300, Math.min(size.width, this.world.clientWidth - 16))}px`;
          this.root.style.height = `${Math.max(250, Math.min(size.height, this.world.clientHeight - 112))}px`;
        }
      } catch {}
    } else {
      this.root.style.width = '';
      this.root.style.height = '';
    }
  }

  setMinimized(value) {
    this.root.classList.toggle('is-chat-minimized', value);
    if (this.button) {
      this.button.textContent = value ? '+' : '—';
      this.button.setAttribute('aria-label', value ? 'Restaurar conversa' : 'Minimizar conversa');
      this.button.setAttribute('aria-expanded', String(!value));
    }
  }

  refreshPosition() {
    if (this.world.clientWidth && this.world.clientHeight) this.restore();
  }
}
