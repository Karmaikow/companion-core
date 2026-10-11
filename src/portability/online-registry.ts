import { authenticateRegistryRequest, applyRegistryRequest, type RegistryEntry, type SignedRequest } from './registry-engine.js';
import { CrystalError } from './crystal-error.js';

export interface RegistryRecord { revision:number; entry:RegistryEntry; }
export interface RegistryStore {
  read(key:string):Promise<RegistryRecord|undefined>;
  compareAndSwap(key:string,revision:number|null,entry:RegistryEntry):Promise<boolean>;
  health():Promise<void>;
}

/** A database revision, rather than a process-local queue, arbitrates concurrent claims. */
export class OnlineRegistry {
  constructor(private store:RegistryStore){}
  async execute(input:SignedRequest){
    const key=authenticateRegistryRequest(input);
    for(let attempt=0;attempt<8;attempt++){
      const record=await this.store.read(key);
      const transition=applyRegistryRequest(input,record?.entry);
      if(!transition.entry)return transition.result;
      if(await this.store.compareAndSwap(key,record?.revision??null,transition.entry))return transition.result;
    }
    throw new CrystalError(503,'O registro está ocupado. Retome a mesma transferência em instantes.');
  }
}

/** This adapter runs only on the server. Its key must never reach a Core or browser. */
export class SupabaseRegistryStore implements RegistryStore {
  private base:string;
  constructor(url:string,private secret:string,private transport:typeof fetch=fetch){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||!secret)
      throw new Error('Configuração do registro online inválida.');
    this.base=parsed.origin+'/rest/v1/';
  }
  private async request(route:string,body?:unknown):Promise<any>{
    const headers:Record<string,string>={apikey:this.secret,'Content-Type':'application/json'};
    // Secret API keys belong only in apikey. Legacy service-role JWTs also need Bearer.
    if(!this.secret.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.secret}`;
    try {
      const response=await this.transport(this.base+route,{
        method:body===undefined?'GET':'POST',headers,redirect:'error',
        signal:AbortSignal.timeout(6000),...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(!response.ok)throw Error();
      return await response.json();
    }catch{throw new CrystalError(503,'O armazenamento do registro está indisponível. Retome a mesma transferência em instantes.');}
  }
  async read(key:string):Promise<RegistryRecord|undefined>{
    const rows=await this.request(`companion_session_registry?registry_key=eq.${encodeURIComponent(key)}&select=revision,entry&limit=1`);
    if(!Array.isArray(rows)||rows.length>1||rows.length===1&&(!Number.isSafeInteger(rows[0].revision)||rows[0].revision<1||!rows[0].entry))
      throw new CrystalError(503,'Resposta inválida do armazenamento do registro.');
    return rows[0];
  }
  async compareAndSwap(key:string,revision:number|null,entry:RegistryEntry){
    const saved=await this.request('rpc/companion_registry_cas',{p_key:key,p_expected_revision:revision,p_entry:entry});
    if(typeof saved!=='boolean')throw new CrystalError(503,'Resposta inválida do armazenamento do registro.');
    return saved;
  }
  async health(){await this.request('companion_session_registry?select=revision&limit=0');}
}

export function createRegistryHandler(store:RegistryStore){
  const registry=new OnlineRegistry(store);
  const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
    status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
  return async(request:Request):Promise<Response>=>{
    try{
      const pathname=new URL(request.url).pathname;
      if(request.method==='GET'&&pathname.endsWith('/health')){
        await store.health();
        return json(200,{ok:true,service:'companion-session-registry',version:2,storage:'postgres'});
      }
      if(request.method!=='POST'||!pathname.endsWith('/registry'))throw new CrystalError(404,'Rota não encontrada.');
      if(!request.headers.get('content-type')?.startsWith('application/json'))throw new CrystalError(415,'Envie uma solicitação JSON.');
      const reader=request.body?.getReader();
      if(!reader)throw new CrystalError(400,'Solicitação vazia.');
      const chunks:Uint8Array[]=[];let size=0;
      try{
        while(true){
          const {value,done}=await reader.read();if(done)break;
          size+=value.byteLength;
          if(size>64_000){await reader.cancel();throw new CrystalError(413,'Solicitação muito grande.');}
          chunks.push(value);
        }
      }finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let input:SignedRequest;
      try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
      catch{throw new CrystalError(400,'Solicitação JSON inválida.');}
      return json(200,await registry.execute(input));
    }catch(error){
      return error instanceof CrystalError?json(error.status,{error:error.message,details:error.details}):
        json(503,{error:'O registro central está indisponível. Retome a mesma transferência em instantes.'});
    }
  };
}
