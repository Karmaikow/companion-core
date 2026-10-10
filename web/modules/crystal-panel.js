import { request } from './http.js';
import { mode } from './runtime-mode.js';
export class CrystalPanel {
 constructor(onChange){
  this.onChange=onChange;this.root=document.querySelector('#crystalPanel');this.feedback=document.querySelector('#crystalFeedback');
  document.querySelector('#crystalRecollect').addEventListener('click',()=>void this.run('recollect'));
  document.querySelector('#crystalAwaken').addEventListener('click',()=>void this.run('awaken'));
  document.querySelector('#crystalCancel').addEventListener('click',()=>void this.run('cancel'));
  document.querySelector('#crystalRefresh').addEventListener('click',()=>void this.refresh());
 }
 async call(action,body){const response=await request('/api/crystal/'+action,{cache:'no-store',signal:AbortSignal.timeout(45_000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok){const error=Error(data.error||'Não foi possível usar o Cristal.');error.details=data.details;throw error;}return data;}
 describe(server){if(!server||server.status==='unregistered')return 'Esta Companion ainda não possui uma sessão no registro central.';const date=new Date(server.lastSeen).toLocaleString('pt-BR');return `${server.status==='active'?'Autorizada':'Recolhida'} em ${server.device.name} · ${server.device.platform}. Sessão ${server.sessionId}. Início: ${new Date(server.startedAt).toLocaleString('pt-BR')}. Último contato: ${date}. Ausência de contato não libera outra sessão.`;}
 async refresh(){
  this.root.hidden=mode==='connect'||mode==='demo';if(this.root.hidden)return;
  try{this.status=await this.call('status');document.querySelector('#crystalDevice').value ||= this.status.deviceName||'';
   document.querySelector('#crystalSession').textContent=this.status.configured?(this.status.unavailable?this.status.message:(this.status.pendingImport?'Há um despertar pendente: retome o mesmo Cristal com sua senha. ':'')+this.describe(this.status.server)):'O Cristal precisa de um registro central configurado para controlar as sessões entre dispositivos.';
   for(const id of ['crystalRecollect','crystalAwaken','crystalCancel'])document.getElementById(id).disabled=!this.status.configured;
   document.querySelector('#crystalRecollect').hidden=!this.status.hasCompanion;
   document.querySelector('#crystalCancel').hidden=!['exporting','recollected'].includes(this.status.phase);
   document.querySelector('#crystalRecollect').textContent=['exporting','recollected'].includes(this.status.phase)?'Baixar Cristal novamente':'Recolher ao Cristal';
  }catch(e){this.feedback.textContent=e.message;}
 }
 async run(action){
  if(this.busy)return;this.busy=true;this.feedback.textContent='';for(const button of this.root.querySelectorAll('button'))button.disabled=true;
  try{
   const password=document.querySelector('#crystalPassword').value,deviceName=document.querySelector('#crystalDevice').value;
   let body={password,deviceName};
   if(action==='awaken'){
    const file=document.querySelector('#crystalFile').files[0];if(!file)throw Error('Selecione seu arquivo .companion.');if(file.size>12_000_000)throw Error('O Cristal ultrapassa o limite desta versão.');
    body.file=await file.text();const recoveryCode=document.querySelector('#crystalRecovery').value.trim();
    if(recoveryCode){if(!document.querySelector('#crystalRevokeConfirm').checked)throw Error('Confirme a revogação da sessão anterior para recuperar o acesso.');body.recoveryCode=recoveryCode;}
   }
   const result=await this.call(action,body);
   if(result.file){const url=URL.createObjectURL(new Blob([result.file],{type:'application/octet-stream'}));const link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
   if(result.recoveryCode){const output=document.querySelector('#crystalRecoveryOutput');output.hidden=false;document.querySelector('#crystalRecoveryCode').textContent=result.recoveryCode;}
   this.feedback.textContent=action==='recollect'?'Companion recolhida. Guarde o arquivo e a senha. Se o download falhar, baixe novamente ou cancele o recolhimento.':action==='cancel'?'Recolhimento cancelado. A Companion pode continuar aqui.':'Companion importada e selecionada no Hub. As outras Companions continuam disponíveis para alternar. Guarde o novo código de recuperação.';
   document.querySelector('#crystalPassword').value='';document.querySelector('#crystalRecovery').value='';document.querySelector('#crystalRevokeConfirm').checked=false;
   await this.onChange?.();
  }catch(e){this.feedback.textContent=e.message+(e.details?` ${this.describe(e.details)}`:'');}
  finally{this.busy=false;for(const button of this.root.querySelectorAll('button'))button.disabled=false;await this.refresh();}
 }
}
