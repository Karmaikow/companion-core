import { randomBytes, scrypt, createCipheriv, createDecipheriv, createPublicKey } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { validateInvitation, type BondInvitation } from './bond-passage.js';
import { CompanionCore } from '../core/core.js';
import { sha256, signData, verifySignature, stableJson } from '../crypto/crypto.js';
import type { StoredCompanion } from '../models/types.js';

const derive = (password:string,salt:Buffer):Promise<Buffer> => new Promise((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024},(error,key)=>error?reject(error):resolve(Buffer.from(key))));
const AAD = Buffer.from('companion-memory-crystal:v1:aes-256-gcm:scrypt-32768-8-1');
export const MAX_CRYSTAL_BYTES = 12_000_000;
import { CrystalError } from './crystal-error.js';
export { CrystalError } from './crystal-error.js';
export interface CrystalPayload {
  gift?: {invitation:BondInvitation;historyShared:true};
  version: 1; authority: string; transferId: string; transferSecret: string;
  exportedAt: string; data: StoredCompanion; privateKey: string; stateSignature: string;
}
export function validatePayload(payload: CrystalPayload): CompanionCore {
  try {
    if(payload.version!==1 || !/^MC-[A-Z0-9-]+$/i.test(payload.data.state.identity.id) ||
      !/^[a-f0-9]{64}$/.test(payload.transferSecret) || typeof payload.authority!=='string' || typeof payload.transferId!=='string') throw Error();
    if(payload.gift){validateInvitation(payload.gift.invitation,false);if(payload.gift.historyShared!==true)throw Error();}
    const key = payload.data.state.identity.cryptographicIdentity.publicKey;
    if(createPublicKey(payload.privateKey).export({type:'spki',format:'pem'}).toString()!==key) throw Error();
    if(!verifySignature(stableJson(payload.data),payload.stateSignature,key)) throw Error();
    const core=CompanionCore.from(payload.data,payload.privateKey);
    if(!core.verifyLocal().valid) throw Error();
    return core;
  } catch { throw new CrystalError(400,'O Cristal contém uma identidade ou histórico inválido. Nenhum dado foi substituído.'); }
}
export async function sealCrystal(payload: CrystalPayload, password: string): Promise<string> {
  if(typeof password!=='string'||password.length<12||password.length>256) throw new CrystalError(400,'Use uma senha do Cristal com 12 a 256 caracteres.');
  validatePayload(payload);
  const salt=randomBytes(32),iv=randomBytes(12);
  const key=await derive(password,salt);
  try {
    const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(AAD);
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
    const result=JSON.stringify({format:'companion-memory-crystal',version:1,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),tag:Buffer.from(cipher.getAuthTag()).toString('base64'),ciphertext:ciphertext.toString('base64')});
    if(Buffer.byteLength(result)>MAX_CRYSTAL_BYTES) throw new CrystalError(413,'O histórico excede o limite desta versão do Cristal.');
    return result;
  } finally { key.fill(0); }
}
export async function openCrystal(file: string,password: string): Promise<CrystalPayload> {
  if(typeof file!=='string'||Buffer.byteLength(file)>MAX_CRYSTAL_BYTES||typeof password!=='string'||password.length<12||password.length>256) throw new CrystalError(400,'Cristal ou senha inválidos.');
  try {
    const envelope=JSON.parse(file);
    if(envelope.format!=='companion-memory-crystal'||envelope.version!==1) throw Error();
    const decode=(value:unknown,length?:number)=>{
      if(typeof value!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw Error();
      const bytes=Buffer.from(value,'base64');if(length!==undefined&&bytes.length!==length)throw Error();return bytes;
    };
    const salt=decode(envelope.salt,32),iv=decode(envelope.iv,12),tag=decode(envelope.tag,16),ciphertext=decode(envelope.ciphertext);
    const key=await derive(password,salt);
    try {
      const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(AAD);decipher.setAuthTag(tag);
      const payload=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
      validatePayload(payload);return payload;
    } finally { key.fill(0); }
  } catch { throw new CrystalError(400,'Não foi possível abrir o Cristal: senha incorreta, arquivo danificado ou versão incompatível.'); }
}
export function signCrystalData(data: StoredCompanion,privateKey: string) { return signData(stableJson(data),privateKey); }
export function crystalHash(file: string) { return sha256(file); }
