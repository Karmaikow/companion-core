import { mode } from './runtime-mode.js';
import { request } from './http.js';
import { api } from './api.js';
export class AccessGate {
  constructor(onEnter,onLock) {
    this.onEnter=onEnter;this.onLock=onLock;this.root=document.querySelector('#accessGate');this.form=document.querySelector('#accessForm');this.remoteForm=document.querySelector('#remotePairForm');this.error=document.querySelector('#accessError');
    this.form.addEventListener('submit',e=>{e.preventDefault();void this.submit();});
    this.remoteForm.addEventListener('submit',e=>{e.preventDefault();void this.submitRemote();});
    document.querySelector('#enterWorld').addEventListener('click',()=>void this.enter());
    for(const id of ['logoutButton','gateLogout'])document.getElementById(id).addEventListener('click',()=>void this.logout());
    document.querySelector('#accessRetry').addEventListener('click',()=>void this.start());
    document.querySelector('#manageHub').addEventListener('click',()=>void this.openHub());
    document.querySelector('#hubButton').addEventListener('click',()=>void this.openHub());
    document.querySelector('#hubBack').addEventListener('click',()=>this.showContinuity());
    document.querySelector('#showCreateCompanion').addEventListener('click',()=>{document.querySelector('#createCompanionForm').hidden=false;document.querySelector('#newCompanionName').focus();});
    document.querySelector('#createCompanionForm').addEventListener('submit',event=>{event.preventDefault();void this.createCompanion();});
    document.querySelector('#hubCompanionList').addEventListener('click',event=>{const button=event.target.closest('[data-companion-id]');if(button)void this.selectCompanion(button.dataset.companionId);});
    window.addEventListener('mayuna:unauthorized',()=>void this.start());
  }
  async request(route,body) {
    const response=await request('/api/auth/'+route,{cache:'no-store',signal:AbortSignal.timeout(15000),...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível acessar.');return data;
  }
  async start() {
    this.onLock?.();this.root.hidden=false;document.querySelector('#appShell').inert=true;document.body.classList.add('is-locked');
    this.error.textContent='';this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#accessRetry').hidden=true;
    document.querySelector('#accessTitle').textContent='Conectando ao seu mundo';
    try{
      if(mode==='connect'){
        document.querySelector('#hubButton').hidden=true;document.querySelector('#manageHub').hidden=true;
        document.querySelector('#accessTitle').textContent='Reencontre sua Companion';
        document.querySelector('#accessSubtitle').textContent='Conecte esta interface ao Core que está com você.';
        document.querySelector('#remotePairSubmit').disabled=false;
        this.remoteForm.hidden=false;
        document.querySelector('#remotePairCode').focus();
        return;
      }
      document.querySelector('#hubButton').hidden=mode==='demo';
      const status=await this.request('status');if(status.authenticated){await this.continuity();return;}
      this.setup=!status.configured;this.form.hidden=false;
      document.querySelector('#accessTitle').textContent=this.setup?'Um acesso. Uma história.':'Sua história continua.';
      document.querySelector('#accessSubtitle').textContent=this.setup?'Crie seu acesso local para entrar no núcleo.':'Entre para reencontrar sua Companion.';
      document.querySelector('#accessSubmit').textContent=this.setup?'Criar acesso local':'Entrar no núcleo';
      document.querySelector('#confirmationField').hidden=!this.setup;document.querySelector('#accessConfirm').required=this.setup;
      document.querySelector('#accessPassword').autocomplete=this.setup?'new-password':'current-password';document.querySelector('#accessUsername').focus();
    }catch(error){this.error.textContent=error.message;document.querySelector('#accessRetry').hidden=false;}
  }
  async submitRemote() {
    const button=document.querySelector('#remotePairSubmit');if(button.disabled)return;
    const code=document.querySelector('#remotePairCode').value.trim();this.error.textContent='';button.disabled=true;button.textContent='Conectando com segurança…';
    try{
      await (await import('./api.js')).api.connect(code);
      this.remoteForm.reset();await this.continuity();
    }catch(error){
      this.error.textContent=error instanceof TypeError?'Não foi possível alcançar o Core local. Confirme que ele está aberto e permita o acesso à rede local se o navegador pedir.':error.message;
    }finally{button.disabled=false;button.textContent='Conectar à minha Companion';}
  }
  async submit() {
    const button=document.querySelector('#accessSubmit');if(button.disabled)return;
    const username=document.querySelector('#accessUsername').value,password=document.querySelector('#accessPassword').value;
    if(this.setup&&password!==document.querySelector('#accessConfirm').value){this.error.textContent='As senhas não coincidem.';return;}
    this.error.textContent='';button.disabled=true;
    try{await this.request(this.setup?'setup':'login',{username,password});this.form.reset();await this.continuity();}
    catch(error){this.error.textContent=error.message;}finally{button.disabled=false;}
  }
  async continuity() {
    const response=await request('/api/companion/state',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Não foi possível carregar a Companion. Tente entrar novamente.');
    const state=await response.json();this.state=state;this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#continuityScreen').hidden=false;
    document.querySelector('#manageHub').hidden=mode==='connect'||mode==='demo';
    if(mode!=='connect'&&mode!=='demo'){
      try{const hub=await api.companions();this.renderHub(hub.companions,state.identity.id);}
      catch(error){this.error.textContent=error.message;}
    }
    document.querySelector('#accessTitle').textContent=`${state.identity.name} está aqui.`;
    document.querySelector('#accessSubtitle').textContent=`Bem-vindo, ${state.profile.companionOf.preferredAddress}. Continue com sua Companion.`;
    for(const [id,value] of Object.entries({continuityName:state.identity.name,continuityId:state.identity.id,continuityStage:state.core.evolutionStage,continuityMemories:state.memories.length,continuityEvents:state.meta.eventCount,continuityMode:state.meta.provider==='mock'?'PRÉVIA · COMPANION DE DEMONSTRAÇÃO':'IDENTIDADE EXISTENTE · CONTINUIDADE LOCAL'}))document.getElementById(id).textContent=value;
    if (mode === 'demo') {
      document.querySelector('#accessTitle').textContent = 'Uma janela para o seu mundo.';
      document.querySelector('#accessSubtitle').textContent = 'Prévia da interface. Seu Core, sua identidade e suas memórias permanecem no seu dispositivo.';
      document.querySelector('#enterWorld').textContent = 'Explorar a interface';
      document.querySelector('#gateLogout').hidden = true; document.querySelector('#logoutButton').hidden = true;
    }
    if (mode === 'connect') {
      document.querySelector('#accessTitle').textContent = `${state.identity.name} está aqui.`;
      document.querySelector('#accessSubtitle').textContent = `Conectado ao Core local de ${state.profile.companionOf.preferredAddress}. A identidade e a história continuam no dispositivo.`;
      document.querySelector('#continuityMode').textContent = 'CORE LOCAL · CONEXÃO SEGURA';
      document.querySelector('#enterWorld').textContent = 'Continuar nossa história →';
    }
    document.querySelector('#enterWorld').focus();
  }
  async openHub(){
    if(mode==='connect'||mode==='demo')return;
    this.onLock?.();this.root.hidden=false;document.querySelector('#appShell').inert=true;document.body.classList.add('is-locked');
    document.querySelector('#accessTitle').textContent='Seu Hub';document.querySelector('#accessSubtitle').textContent='Escolha uma Companion ou desperte uma nova.';
    document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=false;this.error.textContent='';
    try{const hub=await api.companions();this.renderHub(hub.companions,hub.activeId);}
    catch(error){this.error.textContent=error.message;}
  }
  showContinuity(){document.querySelector('#hubScreen').hidden=true;document.querySelector('#continuityScreen').hidden=false;this.error.textContent='';}
  renderHub(companions,activeId){
    const list=document.querySelector('#hubCompanionList');list.replaceChildren();
    for(const companion of companions){
      const button=document.createElement('button');button.type='button';button.className='hub-companion-option';button.dataset.companionId=companion.id;
      const icon=document.createElement('span');icon.className='hub-soul';icon.textContent='✧';
      const details=document.createElement('span');const name=document.createElement('strong');name.textContent=companion.name;const meta=document.createElement('small');meta.textContent=`${companion.form} · ${companion.id}`;details.append(name,meta);button.append(icon,details);
      if(companion.id===activeId){const badge=document.createElement('span');badge.className='hub-active';badge.textContent='ATIVA';button.append(badge);}
      list.append(button);
    }
  }
  async selectCompanion(id){
    this.error.textContent='';
    try{await api.activateCompanion(id);await this.continuity();}
    catch(error){this.error.textContent=error.message;}
  }
  async createCompanion(){
    const button=document.querySelector('#createCompanionSubmit');if(button.disabled)return;button.disabled=true;this.error.textContent='';
    const profile={name:document.querySelector('#newCompanionName').value,ownerName:document.querySelector('#newOwnerName').value,preferredAddress:document.querySelector('#newPreferredAddress').value,archetype:document.querySelector('#newCompanionArchetype').value};
    try{await api.createCompanion(profile);document.querySelector('#createCompanionForm').reset();document.querySelector('#createCompanionForm').hidden=true;await this.continuity();}
    catch(error){this.error.textContent=error.message;}
    finally{button.disabled=false;}
  }

  async enter() {
    const button=document.querySelector('#enterWorld');button.disabled=true;this.error.textContent='';
    try{await this.onEnter();this.root.hidden=true;document.querySelector('#appShell').inert=false;document.body.classList.remove('is-locked');document.querySelector('.brand').focus();}
    catch(error){this.error.textContent=error.message;}finally{button.disabled=false;}
  }
  async logout(){try{await this.request('logout',{});this.form.reset();this.remoteForm.reset();await this.start();}catch(error){this.error.textContent=error.message;}}
}
