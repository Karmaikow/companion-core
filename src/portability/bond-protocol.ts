import { createPublicKey } from 'node:crypto';
import { sha256, stableJson, verifySignature } from '../crypto/crypto.js';
import { CrystalError } from './crystal-error.js';

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

export function acceptanceClaim(id:string,transferId:string,bundleHash:string,session:string,recovery:string,deviceId:string){
  return {domain:'companion-bond-accept:v1',id,transferId,bundleHash,sessionHash:sha256(session),recoveryHash:sha256(recovery),deviceId};
}
