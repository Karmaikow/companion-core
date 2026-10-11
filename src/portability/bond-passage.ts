import { createPublicKey, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateIdentity, sha256, signData, stableJson, verifySignature, type KeyPair } from '../crypto/crypto.js';
import { CrystalError } from './crystal.js';
import type { CompanionCore } from '../core/core.js';
import { preferenceFact } from '../memory/memory-facts.js';

import { validateInvitation, acceptanceClaim, type BondInvitation } from './bond-protocol.js';
export { validateInvitation, acceptanceClaim, type BondInvitation } from './bond-protocol.js';

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
