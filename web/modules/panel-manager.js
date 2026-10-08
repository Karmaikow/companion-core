import { preferences } from './preferences.js';

/** Desktop window placement lives only in UI preferences. Mobile uses its own sheets. */
export class PanelManager {
  constructor(surface) {
    this.surface = surface;
    this.panels = [...surface.querySelectorAll('.panel[data-panel]')];
    try { this.saved = JSON.parse(preferences.get('mayuna-layout-v2')) || {}; } catch { this.saved = {}; }
    if (typeof this.saved !== 'object' || Array.isArray(this.saved)) this.saved = {};
    this.media = matchMedia('(min-width: 921px)');
    this.z = 25;
    const list = document.querySelector('#panelControls');
    for (const panel of this.panels) {
      const id = panel.dataset.panel;
      const title = panel.querySelector('h2,h3').textContent;
      const header = panel.querySelector('.panel-titlebar');
      let actions = header.querySelector('.panel-window-actions');
      if (!actions) { actions = document.createElement('div'); actions.className = 'panel-window-actions'; header.append(actions); }
      actions.innerHTML = `<button type="button" data-window-min aria-label="Minimizar ${title}">−</button><button type="button" data-window-close aria-label="Fechar ${title}">×</button>`;
      const toggle = document.createElement('button');
      toggle.className = 'secondary-button'; toggle.textContent = title;
      toggle.addEventListener('click', () => { this.saved[id] = { ...this.saved[id], closed: false, minimized: false }; this.apply(panel); this.persist(); });
      list.append(toggle);
      actions.querySelector('[data-window-close]').addEventListener('click', () => { this.saved[id] = { ...this.saved[id], closed: true }; this.apply(panel); this.persist(); });
      actions.querySelector('[data-window-min]').addEventListener('click', () => { this.saved[id] = { ...this.saved[id], minimized: !this.saved[id]?.minimized }; this.apply(panel); this.persist(); });
      header.tabIndex = 0;
      header.setAttribute('aria-label', `${title}: arraste ou use Alt e setas para mover`);
      header.addEventListener('pointerdown', e => this.drag(e, panel));
      header.addEventListener('keydown', e => {
        if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !this.media.matches) return;
        e.preventDefault();
        const box = panel.getBoundingClientRect(), base = this.surface.getBoundingClientRect();
        this.move(panel, box.left - base.left + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0), box.top - base.top + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0));
        this.persist();
      });
      this.apply(panel);
    }
    document.querySelector('#resetLayout').addEventListener('click', () => { this.saved = {}; this.panels.forEach(p => this.apply(p)); this.persist(); });
    this.observer = new ResizeObserver(() => this.panels.forEach(p => this.apply(p)));
    this.observer.observe(surface);
    this.media.addEventListener('change', () => this.panels.forEach(p => this.apply(p)));
  }
  persist() { preferences.set('mayuna-layout-v2', JSON.stringify(this.saved)); }
  apply(panel) {
    const state = this.saved[panel.dataset.panel] || {};
    panel.hidden = !!state.closed;
    panel.classList.toggle('is-minimized', !!state.minimized);
    const min = panel.querySelector('[data-window-min]');
    min.textContent = state.minimized ? '+' : '−'; min.setAttribute('aria-expanded', String(!state.minimized));
    if (this.media.matches && Number.isFinite(state.x) && Number.isFinite(state.y)) this.move(panel, state.x, state.y);
    else { panel.classList.remove('is-floating'); panel.style.removeProperty('left'); panel.style.removeProperty('top'); }
  }
  move(panel, x, y) {
    panel.classList.add('is-floating');
    const box = this.surface.getBoundingClientRect();
    // Reserve bottom action rail. Always retain a reachable titlebar on short screens.
    const width = Math.min(248, box.width);
    panel.style.width = `${width}px`;
    const rail = document.querySelector('.bottom-hud').getBoundingClientRect().height + 10;
    panel.style.maxHeight = `${Math.max(48, box.height - rail)}px`;
    x = Math.max(0, Math.min(x, box.width - width));
    y = Math.max(0, Math.min(y, box.height - rail - Math.min(panel.offsetHeight, box.height - rail)));
    panel.style.left = `${x}px`; panel.style.top = `${y}px`;
    this.saved[panel.dataset.panel] = { ...this.saved[panel.dataset.panel], x, y };
  }
  drag(event, panel) {
    if (!this.media.matches || event.button !== 0 || event.target.closest('button')) return;
    const header = event.currentTarget, rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left, offsetY = event.clientY - rect.top;
    panel.style.zIndex = String(++this.z);
    header.setPointerCapture(event.pointerId);
    const move = e => { const base = this.surface.getBoundingClientRect(); this.move(panel, e.clientX - base.left - offsetX, e.clientY - base.top - offsetY); };
    const stop = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', stop); header.removeEventListener('pointercancel', stop); this.persist(); };
    header.addEventListener('pointermove', move); header.addEventListener('pointerup', stop); header.addEventListener('pointercancel', stop);
  }
}
