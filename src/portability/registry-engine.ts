import { createPublicKey } from 'node:crypto';
import { sha256, stableJson, verifySignature } from '../crypto/crypto.js';
import { validateInvitation, acceptanceClaim, type BondInvitation } from './bond-protocol.js';
import { CrystalError } from './crystal-error.js';

export interface Device { id: string; name: string; platform: string; }
export interface RegistryEntry {
  publicKey: string; status: 'active'|'recollected'; sessionHash: string;
  device: Device; startedAt: string; lastSeen: string;
  transfer?: {id:string;secretHash:string;bundleHash:string;source:Device;gift?:BondInvitation;completed?:boolean};
  ownerAccountId?:string;
  migratedFrom?:string[];
  recoveryHash: string; nonces?: Array<{nonce:string;timestamp:number}>;
}
export interface SignedRequest { action:string; id:string; publicKey:string; timestamp:number; nonce:string; payload:Record<string,any>; signature:string; }
export function authenticateRegistryRequest(input:SignedRequest):string {
  if(!input || typeof input !== 'object' || Array.isArray(input) || typeof input.id !== 'string' || !/^MC-[A-Z0-9-]{1,100}$/i.test(input.id) ||
    !Number.isFinite(input.timestamp) || Math.abs(Date.now()-input.timestamp)>60_000 ||
    typeof input.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(input.nonce) || typeof input.signature !== 'string')
    throw new CrystalError(401,'Autorização inválida.');
  try {
    const key=createPublicKey(input.publicKey);
    if(key.asymmetricKeyType!=='ed25519')throw Error();
    const canonicalKey=key.export({type:'spki',format:'pem'}).toString();
    const {signature,...unsigned}=input;
    if(!verifySignature(stableJson(unsigned),signature,canonicalKey))throw Error();
    return `${input.id}:${sha256(canonicalKey)}`;
  } catch { throw new CrystalError(401,'Autorização inválida.'); }
}

export interface RegistryTransition { entry?:RegistryEntry; result:Record<string,unknown>; }
export function applyRegistryRequest(input:SignedRequest,stored?:RegistryEntry):RegistryTransition {
    authenticateRegistryRequest(input);
    const canonicalKey=createPublicKey(input.publicKey).export({type:'spki',format:'pem'}).toString();
    if(stored && stored.publicKey!==canonicalKey)throw new CrystalError(401,'Autorização inválida.');
    const nonce=`${input.id}:${input.nonce}`;
    if(stored?.nonces?.some(n=>n.nonce===nonce))throw new CrystalError(409,'Solicitação já utilizada.');
    const p=input.payload;
    if(!p||typeof p!=='object')throw new CrystalError(400,'Solicitação inválida.');
    const token=(s:unknown)=>{if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw new CrystalError(400,'Credencial inválida.');return sha256(s);};
    const device=(d:any):Device=>{if(!d||typeof d.id!=='string'||!/^[a-f0-9]{64}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>60||!['Linux','Windows','Android','macOS','Outro'].includes(d.platform))throw new CrystalError(400,'Informe um nome de dispositivo de até 60 caracteres.');return{id:d.id,name:d.name.trim(),platform:d.platform};};
    const now=new Date().toISOString();let entry=stored?structuredClone(stored):undefined;
    const metadata=(e:RegistryEntry)=>({status:e.status,device:e.device,sessionId:e.sessionHash.slice(0,12),startedAt:e.startedAt,lastSeen:e.lastSeen,transferId:e.transfer?.id,ownerAccountId:e.ownerAccountId,giftRecipient:e.transfer?.gift?{name:e.transfer.gift.name,accountId:e.transfer.gift.accountId}:undefined});
    const conflict=()=>{throw new CrystalError(409,'A Companion está autorizada em outra sessão ou a transferência não está disponível.',entry?metadata(entry):undefined);};
    if(input.action==='capabilities')return {result:{version:2,features:['bond-passage-v1','registry-migration-v1']}};
    if(input.action==='status')return {result:entry?metadata(entry):{status:'unregistered'}};
    if(input.action==='migration-check'){
      if(!entry||typeof p.sourceAuthority!=='string'||!entry.migratedFrom?.includes(p.sourceAuthority))throw new CrystalError(409,'Este registro não recebeu a migração desta identidade. Traga o registro original; o Cristal sozinho não autoriza a migração.');
      return {result:{migrated:true,...metadata(entry)}};
    }
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
        if(entry.status==='recollected'&&entry.transfer?.id===p.transferId&&entry.transfer?.secretHash===secretHash&&entry.transfer?.bundleHash===p.bundleHash&&entry.sessionHash===token(p.session))return committed(input,entry,nonce);
        if(entry.status!=='active'||entry.sessionHash!==token(p.session))conflict();
        if(typeof p.transferId!=='string'||p.transferId.length!==36||!/^[a-f0-9]{64}$/.test(p.bundleHash))throw new CrystalError(400,'Transferência inválida.');
        entry.status='recollected';entry.transfer={id:p.transferId,secretHash,bundleHash:p.bundleHash,source:entry.device,gift:p.gift?validateInvitation(p.gift):undefined};
      }else if(input.action==='awaken'){
        const sessionHash=token(p.session),secretHash=token(p.secret),d=device(p.device);
        if(entry.status==='active'&&entry.transfer?.completed&&entry.transfer.id===p.transferId&&entry.transfer?.secretHash===secretHash&&entry.transfer?.bundleHash===p.bundleHash&&entry.sessionHash===sessionHash&&entry.device.id===d.id)return committed(input,entry,nonce);
        if(entry.status!=='recollected'||!entry.transfer||entry.transfer.id!==p.transferId||entry.transfer.secretHash!==secretHash||entry.transfer.bundleHash!==p.bundleHash)conflict();
        if(entry.transfer!.gift){
          const invitation=validateInvitation(entry.transfer!.gift);
          let accepted=false;
          try{accepted=verifySignature(stableJson(acceptanceClaim(input.id,p.transferId,p.bundleHash,p.session,p.recovery,d.id)),p.acceptance,invitation.publicKey);}catch{}
          if(!accepted)throw new CrystalError(403,'O destinatário precisa aceitar a Passagem do Vínculo no acesso que gerou o convite.');
          entry.ownerAccountId=invitation.accountId;
        }
        entry.status='active';entry.device=d;entry.sessionHash=sessionHash;entry.startedAt=now;entry.lastSeen=now;entry.recoveryHash=token(p.recovery);entry.transfer!.completed=true;
      }else if(input.action==='cancel'){
        if(entry.sessionHash!==token(p.session)||entry.device.id!==p.deviceId||entry.transfer?.completed)conflict();
        entry.status='active';entry.transfer=undefined;entry.lastSeen=now;
      }else if(input.action==='recover'){
        if(entry.status==='active'&&entry.sessionHash===token(p.session)&&entry.device.id===p.device?.id)return committed(input,entry,nonce);
        if(entry.recoveryHash!==token(p.recovery))throw new CrystalError(403,'Código de recuperação incorreto.');
        const sessionHash=token(p.session),d=device(p.device);
        entry.status='active';entry.sessionHash=sessionHash;entry.device=d;entry.startedAt=now;entry.lastSeen=now;entry.transfer=undefined;entry.recoveryHash=token(p.nextRecovery);
      }else throw new CrystalError(404,'Operação não encontrada.');
    }
    if(!entry)throw new CrystalError(400,'Registro inválido.');
    return committed(input,entry,nonce);
}
function committed(input:SignedRequest,entry:RegistryEntry,nonce:string):RegistryTransition {
  const recent=(entry.nonces??[]).filter(n=>n.timestamp>Date.now()-120_000);
  if(recent.length>=2048)throw new CrystalError(429,'Muitas operações para esta Companion. Aguarde antes de tentar novamente.');
  entry.nonces=[...recent,{nonce,timestamp:input.timestamp}];
  return {entry,result:{status:entry.status,device:entry.device,sessionId:entry.sessionHash.slice(0,12),startedAt:entry.startedAt,lastSeen:entry.lastSeen,transferId:entry.transfer?.id,ownerAccountId:entry.ownerAccountId}};
}
