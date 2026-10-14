import { mode } from './runtime-mode.js';
const $=id=>document.getElementById(id);
const panel=$('desktopConversation');
const form=$('desktopAIForm');
let loaded=false;let profiles={};
const supported=mode==='local'&&!window.CompanionAndroid;
if(supported){panel.hidden=false;$('desktopConversationShortcut').hidden=false;$('desktopConversationTopShortcut').hidden=false;}

function fields(){
  const provider=$('desktopAIProvider').value;
  $('desktopGroqGuide').hidden=provider!=='groq';
  $('desktopAIUrlLabel').hidden=!['ollama','compatible'].includes(provider);
  $('desktopAIModelLabel').hidden=!['ollama','openai','compatible'].includes(provider);
  $('desktopAISecretLabel').hidden=['environment','shared'].includes(provider);
  $('desktopAISave').disabled=provider==='environment';
}
async function load(){
  if(!supported||loaded)return;
  try{const response=await fetch('/api/conversation/settings',{cache:'no-store'});if(!response.ok){$('desktopAIStatus').textContent=response.status===401?'Entre no acesso local para configurar a IA.':'Configuração indisponível. Reinicie o Core atualizado e tente novamente.';return;}const data=await response.json();profiles=data.profiles||{};loaded=true;panel.hidden=false;$('desktopConversationShortcut').hidden=false;$('desktopAIProvider').value=data.provider;$('desktopAIModel').value=data.model;$('desktopAIUrl').value=data.baseUrl;$('desktopAIFree').checked=data.freePlanConfirmed;$('desktopAIStatus').textContent=data.hasSecret?'Credencial salva neste computador.':'';fields();}catch{$('desktopAIStatus').textContent='Não foi possível conectar ao Core. Abra as configurações novamente para tentar.';}
}
$('desktopAIProvider').addEventListener('change',()=>{const saved=profiles[$('desktopAIProvider').value];$('desktopAISecret').value='';$('desktopAIModel').value=saved?.model||'';$('desktopAIUrl').value=saved?.baseUrl||'http://127.0.0.1:11434';$('desktopAIFree').checked=saved?.freePlanConfirmed||false;$('desktopAIStatus').textContent=saved?.hasSecret?'Credencial deste serviço já salva.':'';fields();});
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=$('desktopAISave');button.disabled=true;
  try{const response=await fetch('/api/conversation/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:$('desktopAIProvider').value,model:$('desktopAIModel').value,baseUrl:$('desktopAIUrl').value,secret:$('desktopAISecret').value,freePlanConfirmed:$('desktopAIFree').checked})});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível salvar.');profiles=data.profiles||{};$('desktopAISecret').value='';$('desktopAIStatus').textContent='Configuração salva. A próxima conversa usará este serviço, sem reiniciar o Core.';}catch(error){$('desktopAIStatus').textContent=error.message;}finally{fields();}
});
document.addEventListener('click',event=>{if(event.target.closest('[data-open-panel="settings"]'))void load();});
void load();

document.getElementById('logoutButton')?.addEventListener('click',()=>{$('desktopAISecret').value='';loaded=false;$('desktopAISave').disabled=true;});

if(supported){fields();new MutationObserver(()=>{if(!document.body.classList.contains('is-locked'))void load();}).observe(document.body,{attributes:true,attributeFilter:['class']});}
