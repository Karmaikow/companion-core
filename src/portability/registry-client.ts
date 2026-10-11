import { randomUUID } from 'node:crypto';
import { signData, stableJson } from '../crypto/crypto.js';
import { CrystalError } from './crystal.js';
export function authorityUrl(value:string){const u=new URL(value);if(u.username||u.password||u.search||u.hash||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new CrystalError(400,'Use HTTPS para o registro central, ou HTTP apenas no localhost para testes.');return u.href.replace(/\/$/,'');}
export class RegistryClient {
  readonly url:string;
  constructor(url:string){this.url=authorityUrl(url);}
  async request(action:string,id:string,publicKey:string,privateKey:string,payload:Record<string,unknown>){
    const unsigned={action,id,publicKey,payload,timestamp:Date.now(),nonce:randomUUID()};
    let response:Response;
    try{response=await fetch(`${this.url}/registry`,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10_000),body:JSON.stringify({...unsigned,signature:signData(stableJson(unsigned),privateKey)})});}
    catch{
      const local=['localhost','127.0.0.1','[::1]'].includes(new URL(this.url).hostname);
      throw new CrystalError(503,local
        ?'O registro local deste dispositivo está indisponível. Um Cristal de outro computador precisa do registro original migrado para o servidor online. Preserve o mesmo arquivo e a pasta data.'
        :'O registro central está indisponível. A transferência permanece protegida; retome o mesmo Cristal quando a conexão voltar.');
    }
    let body:any;try{body=await response.json();}catch{throw new CrystalError(503,'Resposta inválida do registro central.');}
    if(!response.ok)throw new CrystalError(response.status,body.error??'Registro central recusou a operação.',body.details);return body;
  }
}
