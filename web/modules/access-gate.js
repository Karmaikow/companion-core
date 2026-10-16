import { CrystalPanel } from './crystal-panel.js';
import { CreationRitual } from './creation-ritual.js';
import { mode } from './runtime-mode.js';
import { request } from './http.js';
import { api } from './api.js';
import { cloudAuth, cloudVault } from './cloud-vault.js';
export class AccessGate {
  constructor(onEnter,onLock) {
    this.onEnter=onEnter;this.onLock=onLock;this.root=document.querySelector('#accessGate');this.form=document.querySelector('#accessForm');this.remoteForm=document.querySelector('#remotePairForm');this.error=document.querySelector('#accessError');
    this.ritual=new CreationRitual(this.root);
    this.crystal=new CrystalPanel(()=>this.openHub());
    this.form.addEventListener('submit',e=>{e.preventDefault();void this.submit();});
    document.querySelector('#passwordRecoveryForm').addEventListener('submit',e=>{e.preventDefault();void this.submitPasswordRecovery();});
    document.querySelector('#authForgotPassword').addEventListener('click',()=>this.showPasswordRecovery(false));
    document.querySelector('#recoveryBack').addEventListener('click',()=>this.configureCloudForm());
    document.querySelector('#authModeToggle').addEventListener('click',()=>{this.setup=!this.setup;this.error.textContent='';this.configureCloudForm();});
    document.querySelector('#cloudSaveCrystal').addEventListener('click',()=>void this.saveCloudCrystal());
    document.querySelector('#cloudRefreshBackups').addEventListener('click',()=>void this.refreshCloudVault());
    document.querySelector('#cloudBackupList').addEventListener('click',event=>{const button=event.target.closest('[data-cloud-download]');if(button)void this.downloadCloudBackup(button.dataset.cloudDownload,button.dataset.companionId);});
    document.querySelector('#cloudLogout').addEventListener('click',()=>void this.logout());
    this.remoteForm.addEventListener('submit',e=>{e.preventDefault();void this.submitRemote();});
    document.querySelector('#enterWorld').addEventListener('click',()=>void this.enter());
    for(const id of ['logoutButton','gateLogout'])document.getElementById(id).addEventListener('click',()=>void this.logout());
    document.querySelector('#accessRetry').addEventListener('click',()=>void this.start());
    document.querySelector('#manageHub').addEventListener('click',()=>void this.openHub());
    document.querySelector('#hubButton').addEventListener('click',()=>void this.openHub());
    document.querySelector('#hubBack').addEventListener('click',()=>void this.continuity());
    document.querySelector('#showCreateCompanion').addEventListener('click',()=>{this.showCreation();});
    document.querySelector('#createCompanionForm').addEventListener('submit',event=>{event.preventDefault();void this.createCompanion();});
    document.querySelector('#hubCompanionList').addEventListener('click',event=>{const button=event.target.closest('[data-companion-id]');if(button)void this.selectCompanion(button.dataset.companionId);});
    window.addEventListener('mayuna:unauthorized',()=>void this.start());
  }
  async request(route,body) {
    if(mode==='cloud'){
      if(route==='status')return cloudAuth.status();
      if(route==='setup')return cloudAuth.signUp(body.email,body.password);
      if(route==='login')return cloudAuth.signIn(body.email,body.password);
      if(route==='logout')return cloudAuth.signOut();
      throw Error('Ação de conta não disponível.');
    }
    const response=await request('/api/auth/'+route,{cache:'no-store',signal:AbortSignal.timeout(15000),...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível acessar.');return data;
  }
  async start() {
    this.ritual.close();this.onLock?.();this.root.hidden=false;document.querySelector('#appShell').inert=true;document.body.classList.add('is-locked');
    this.error.textContent='';this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#passwordRecoveryForm').hidden=true;document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#cloudVaultScreen').hidden=true;document.querySelector('#authModeToggle').hidden=true;document.querySelector('#accessRetry').hidden=true;
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
      if(mode==='cloud'){
        document.querySelector('#hubButton').hidden=true;document.querySelector('#manageHub').hidden=true;
        if(await cloudAuth.consumePasswordRecovery()){this.showPasswordRecovery(true);return;}
        const status=await cloudAuth.status();
        if(status.authenticated){await this.showCloudVault(status.user);return;}
        this.setup=true;this.form.hidden=false;this.configureCloudForm();return;
      }
      document.querySelector('#hubButton').hidden=mode==='demo';
      const status=await this.request('status');if(status.authenticated){await this.continuity();return;}
      document.querySelector('#accessUsername').type='text';
      document.querySelector('#accessUsername').name='username';
      document.querySelector('#accessUsername').placeholder='seu.apelido';
      document.querySelector('#accessAccountNote').textContent='Depois de entrar, crie sua Companion ou continue uma história com um Cristal de Memória. Este acesso vale para este dispositivo.';
      document.querySelector('#accessUsername').autocomplete='username';
      document.querySelector('#accessUsername').minLength=3;document.querySelector('#accessUsername').maxLength=40;
      document.querySelector('#accessUsername').pattern='[a-zA-Z0-9_.-]{3,40}';
      document.querySelector('#accessUsername').parentElement.childNodes[0].nodeValue='Usuário local';
      this.setup=!status.configured;this.form.hidden=false;
      document.querySelector('#accessTitle').textContent=this.setup?'Um acesso. Uma história.':'Sua história continua.';
      document.querySelector('#accessSubtitle').textContent=this.setup?'Crie o acesso deste dispositivo. A conta web do Cofre usa um login separado nesta versão.':'Entre com o usuário e a senha locais deste dispositivo. O login do Cofre online é separado nesta versão.';
      document.querySelector('#accessSubmit').textContent=this.setup?'Criar acesso local':'Entrar no núcleo';
      document.querySelector('#confirmationField').hidden=!this.setup;document.querySelector('#accessConfirm').required=this.setup;
      document.querySelector('#accessPassword').autocomplete=this.setup?'new-password':'current-password';document.querySelector('#accessUsername').focus();
    }catch(error){this.error.textContent=error.message;document.querySelector('#accessRetry').hidden=false;}
  }
  configureCloudForm(){
    const notice=document.querySelector('#authNotice');notice.hidden=true;notice.textContent='';
    document.querySelector('#accessAccountNote').textContent='Sua conta dá acesso aos backups criptografados do Cofre. A senha do Cristal continua necessária para abri-lo.';
    const input=document.querySelector('#accessUsername');input.placeholder='voce@exemplo.com';input.type='email';input.name='email';input.autocomplete='email';input.minLength=0;input.maxLength=254;input.removeAttribute('pattern');input.parentElement.childNodes[0].nodeValue='E-mail';
    document.querySelector('#authModeToggle').hidden=false;document.querySelector('#authForgotPassword').hidden=false;document.querySelector('#passwordRecoveryForm').hidden=true;this.form.hidden=false;
    document.querySelector('#confirmationField').hidden=!this.setup;document.querySelector('#accessConfirm').required=this.setup;
    document.querySelector('#accessPassword').autocomplete=this.setup?'new-password':'current-password';
    document.querySelector('#accessTitle').textContent=this.setup?'Criar sua conta Companion Core':'Entrar na sua conta';
    document.querySelector('#accessSubtitle').textContent=this.setup?'Crie seu acesso ao Cofre do Cristal. Nesta versão, a conta ainda não cria uma Companion.':'Entre para acessar os backups criptografados de Companions já criadas no Core local.';
    document.querySelector('#accessSubmit').textContent=this.setup?'Criar conta':'Entrar';
    document.querySelector('#authModeToggle').textContent=this.setup?'Já tenho uma conta':'Criar uma conta';
    input.focus();
  }
  showPasswordRecovery(update){
    this.error.textContent='';this.recoveryUpdate=update;
    this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#cloudVaultScreen').hidden=true;
    document.querySelector('#authModeToggle').hidden=true;document.querySelector('#authForgotPassword').hidden=true;
    const form=document.querySelector('#passwordRecoveryForm');form.hidden=false;
    document.querySelector('#recoveryEmailField').hidden=update;document.querySelector('#recoveryPasswordFields').hidden=!update;
    document.querySelector('#recoveryEmail').required=!update;
    document.querySelector('#recoveryPassword').required=update;document.querySelector('#recoveryPasswordConfirm').required=update;
    document.querySelector('#recoverySubmit').textContent=update?'Salvar nova senha':'Enviar link de recuperação';
    document.querySelector('#accessTitle').textContent=update?'Crie uma nova senha':'Recupere seu acesso';
    document.querySelector('#accessSubtitle').textContent=update?'Escolha uma senha nova para sua conta Companion Core.':'Vamos enviar um link seguro para o e-mail cadastrado na sua conta.';
    const notice=document.querySelector('#authNotice');notice.hidden=true;notice.textContent='';
    (update?document.querySelector('#recoveryPassword'):document.querySelector('#recoveryEmail')).focus();
  }
  async submitPasswordRecovery(){
    const button=document.querySelector('#recoverySubmit');if(button.disabled)return;
    const notice=document.querySelector('#authNotice');notice.hidden=true;notice.textContent='';button.disabled=true;
    try{
      if(this.recoveryUpdate){
        const password=document.querySelector('#recoveryPassword').value;
        if(password.length<10||password.length>128)throw Error('Use uma senha com pelo menos 10 caracteres.');
        if(password!==document.querySelector('#recoveryPasswordConfirm').value)throw Error('As senhas não coincidem.');
        const user=await cloudAuth.updateRecoveredPassword(password);
        document.querySelector('#passwordRecoveryForm').reset();this.recoveryUpdate=false;
        await this.showCloudVault(user);
        notice.textContent='Senha atualizada. Sua conta já está conectada.';notice.hidden=false;
      }else{
        await cloudAuth.requestPasswordReset(document.querySelector('#recoveryEmail').value);
        document.querySelector('#recoveryEmail').value='';
        notice.textContent='Se existir uma conta para esse endereço, enviaremos um link de recuperação. Confira sua caixa de entrada e o spam.';notice.hidden=false;
      }
    }catch(error){this.error.textContent=error.message;}
    finally{button.disabled=false;}
  }
  async showCloudVault(user){
    this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#passwordRecoveryForm').hidden=true;document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#cloudVaultScreen').hidden=false;document.querySelector('#authModeToggle').hidden=true;
    document.querySelector('#accessTitle').textContent='Sua conta está conectada';
    document.querySelector('#accessSubtitle').textContent='Guarde e baixe Cristais criptografados. Para entrar no Refúgio, importe o arquivo no Core local com a senha do Cristal. O acesso local ainda é separado desta conta.';
    const account=user||await cloudAuth.currentUser();document.querySelector('#cloudAccountEmail').textContent=account?.email||'Conta autenticada';
    await this.refreshCloudVault();
  }
  async refreshCloudVault(){
    const list=document.querySelector('#cloudBackupList'),feedback=document.querySelector('#cloudVaultFeedback');feedback.textContent='Carregando backups…';
    try{
      const rows=await cloudVault.list();list.replaceChildren();
      if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhum Cristal guardado nesta conta.';list.append(empty);}
      for(const row of rows){
        const button=document.createElement('button');button.type='button';button.className='hub-companion-option';button.dataset.cloudDownload=row.backup_id;button.dataset.companionId=row.companion_id;
        const icon=document.createElement('span');icon.className='hub-soul';icon.textContent='✧';
        const details=document.createElement('span');const name=document.createElement('strong');name.textContent=row.companion_id;const date=document.createElement('small');date.textContent='Backup salvo '+new Date(row.created_at).toLocaleString('pt-BR');details.append(name,date);
        const action=document.createElement('span');action.className='hub-active';action.textContent='BAIXAR';button.append(icon,details,action);list.append(button);
      }
      feedback.textContent=rows.length?'Selecione um Cristal para baixar.':'';
    }catch(error){feedback.textContent=error.message;}
  }
  async saveCloudCrystal(){
    const button=document.querySelector('#cloudSaveCrystal'),feedback=document.querySelector('#cloudVaultFeedback'),file=document.querySelector('#cloudCrystalFile').files[0];
    if(button.disabled)return;if(!file){feedback.textContent='Selecione um arquivo .companion.';return;}
    button.disabled=true;feedback.textContent='Enviando envelope criptografado…';
    try{await cloudVault.save(document.querySelector('#cloudCompanionId').value.trim(),await file.text());document.querySelector('#cloudCrystalFile').value='';feedback.textContent='Backup criptografado salvo na sua conta.';await this.refreshCloudVault();}
    catch(error){feedback.textContent=error.message;}
    finally{button.disabled=false;}
  }
  async downloadCloudBackup(id,companionId){
    const feedback=document.querySelector('#cloudVaultFeedback');feedback.textContent='Preparando o download…';
    try{const file=await cloudVault.download(id),url=URL.createObjectURL(new Blob([file],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=companionId+'-'+id.slice(0,8)+'.companion';link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);feedback.textContent='Cristal baixado. Use a senha original para importá-lo.';}
    catch(error){feedback.textContent=error.message;}
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
    try{
      const result=await this.request(this.setup?'setup':'login',mode==='cloud'?{email:username,password}:{username,password});
      if(mode==='cloud'&&this.setup&&!result.authenticated){this.form.reset();this.setup=false;this.configureCloudForm();const notice=document.querySelector('#authNotice');notice.textContent='Cadastro recebido! Para continuar, confirme seu e-mail pelo link que enviamos. Depois volte aqui e entre com seu e-mail e senha. Nesta versão, a conta dá acesso ao Cofre do Cristal; a criação de uma Companion pela web ainda está em desenvolvimento.';notice.hidden=false;return;}
      this.form.reset();
      if(mode==='cloud'){await this.showCloudVault(result.user);return;}
      await this.continuity();
    }
    catch(error){this.error.textContent=error.message;}finally{button.disabled=false;}
  }
  showCreation(){this.ritual.open(this.state);document.querySelector('#accessTitle').textContent='O ritual do primeiro vínculo';document.querySelector('#accessSubtitle').textContent='Escolha o nome, a essência e os traços da alma que vai acompanhar você.';}
  async continuity() {
    if(mode!=='connect'&&mode!=='demo'){
      const hub=await api.companions();
      if(!hub.activeId){this.state=null;this.form.hidden=true;this.remoteForm.hidden=true;await this.openHub();return;}
    }
    const response=await request('/api/companion/state',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Não foi possível carregar a Companion. Tente entrar novamente.');
    const state=await response.json();this.state=state;this.form.hidden=true;this.remoteForm.hidden=true;document.querySelector('#hubScreen').hidden=true;document.querySelector('#continuityScreen').hidden=false;
    document.querySelector('#manageHub').hidden=mode==='connect'||mode==='demo';
    if(mode!=='connect'&&mode!=='demo'){
      try{const hub=await api.companions();this.configureCreation(hub);this.renderHub(hub.companions,state.identity.id);}
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
    document.querySelector('#enterWorld').disabled=!['local','active',undefined].includes(state.meta.crystalPhase);
    if(document.querySelector('#enterWorld').disabled)document.querySelector('#accessSubtitle').textContent='Sua Companion está recolhida. Use Meu vínculo para baixar o Cristal ou cancelar o recolhimento.';
    document.querySelector('#enterWorld').focus();
  }
  async openHub(){
    if(mode==='connect'||mode==='demo')return;
    this.ritual.close();this.onLock?.();this.root.hidden=false;document.querySelector('#appShell').inert=true;document.body.classList.add('is-locked');
    document.querySelector('#accessTitle').textContent='Seu Hub';document.querySelector('#accessSubtitle').textContent='Seu vínculo, sua história e seu Refúgio.';
    document.querySelector('#continuityScreen').hidden=true;document.querySelector('#hubScreen').hidden=false;this.error.textContent='';
    try{const hub=await api.companions();this.configureCreation(hub);this.renderHub(hub.companions,hub.activeId);await this.crystal.refresh();}
    catch(error){this.error.textContent=error.message;}
  }
  showContinuity(){if(!this.state){void this.openHub();return;}document.querySelector('#hubScreen').hidden=true;document.querySelector('#continuityScreen').hidden=false;this.error.textContent='';}
  configureCreation(hub){
    this.ritual.configure(hub.creationPolicy);
    const button=document.querySelector('#showCreateCompanion');
    const canCreate=hub.creationPolicy.canCreate && hub.companions.length===0;
    button.hidden=!canCreate;button.disabled=!canCreate;button.textContent='＋ Despertar minha Companion';
    document.querySelector('#hubBack').hidden=!hub.activeId;
    document.querySelector('.hub-copy').textContent=canCreate?'Seu primeiro vínculo começa aqui. Desperte uma alma única.':'Selecione uma Companion ou importe outro Cristal. Cada alma mantém sua própria história.';
  }
  renderHub(companions,activeId){
    const list=document.querySelector('#hubCompanionList');list.replaceChildren();
    for(const companion of companions){
      const button=document.createElement('button');button.type='button';button.className='hub-companion-option';button.dataset.companionId=companion.id;
      const icon=document.createElement('span');icon.className='hub-soul';icon.textContent='✧';
      const details=document.createElement('span');const name=document.createElement('strong');name.textContent=companion.name;const meta=document.createElement('small');meta.textContent=`${companion.form} · ${companion.id}`;details.append(name,meta);button.append(icon,details);
      if(companion.id===activeId){const badge=document.createElement('span');badge.className='hub-active';badge.textContent='NESTE ACESSO';button.append(badge);}
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
    const profile={name:document.querySelector('#newCompanionName').value,ownerName:document.querySelector('#newOwnerName').value,preferredAddress:document.querySelector('#newPreferredAddress').value,...this.ritual.payload()};
    try{await api.createCompanion(profile);this.ritual.reset();await this.continuity();}
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

