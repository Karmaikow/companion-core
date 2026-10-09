import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { sha256, stableJson, verifySignature } from '../crypto/crypto.js';
import { writeFileAtomic } from '../storage/store.js';
import { CrystalError } from './crystal.js';

export interface Device { id: string; name: string; platform: string; }
interface Entry {
  publicKey: string; status: 'active'|'recollected'; sessionHash: string;
  device: Device; startedAt: string; lastSeen: string;
  transfer?: {id:string;secretHash:string;bundleHash:string;source:Device;completed?:boolean};
  recoveryHash: string; nonces?: Array<{nonce:string;timestamp:number}>;
}
export interface SignedRequest { action:string; id:string; publicKey:string; timestamp:number; nonce:string; payload:Record<string,any>; signature:string; }
export class SessionRegistry {
  private entries:Record<string,Entry>={};private queue:Promise<unknown>=Promise.resolve();private nonces=new Map<string,number>();
  constructor(private file:string){}
  async initialize(){try{this.entries=JSON.parse(await readFile(this.file,'utf8'));if(!this.entries||typeof this.entries!=='object'||Array.isArray(this.entries))throw Error();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Registro corrompido. Restaure um backup; não crie outro registro para as mesmas identidades.');}}
  execute(input:SignedRequest){const next=this.queue.then(()=>this.apply(input));this.queue=next.catch(()=>undefined);return next;}
  private async apply(input:SignedRequest){
    const {signature,...unsigned}=input;
    if(!/^MC-[A-Z0-9-]+$/i.test(input.id)||!Number.isFinite(input.timestamp)||Math.abs(Date.now()-input.timestamp)>60_000||typeof input.nonce!=='string'||input.nonce.length!==36) throw new CrystalError(401,'Autorização inválida.');
    let canonicalKey:string;try{const key=createPublicKey(input.publicKey);if(key.asymmetricKeyType!=='ed25519')throw Error();canonicalKey=key.export({type:'spki',format:'pem'}).toString();}catch{throw new CrystalError(401,'Identidade criptográfica inválida.');}
    const stored=this.entries[`${input.id}:${sha256(canonicalKey)}`];
    try{if(stored&&stored.publicKey!==canonicalKey||!verifySignature(stableJson(unsigned),signature,stored?.publicKey??input.publicKey))throw Error();}catch{throw new CrystalError(401,'Autorização inválida.');}
    const nonce=`${input.id}:${input.nonce}`;for(const [n,t]of this.nonces)if(t<Date.now()-120_000)this.nonces.delete(n);
    if(stored?.nonces?.some(n=>n.nonce===nonce)||this.nonces.has(nonce))throw new CrystalError(409,'Solicitação já utilizada.');this.nonces.set(nonce,Date.now());
    const p=input.payload;
    if(!p||typeof p!=='object')throw new CrystalError(400,'Solicitação inválida.');
    const token=(s:unknown)=>{if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw new CrystalError(400,'Credencial inválida.');return sha256(s);};
    const device=(d:any):Device=>{if(!d||typeof d.id!=='string'||!/^[a-f0-9]{64}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>60||!['Linux','Windows','Android','macOS','Outro'].includes(d.platform))throw new CrystalError(400,'Informe um nome de dispositivo de até 60 caracteres.');return{id:d.id,name:d.name.trim(),platform:d.platform};};
    const now=new Date().toISOString();let entry=stored?structuredClone(stored):undefined;
    const metadata=(e:Entry)=>({status:e.status,device:e.device,sessionId:e.sessionHash.slice(0,12),startedAt:e.startedAt,lastSeen:e.lastSeen,transferId:e.transfer?.id});
    const conflict=()=>{throw new CrystalError(409,'A Companion está autorizada em outra sessão ou a transferência não está disponível.',entry?metadata(entry):undefined);};
    if(input.action==='status')return entry?metadata(entry):{status:'unregistered'};
    if(input.action==='register'){
      const sessionHash=token(p.session),d=device(p.device);
      if(entry){if(entry.status!=='active'||entry.sessionHash!==sessionHash||entry.device.id!==d.id)conflict();entry.device=d;entry.lastSeen=now;}
      else entry={publicKey:canonicalKey,status:'active',sessionHash,device:d,startedAt:now,lastSeen:now,recoveryHash:token(p.recovery)};
    }else{
      if(!entry)throw new CrystalError(409,'Identidade ainda não registrada.');
      if(input.action==='heartbeat'){
        if(entry.status!=='active'||entry.sessionHash!==token(p.session)||entry.device.id!==p.deviceId)conflict();entry.lastSeen=now;
      }else if(input.action==='recollect'){
        const secretHash=token(p.secret);
        if(entry.status==='recollected'&&entry.transfer?.id===p.transferId&&entry.transfer?.secretHash===secretHash&&entry.transfer?.bundleHash===p.bundleHash&&entry.sessionHash===token(p.session))return this.commit(input,entry,nonce);
        if(entry.status!=='active'||entry.sessionHash!==token(p.session))conflict();
        if(typeof p.transferId!=='string'||p.transferId.length!==36||!/^[a-f0-9]{64}$/.test(p.bundleHash))throw new CrystalError(400,'Transferência inválida.');
        entry.status='recollected';entry.transfer={id:p.transferId,secretHash,bundleHash:p.bundleHash,source:entry.device};
      }else if(input.action==='awaken'){
        const sessionHash=token(p.session),secretHash=token(p.secret),d=device(p.device);
        if(entry.status==='active'&&entry.transfer?.completed&&entry.transfer.id===p.transferId&&entry.transfer?.secretHash===secretHash&&entry.transfer?.bundleHash===p.bundleHash&&entry.sessionHash===sessionHash&&entry.device.id===d.id)return this.commit(input,entry,nonce);
        if(entry.status!=='recollected'||!entry.transfer||entry.transfer.id!==p.transferId||entry.transfer.secretHash!==secretHash||entry.transfer.bundleHash!==p.bundleHash)conflict();
        entry.status='active';entry.device=d;entry.sessionHash=sessionHash;entry.startedAt=now;entry.lastSeen=now;entry.recoveryHash=token(p.recovery);entry.transfer!.completed=true;
      }else if(input.action==='cancel'){
        if(entry.sessionHash!==token(p.session)||entry.device.id!==p.deviceId||entry.transfer?.completed)conflict();
        entry.status='active';entry.transfer=undefined;entry.lastSeen=now;
      }else if(input.action==='recover'){
        if(entry.status==='active'&&entry.sessionHash===token(p.session)&&entry.device.id===p.device?.id)return this.commit(input,entry,nonce);
        if(entry.recoveryHash!==token(p.recovery))throw new CrystalError(403,'Código de recuperação incorreto.');
        const sessionHash=token(p.session),d=device(p.device);
        entry.status='active';entry.sessionHash=sessionHash;entry.device=d;entry.startedAt=now;entry.lastSeen=now;entry.transfer=undefined;entry.recoveryHash=token(p.nextRecovery);
      }else throw new CrystalError(404,'Operação não encontrada.');
    }
    if(!entry)throw new CrystalError(400,'Registro inválido.');
    return this.commit(input,entry,nonce);
  }
  private async commit(input:SignedRequest,entry:Entry,nonce:string){
    entry.nonces=[...(entry.nonces??[]).filter(n=>n.timestamp>Date.now()-120_000),{nonce,timestamp:input.timestamp}];
    const next={...this.entries,[`${input.id}:${sha256(entry.publicKey)}`]:entry};await writeFileAtomic(this.file,JSON.stringify(next),0o600);this.entries=next;
    return {status:entry.status,device:entry.device,sessionId:entry.sessionHash.slice(0,12),startedAt:entry.startedAt,lastSeen:entry.lastSeen,transferId:entry.transfer?.id};
  }

}
export function registryHttpServer(registry:SessionRegistry){return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  try{
    if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify({ok:true,service:'companion-session-registry',version:1}));return;}
    if(req.method!=='POST'||req.url!=='/registry'||!(req.headers['content-type']??'').startsWith('application/json'))throw new CrystalError(404,'Rota não encontrada.');
    let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>64_000)throw new CrystalError(413,'Solicitação muito grande.');}
    const result=await registry.execute(JSON.parse(body));res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e instanceof CrystalError?e.status:400;res.end(JSON.stringify({error:e instanceof CrystalError?e.message:'Solicitação inválida.',details:e instanceof CrystalError?e.details:undefined}));}
});}
