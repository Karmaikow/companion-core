import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../storage/store.js';
import { CrystalError } from './crystal-error.js';
import { authenticateRegistryRequest, applyRegistryRequest, type RegistryEntry, type SignedRequest } from './registry-engine.js';
export type { Device, SignedRequest } from './registry-engine.js';

/** File storage remains available for local development and existing registries. */
export class SessionRegistry {
  private entries:Record<string,RegistryEntry>={};
  private queue:Promise<unknown>=Promise.resolve();
  private nonces=new Map<string,number>();
  constructor(private file:string){}
  async initialize(){try{this.entries=JSON.parse(await readFile(this.file,'utf8'));if(!this.entries||typeof this.entries!=='object'||Array.isArray(this.entries))throw Error();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Registro corrompido. Restaure um backup; não crie outro registro para as mesmas identidades.');}}
  execute(input:SignedRequest){const next=this.queue.then(()=>this.apply(input));this.queue=next.catch(()=>undefined);return next;}
  private async apply(input:SignedRequest){
    const key=authenticateRegistryRequest(input),nonce=`${input.id}:${input.nonce}`;
    for(const [n,t] of this.nonces)if(t<Date.now()-120_000)this.nonces.delete(n);
    if(this.nonces.has(nonce))throw new CrystalError(409,'Solicitação já utilizada.');
    const transition=applyRegistryRequest(input,this.entries[key]);
    if(transition.entry){
      const next={...this.entries,[key]:transition.entry};
      await writeFileAtomic(this.file,JSON.stringify(next),0o600);
      this.entries=next;
    }
    this.nonces.set(nonce,Date.now());
    return transition.result;
  }
}
export function registryHttpServer(registry:SessionRegistry){return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  try{
    if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify({ok:true,service:'companion-session-registry',version:2}));return;}
    if(req.method!=='POST'||req.url!=='/registry'||!(req.headers['content-type']??'').startsWith('application/json'))throw new CrystalError(404,'Rota não encontrada.');
    let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>64_000)throw new CrystalError(413,'Solicitação muito grande.');}
    const result=await registry.execute(JSON.parse(body));res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e instanceof CrystalError?e.status:400;res.end(JSON.stringify({error:e instanceof CrystalError?e.message:'Solicitação inválida.',details:e instanceof CrystalError?e.details:undefined}));}
});}
