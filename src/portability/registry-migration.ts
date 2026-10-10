import { createPublicKey } from 'node:crypto';
import { sha256, stableJson } from '../crypto/crypto.js';
import { authorityUrl } from './registry-client.js';

/** Offline administrative migration. No sessions are invented or re-authorized. */
export function mergeRegistries(sources:Array<{authority:string;entries:Record<string,any>}>):Record<string,any> {
  const result:Record<string,any>=Object.create(null);
  const fingerprints=new Map<string,string>();
  for(const source of sources){
    const authority=authorityUrl(source.authority);
    if(!source.entries||typeof source.entries!=='object'||Array.isArray(source.entries))throw Error('Registro de origem inválido.');
    for(const [key,value] of Object.entries(source.entries)){
      const [id,fingerprint]=key.split(':');
      if(!/^MC-[A-Z0-9-]+$/i.test(id)||!/^[a-f0-9]{64}$/.test(fingerprint??''))throw Error('Identificador de registro inválido.');
      const publicKey=createPublicKey(value.publicKey);
      if(publicKey.asymmetricKeyType!=='ed25519'||sha256(publicKey.export({type:'spki',format:'pem'}).toString())!==fingerprint)throw Error('Chave do registro inválida.');
      if(!['active','recollected'].includes(value.status)||!value.device?.id||!value.device?.name||![value.sessionHash,value.recoveryHash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw Error('Sessão de origem inválida.');
      if(value.status==='recollected'&&!value.transfer)throw Error('Transferência de origem incompleta.');
      if(value.transfer&&(!/^[a-f0-9]{64}$/.test(value.transfer.secretHash)||!/^[a-f0-9]{64}$/.test(value.transfer.bundleHash)||typeof value.transfer.id!=='string'))throw Error('Transferência de origem inválida.');
      if(fingerprints.has(id)&&fingerprints.get(id)!==fingerprint)throw Error(`Conflito de chave para ${id}. Nenhum registro foi escolhido automaticamente.`);
      fingerprints.set(id,fingerprint);
      const incoming=structuredClone(value),existing=result[key];
      const clean=(entry:any)=>{const copy=structuredClone(entry);delete copy.migratedFrom;return copy;};
      if(existing&&stableJson(clean(existing))!==stableJson(clean(incoming)))throw Error(`Sessões divergentes para ${id}. Preserve as origens e resolva o conflito antes de migrar.`);
      incoming.migratedFrom=[...new Set([...(existing?.migratedFrom??[]),...(incoming.migratedFrom??[]),authority])].map(url=>authorityUrl(String(url)));
      result[key]=incoming;
    }
  }
  return result;
}
