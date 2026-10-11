const dialog = document.querySelector('#noticeDialog');
const icon = document.querySelector('#noticeIcon');
const title = document.querySelector('#noticeTitle');
const message = document.querySelector('#noticeMessage');

export function notifyNotice({ title: heading, message: detail, type = 'info' }) {
  if (!dialog || !heading || !detail) return;
  const kind = ['success', 'error', 'info'].includes(type) ? type : 'info';
  dialog.dataset.type = kind;
  dialog.setAttribute('role', kind === 'error' ? 'alertdialog' : 'dialog');
  icon.textContent = kind === 'success' ? '✦' : kind === 'error' ? '!' : '✧';
  title.textContent = heading;
  message.textContent = detail;
  if (dialog.open) dialog.close();
  dialog.showModal();
  document.querySelector('#noticeDismiss').focus();
}

document.querySelector('#noticeDismiss')?.addEventListener('click', () => dialog?.close());
dialog?.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
