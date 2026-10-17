import {cloudAuth} from './cloud-vault.js';
import {cloudConfig} from './runtime-mode.js';
// Session storage is origin-scoped. Never copy JWTs through URLs between deployments.
export function accessPanel(container,onChange){
  document.querySelector('#storage')?.addEventListener('change',e=>{try{sessionStorage.setItem('companion-studio.scope.v1',e.target.value);}catch{}});
  const panel=document.createElement('div');panel.className='access-panel';
  const login=document.createElement('a');login.href='/studio-login.html?return='+encodeURIComponent(location.pathname);login.textContent='Entrar na conta / trocar conta';
  const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Já entrei · conferir acesso';retry.onclick=()=>onChange();
  const local=document.createElement('button');local.type='button';local.className='secondary';local.textContent='Usar biblioteca neste navegador';local.onclick=()=>{const select=document.querySelector('#storage');select.value='local';select.dispatchEvent(new Event('change'));};
  const note=document.createElement('small');note.textContent='Online exige login neste mesmo domínio. Conta sem ADM: catálogo em leitura. Local: sem login, sem sincronização automática.';
  panel.append(login,retry,local,note);container.append(panel);
  if(!cloudConfig?.url){login.hidden=true;retry.hidden=true;}
  window.addEventListener('storage',e=>{if(e.key==='companion-core.supabase.session.v1')onChange();});
  return {refresh:async()=>{try{const user=cloudConfig?.url?await cloudAuth.currentUser():null;login.textContent=user?'Conta conectada · abrir conta':'Entrar na conta Companion Core';}catch{login.textContent='Entrar novamente na conta';}}};
}

export function preferredScope(){const requested=new URLSearchParams(location.search).get('storage');if(['cloud','local'].includes(requested))return requested;try{return sessionStorage.getItem('companion-studio.scope.v1')||'cloud';}catch{return 'cloud';}}
