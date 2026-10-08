// UI preferences only. Never store Companion state, rewards or credentials here.
export const preferences = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private mode: keep UI usable. */ } }
};
