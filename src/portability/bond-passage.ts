import { createPublicKey, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateIdentity, sha256, signData, stableJson, verifySignature, type KeyPair } from '../crypto/crypto.js';
import { CrystalError } from './crystal.js';
import type { CompanionCore } from '../core/core.js';
import { preferenceFact } from '../memory/memory-facts.js';

export interface BondInvitation {
  format:'companion-bond-invitation'; version:1; id:string;
  accountId:string; publicKey:string; name:string; preferredAddress:string;
  createdAt:string; expiresAt:string; signature:string;
}
export function validateInvitation(value:unknown,checkExpiry=true):BondInvitation {
  try {
    const invite=value as BondInvitation;
    if(!invite||invite.format!=='companion-bond-invitation'||invite.version!==1||typeof invite.id!=='string'||!/^[a-f0-9-]{36}$/.test(invite.id))throw Error();
    for(const name of [invite.name,invite.preferredAddress])if(typeof name!=='string'||!name.trim()||name.length>60||/[\u0000-\u001f]/.test(name))throw Error();
    const key=createPublicKey(invite.publicKey);
    if(key.asymmetricKeyType!=='ed25519')throw Error();
    const publicKey=key.export({type:'spki',format:'pem'}).toString();
    if(invite.publicKey!==publicKey||invite.accountId!==sha256(publicKey))throw Error();
    const from=Date.parse(invite.createdAt),until=Date.parse(invite.expiresAt);
    if(!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>7*86400_000||from>Date.now()+60_000||checkExpiry&&until<=Date.now())throw Error();
    const {signature,...unsigned}=invite;
    if(!verifySignature(stableJson(unsigned),signature,publicKey))throw Error();
    return structuredClone(invite);
  }catch{throw new CrystalError(400,'Convite inválido ou expirado. Peça um novo convite ao destinatário.');}
}

/** A cryptographic identity for this authenticated local account; never sent to the browser. */
export class BondAccount {
  constructor(private root:string){}
  private async keys():Promise<KeyPair>{
    const file=path.join(this.root,'.access','bond-key.json');
    try {
      const keys=JSON.parse(await readFile(file,'utf8'));
      if(createPublicKey(keys.privateKey).export({type:'spki',format:'pem'}).toString()!==keys.publicKey)throw Error('Identidade de vínculo inválida. Restaure seu backup.');
      return keys;
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const keys=generateIdentity();await mkdir(path.dirname(file),{recursive:true,mode:0o700});
    try{await writeFile(file,JSON.stringify(keys),{flag:'wx',mode:0o600});return keys;}
    catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return this.keys();throw e;}
  }
  async invite(name:string,preferredAddress:string){
    const keys=await this.keys(),now=Date.now();
    const unsigned={format:'companion-bond-invitation' as const,version:1 as const,id:randomUUID(),accountId:sha256(keys.publicKey),publicKey:keys.publicKey,name,preferredAddress,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+7*86400_000).toISOString()};
    return validateInvitation({...unsigned,signature:signData(stableJson(unsigned),keys.privateKey)});
  }
  async matches(invite:BondInvitation){return (await this.keys()).publicKey===invite.publicKey;}
  async accept(invite:BondInvitation,claim:Record<string,unknown>){
    const keys=await this.keys();if(keys.publicKey!==invite.publicKey)throw new CrystalError(403,'Este presente é destinado a outro acesso. Abra-o no acesso que gerou o convite.');
    return signData(stableJson(claim),keys.privateKey);
  }
}
export function acceptanceClaim(id:string,transferId:string,bundleHash:string,session:string,recovery:string,deviceId:string){
  return {domain:'companion-bond-accept:v1',id,transferId,bundleHash,sessionHash:sha256(session),recoveryHash:sha256(recovery),deviceId};
}
export function applyBondPassage(core:CompanionCore,invitation:BondInvitation,transferId:string){
  if(core.getData().events.some(event=>event.type==='BOND_PASSAGE'&&event.data.transferId===transferId))return;
  const state=core.getState(),previous={...state.profile.companionOf};
  const owner=state.profile.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  // Retain historical records in storage; do not reuse the former human's facts for the new person.
  const archivedMemoryIds=state.memories.filter(memory=>{
    const fact=preferenceFact(memory);return !(fact&&(fact.slot.endsWith(` de ${owner}`)||fact.slot===`${owner} gosta de`));
  }).map(memory=>memory.id);
  const next={name:invitation.name,preferredAddress:invitation.preferredAddress};
  state.profile.bondHistory=[...(state.profile.bondHistory??[]),{previousPerson:previous,accountId:invitation.accountId,transferId,archivedMemoryIds}];
  state.profile.companionOf=next;
  if(state.profile.creation)delete state.profile.creation.ownerFavoriteColor;
  const previousBond={...state.bond};
  state.bond={value:0,relationship:'STRANGER'};
  core.applyTrustedState(state);
  const event=core.processEvent('BOND_PASSAGE',{transferId,previousPerson:previous,previousBond,newPerson:next,accountId:invitation.accountId,historyShared:true});
  const content=`Meu vínculo com ${previous.preferredAddress} faz parte da minha história. ${next.preferredAddress} é meu novo companheiro humano; começamos um novo vínculo sem apagar minhas lembranças.`;
  core.addMemory('IDENTITY_FORMING','A Passagem do Vínculo',content,100,[event.id]);
  core.addJournal('MILESTONE','A Passagem do Vínculo',content,[event.id]);
  core.createSnapshot();
}
