import { authenticateRegistryRequest, type SignedRequest } from '../portability/registry-engine.js';
import { CrystalError } from '../portability/crystal-error.js';
import { GroqProvider } from '../ai/groq-provider.js';
import type { AIContext } from '../ai/ai-provider.js';
export interface ChatQuota {reserve(key:string,sessionHash:string,nonce:string):Promise<number>;}
export class SupabaseChatQuota implements ChatQuota {
  constructor(private url:string,private secret:string){}
  async reserve(key:string,sessionHash:string,nonce:string){
    const headers:Record<string,string>={apikey:this.secret,'Content-Type':'application/json'};
    if(!this.secret.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.secret}`;
    const response=await fetch(this.url+'/rest/v1/rpc/companion_chat_reserve',{method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),headers,body:JSON.stringify({p_key:key,p_session_hash:sessionHash,p_nonce:nonce})});
    if(!response.ok)throw Error('quota unavailable');
    const status=await response.json();if(![200,401,409,429].includes(status))throw Error('quota response');return status;
  }
}
export function createSharedChatHandler(quota:ChatQuota,apiKey:string,generate=(context:AIContext)=>new GroqProvider(apiKey).generateResponse(context)){
  const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return async(request:Request)=>{
    try{
      if(request.method!=='POST')return json(405,{error:'Use POST.'});
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'Use JSON.'});
      const reader=request.body?.getReader();if(!reader)return json(400,{error:'Corpo vazio.'});
      const chunks:Uint8Array[]=[];let size=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>48000){await reader.cancel();return json(413,{error:'Contexto muito grande.'});}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let input:SignedRequest;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return json(400,{error:'JSON inválido.'});}
      const key=authenticateRegistryRequest(input);
      if(input.action!=='companion-chat:v1')return json(401,{error:'Autorização inválida.'});
      const payload=input.payload as {sessionHash?:unknown;context?:unknown};
      if(!payload||typeof payload.sessionHash!=='string'||!/^[a-f0-9]{64}$/.test(payload.sessionHash))return json(401,{error:'Sessão inválida.'});
      const context=payload.context as AIContext;
      if(!context||context.identity?.companionId!==input.id||typeof context.systemPrompt!=='string'||context.systemPrompt.length>24000||typeof context.userMessage!=='string'||!context.userMessage.trim()||context.userMessage.length>2000||!Array.isArray(context.recentMessages)||context.recentMessages.length>16||context.recentMessages.some(m=>!m||!['USER','COMPANION','SYSTEM'].includes(m.role)||typeof m.content!=='string'||m.content.length>8000))return json(400,{error:'Contexto inválido.'});
      // Do not log prompts, replies, session hashes or credentials. Fail closed before reserving quota.
      if(!apiKey)return json(503,{error:'Conversa compartilhada ainda não ativada.'});
      const status=await quota.reserve(key,payload.sessionHash,input.nonce);
      if(status!==200)return json(status,{error:status===429?'Cota compartilhada atingida.':'Sessão ou solicitação inválida.'});
      return json(200,{text:await generate(context)});
    }catch(error){return json(error instanceof CrystalError?error.status:503,{error:'Conversa compartilhada indisponível.'});}
  };
}
