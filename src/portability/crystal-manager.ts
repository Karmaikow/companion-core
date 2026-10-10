import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { hostname, platform } from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CompanionCore } from '../core/core.js';
import { LocalStore, writeFileAtomic } from '../storage/store.js';
import { stableJson } from '../crypto/crypto.js';
import { RegistryClient } from './registry-client.js';
import { CrystalError, sealCrystal, openCrystal, validatePayload, signCrystalData, crystalHash, type CrystalPayload } from './crystal.js';
import type { Device } from './registry.js';
const secret=()=>Buffer.from(randomBytes(32)).toString('hex');
interface LocalSession {
  authority:string; id:string; device:Device; session:string; recovery:string;
  phase:'active'|'exporting'|'recollected'|'importing';
  bundle?:string; payload?:CrystalPayload; previous?:LocalSession; recovering?:boolean; recoveryInput?:string;
}
export class CrystalManager {
  private local?:LocalSession; private client?:RegistryClient;
  private sessions:Record<string,LocalSession> = Object.create(null);
  private selectedId?:string;
  private file:string; private store:LocalStore;
  constructor(private root:string,private configuredUrl=process.env.COMPANION_REGISTRY_URL){this.file=path.join(root,'.crystal','session.json');this.store=new LocalStore(root);}
  async initialize(){
    try {
      const saved=JSON.parse(await readFile(this.file,'utf8'));
      const entries=saved.version===2?Object.entries(saved.sessions):[[saved.id,saved]];
      if(!entries.length&&saved.version!==2)throw Error();
      for(const [id,value] of entries){
        const session=value as LocalSession;
        if(typeof id!=='string'||!/^MC-[A-Z0-9-]+$/i.test(id)||session.id!==id||!session.authority||!session.device?.id||!session.session||!session.recovery||!['active','exporting','recollected','importing'].includes(session.phase))throw Error();
        new RegistryClient(session.authority);
        this.sessions[id]=session;
      }
      if(saved.version!==2)await writeFileAtomic(this.file,JSON.stringify({version:2,sessions:this.sessions}),0o600);
    } catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new CrystalError(409,'Controle do Cristal inválido. Preserve a pasta data e restaure um backup.');}
    this.select(Object.keys(this.sessions)[0]);
  }
  private select(id?:string){
    this.selectedId=id;this.local=id?this.sessions[id]:undefined;
    const url=this.local?.authority||this.configuredUrl;
    if(this.client?.url!==url)this.client=url?new RegistryClient(url):undefined;
  }
  private registry(){if(!this.client)throw new CrystalError(409,'Configure COMPANION_REGISTRY_URL para habilitar o Cristal de Memória.');return this.client;}
  private async persist(){
    if(this.selectedId){if(this.local)this.sessions[this.selectedId]=this.local;else delete this.sessions[this.selectedId];}
    await writeFileAtomic(this.file,JSON.stringify({version:2,sessions:this.sessions}),0o600);
  }
  private device(name:string):Device {
    if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw new CrystalError(400,'Nomeie o dispositivo com até 60 caracteres.');
    const system=process.env.ANDROID_ROOT?'Android':platform()==='win32'?'Windows':platform()==='darwin'?'macOS':platform()==='linux'?'Linux':'Outro';
    return{id:this.local?.device.id??secret(),name:name.trim(),platform:system};
  }
  private request(action:string,core:CompanionCore,payload:Record<string,unknown>){return this.registry().request(action,core.getState().identity.id,core.getState().identity.cryptographicIdentity.publicKey,core.getPrivateKey(),payload);}
  async status(core?:CompanionCore){
    const local=core?this.sessions[core.getState().identity.id]:this.local;
    const url=local?.authority||this.configuredUrl;
    const client=url?new RegistryClient(url):undefined;
    const result:any={configured:!!client,hasCompanion:!!core,phase:local?.phase??'local',recoveryAvailable:!!local?.recovery,deviceName:local?.device.name??hostname(),registry:client?.url,pendingImport:Object.values(this.sessions).some(session=>session.phase==='importing')};
    const statusCore=core??(local?.phase==='importing'&&local.payload?validatePayload(local.payload):undefined);
    if(statusCore&&client){try{result.server=await client.request('status',statusCore.getState().identity.id,statusCore.getState().identity.cryptographicIdentity.publicKey,statusCore.getPrivateKey(),{});}catch(e){result.unavailable=true;result.message=e instanceof CrystalError?e.message:'Registro indisponível.';}}
    return result;
  }
  async assertActive(core:CompanionCore){
    this.select(core.getState().identity.id);
    if(!this.local && this.client){
      this.local={authority:this.client.url,id:core.getState().identity.id,device:this.device(hostname()),session:secret(),recovery:secret(),phase:'active'};
      await this.persist();await this.request('register',core,{session:this.local.session,recovery:this.local.recovery,device:this.local.device});
    }
    if(!this.local)return;
    if(this.local.id!==core.getState().identity.id||this.local.phase!=='active')throw new CrystalError(409,'A Companion está recolhida ou com uma transferência pendente. Use o Cristal no seu vínculo.');
    await this.request('register',core,{session:this.local.session,recovery:this.local.recovery,device:this.local.device});
  }
  async recollect(core:CompanionCore,password:string,name:string){
    this.select(core.getState().identity.id);
    const registry=this.registry();
    if(!core.verifyLocal().valid)throw new CrystalError(409,'A integridade do Core precisa ser recuperada antes de recolher.');
    if(this.local?.id&&this.local.id!==core.getState().identity.id)throw new CrystalError(409,'Há outra identidade vinculada neste dispositivo.');
    if(this.local?.phase==='importing')throw new CrystalError(409,'Conclua o despertar pendente.');
    if(!this.local||this.local.phase==='active'){
      const candidate=this.local??{authority:registry.url,id:core.getState().identity.id,device:this.device(name),session:secret(),recovery:secret(),phase:'active' as const};
      candidate.device=this.device(name);
      const payload:CrystalPayload={version:1,authority:registry.url,transferId:randomUUID(),transferSecret:secret(),exportedAt:new Date().toISOString(),data:core.getData(),privateKey:core.getPrivateKey(),stateSignature:signCrystalData(core.getData(),core.getPrivateKey())};
      const bundle=await sealCrystal(payload,password); // Validate the password before enrolling or pausing.
      this.local=candidate;await this.persist();
      await this.request('register',core,{session:candidate.session,recovery:candidate.recovery,device:candidate.device});
      this.local={...candidate,phase:'exporting',bundle};await this.persist();
      // The private key is only inside the encrypted bundle; no plaintext export payload is persisted.
      await this.request('recollect',core,{session:candidate.session,transferId:payload.transferId,secret:payload.transferSecret,bundleHash:crystalHash(bundle)});
      this.local.phase='recollected';await this.persist();
    }else if(this.local.phase==='exporting'){
      const payload=await openCrystal(this.local.bundle!,password);
      await this.request('recollect',core,{session:this.local.session,transferId:payload.transferId,secret:payload.transferSecret,bundleHash:crystalHash(this.local.bundle!)});
      this.local.phase='recollected';await this.persist();
    }
    return {file:this.local.bundle!,filename:`${core.getState().identity.id}.companion`,recoveryCode:this.local.recovery,status:await this.status(core)};
  }
  async cancel(core:CompanionCore){
    this.select(core.getState().identity.id);
    if(!this.local||this.local.id!==core.getState().identity.id||this.local.phase==='importing')throw new CrystalError(409,'Não há recolhimento para cancelar.');
    await this.request('cancel',core,{session:this.local.session,deviceId:this.local.device.id});
    this.local.phase='active';delete this.local.bundle;await this.persist();return this.status(core);
  }
  private checkHistory(core:CompanionCore|undefined,incoming:CompanionCore){
    if(!core)return;
    if(core.getState().identity.id!==incoming.getState().identity.id)throw new CrystalError(409,'Este acesso já possui outra Companion. Nenhuma identidade foi substituída.');
    const before=core.getData(),after=incoming.getData();
    if(before.events.length>after.events.length||before.events.some((event,index)=>event.integrity.hash!==after.events[index]?.integrity.hash)||before.events.length===after.events.length&&stableJson(before.state)!==stableJson(after.state))throw new CrystalError(409,'O Cristal é antigo ou contém uma história divergente. Preserve as duas versões.');
  }
  async awaken(file:string,password:string,name:string,current?:CompanionCore,recoveryCode?:string){
    const payload=await openCrystal(file,password);const core=validatePayload(payload);
    const id=core.getState().identity.id;
    if(Object.values(this.sessions).some(session=>session.phase==='importing'&&session.id!==id))throw new CrystalError(409,'Existe outro despertar pendente. Retome o mesmo Cristal.');
    this.select(id);
    const registry=this.registry();
    if(payload.authority!==registry.url)throw new CrystalError(409,'O Cristal pertence a outro registro central. Configure o servidor correto.');
    const stored=await this.store.load(id);
    const sameIdentity=current?.getState().identity.id===id?current:stored?CompanionCore.from(stored,payload.privateKey):undefined;
    if(sameIdentity&&!sameIdentity.verifyLocal().valid)throw new CrystalError(409,'A identidade local precisa ser recuperada antes de importar.');
    this.checkHistory(sameIdentity,core);
    if(this.local?.phase==='importing'){
      if(crystalHash(this.local.bundle!)!==crystalHash(file))throw new CrystalError(409,'Existe outro despertar pendente. Retome o mesmo Cristal.');
    }else {
      if(sameIdentity){await writeFileAtomic(path.join(this.root,'.crystal','backups',`${Date.now()}-${randomUUID()}.json`),JSON.stringify({data:sameIdentity.getData(),privateKey:sameIdentity.getPrivateKey()}),0o600);}
      this.local={previous:this.local,authority:registry.url,id:payload.data.state.identity.id,device:this.device(name),session:secret(),recovery:secret(),phase:'importing',bundle:file,payload,recovering:!!recoveryCode,recoveryInput:recoveryCode};await this.persist();
    }
    return this.finishImport();
  }
  async resumeImport(){const pending=Object.values(this.sessions).find(session=>session.phase==='importing');if(pending){this.select(pending.id);return this.finishImport();}return undefined;}
  private async finishImport(){
    const local=this.local!,payload=local.payload!,core=validatePayload(payload);
    try { await this.request(local.recovering?'recover':'awaken',core,local.recovering
      ?{session:local.session,device:local.device,recovery:local.recoveryInput,nextRecovery:local.recovery}
      :{session:local.session,device:local.device,recovery:local.recovery,transferId:payload.transferId,secret:payload.transferSecret,bundleHash:crystalHash(local.bundle!)}); } catch(error) {
      if(error instanceof CrystalError&&error.status>=400&&error.status<500){this.local=local.previous;await this.persist();}
      throw error;
    }
    await this.store.save(payload.data);await this.store.savePrivateKey(local.id,payload.privateKey);
    await writeFileAtomic(path.join(this.root,'active-companion.json'),JSON.stringify({id:local.id}),0o600);
    local.phase='active';delete local.payload;delete local.bundle;delete local.recoveryInput;delete local.recovering;delete local.previous;await this.persist();
    return {core,recoveryCode:local.recovery};
  }
  getPhase(id?:string){return (id?this.sessions[id]:this.local)?.phase??'local';}
  isActiveFor(id:string){return this.sessions[id]?.phase==='active';}
  getRecoveryCode(){return this.local?.recovery;}
}
