import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';

export interface KeyPair { publicKey:string; privateKey:string; }

export function generateIdentity():KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({type:'spki', format:'pem'}).toString(),
    privateKey: privateKey.export({type:'pkcs8', format:'pem'}).toString()
  };
}
export function sha256(value:string):string { return createHash('sha256').update(value,'utf8').digest('hex'); }
export function signData(value:string, privateKeyPem:string):string { return sign(null, Buffer.from(value), createPrivateKey(privateKeyPem)).toString('base64'); }
export function verifySignature(value:string, signature:string, publicKeyPem:string):boolean { return verify(null, Buffer.from(value), createPublicKey(publicKeyPem), Buffer.from(signature,'base64')); }
export function stableJson(value:unknown):string {
  const normalize=(v:unknown):unknown=>{
    if(Array.isArray(v)) return v.map(normalize);
    if(v && typeof v==='object') return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)]));
    return v;
  };
  return JSON.stringify(normalize(value));
}
