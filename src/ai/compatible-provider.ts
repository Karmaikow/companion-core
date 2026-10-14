import type { AIContext, AIProvider } from './ai-provider.js';
import { resolveIdentityQuestion } from './identity-grounding.js';
import { AIConnectionError } from './openai-provider.js';
/** User-selected HTTPS Chat Completions endpoint; never receives a managed credential. */
export class CompatibleProvider implements AIProvider {
  readonly name='compatible';
  private endpoint:string;
  constructor(private secret:string,private model:string,baseUrl:string){
    let url:URL;try{url=new URL(baseUrl);}catch{throw new Error('Informe a URL HTTPS da API compatível.');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!model||!secret)throw new Error('Informe URL HTTPS, modelo e chave da API compatível.');
    this.endpoint=url.href.replace(/\/$/,'')+'/chat/completions';
  }
  async generateResponse(context:AIContext){
    const grounded=resolveIdentityQuestion(context);if(grounded!==null)return grounded;
    let response:Response;
    try{response=await fetch(this.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.secret}`},body:JSON.stringify({model:this.model,stream:false,max_tokens:1024,messages:[{role:'system',content:context.systemPrompt},...context.recentMessages.map(m=>({role:m.role==='USER'?'user':m.role==='COMPANION'?'assistant':'system',content:m.content})),{role:'user',content:context.userMessage}]})});}
    catch{throw new AIConnectionError('A API escolhida está indisponível. Confira a conexão e o endereço.');}
    if(!response.ok)throw new AIConnectionError('A API escolhida recusou a conversa. Confira chave, modelo e cota.');
    const data=await response.json(),choice=data?.choices?.[0],text=choice?.message?.content;
    if(choice?.finish_reason!=='stop'||typeof text!=='string'||!text.trim()||text.length>24000)throw new AIConnectionError('A API não concluiu uma resposta textual válida.');
    return text.trim();
  }
}
