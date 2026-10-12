// Only the app-owned, loopback WebView exposes these three fixed native actions.
export function bindAndroidShell(onAction = () => {}) {
  const bridge = window.CompanionAndroid;
  if (!bridge || typeof bridge.appAction !== 'function') return false;
  document.body.classList.add('android-shell');
  document.querySelectorAll('[data-android-only]').forEach(element => { element.hidden = false; });
  document.querySelectorAll('[data-android-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.androidAction;
      if (!['conversation', 'help', 'diagnostics'].includes(action)) return;
      document.querySelectorAll('.gate-app-menu').forEach(menu => { menu.open = false; });
      onAction();
      bridge.appAction(action);
    });
  });
  document.querySelector('#androidLogout')?.addEventListener('click', () => { onAction(); document.querySelector('#logoutButton')?.click(); });
  document.querySelector('#androidReconnect')?.addEventListener('click', () => { onAction(); document.querySelector('#retryConnection')?.click(); });
  return true;
}
