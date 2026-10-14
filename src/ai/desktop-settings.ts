import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AIContext, AIProvider } from './ai-provider.js';
import { createAIProvider } from './provider-factory.js';
import { CompatibleProvider } from './compatible-provider.js';
import { SharedProvider, type SharedSigner } from './shared-provider.js';
import { GroqProvider } from './groq-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAIProvider, AIConnectionError } from './openai-provider.js';
type Settings = { provider:'shared'|'groq'|'ollama'|'openai'|'compatible'; model:string; baseUrl:string; secret:string; freePlanConfirmed:boolean };
export class DesktopAISettings implements AIProvider {
  private settings:Settings|null=null;
  private fallback:AIProvider|null=null;
  private profiles:Partial<Record<Settings['provider'],Settings>>={};
  private sign:SharedSigner=()=>{throw new AIConnectionError('Reinicie o Core para ativar a conversa compartilhada.');};
  setSharedSigner(sign:SharedSigner){this.sign=sign;}
  private saving=false;
  readonly file:string;
  constructor(private env:NodeJS.ProcessEnv=process.env){this.file=path.resolve(env.MAYUNA_DATA_DIR??'data','.access','conversation.json');}
  get name(){return this.settings?.provider??this.env.MAYUNA_AI_PROVIDER??'shared';}
  get activeProvider(){return this.settings?.provider??this.fallback?.activeProvider??this.name;}
  async initialize(){
    try {
      const value=JSON.parse(await readFile(this.file,'utf8'));
      if(value.version===2){
        for(const [key,profile] of Object.entries(value.profiles??{})){
          const valid=this.validate(profile,profile as Settings);if(valid.provider!==key)throw Error();this.make(valid);this.profiles[valid.provider]=valid;
        }
        if(value.provider!=='environment') {this.settings=this.profiles[value.provider as Settings['provider']]??null;if(!this.settings)throw Error();}
      } else {this.settings=this.validate(value,value);this.make(this.settings);this.profiles[this.settings.provider]=this.settings;}
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Configuração de conversa inválida. Preserve conversation.json e confira a configuração local.');}
  }
  status(){
    const publicSettings=(s:Settings)=>({provider:s.provider,model:s.model,baseUrl:s.baseUrl,hasSecret:!!s.secret,freePlanConfirmed:s.freePlanConfirmed});
    return {...(this.settings?publicSettings(this.settings):{provider:this.env.MAYUNA_AI_PROVIDER?'environment':'shared',model:'',baseUrl:'http://127.0.0.1:11434',hasSecret:false,freePlanConfirmed:false}),profiles:Object.fromEntries(Object.entries(this.profiles).map(([key,s])=>[key,publicSettings(s)]))};
  }
  private validate(input:any,previous:Settings|null):Settings {
    if(!input||!['shared','groq','ollama','openai','compatible'].includes(input.provider))throw new Error('Escolha Groq, Ollama ou OpenAI.');
    const text=(v:unknown,max:number)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>max||/[\r\n\x00]/.test(v))throw new Error('Configuração inválida.');return v.trim();};
    const provider=input.provider as Settings['provider'];
    const supplied=text(input.secret,4096);
    const secret=supplied||(previous?.provider===provider?previous.secret:'');
    const model=text(input.model,160);
    const baseUrl=text(input.baseUrl,2048)||'http://127.0.0.1:11434';
    if(!['ollama','shared'].includes(provider)&&!secret)throw new Error('Informe a chave da API.');
    if(provider==='groq'&&input.freePlanConfirmed!==true)throw new Error('Confirme seu plano Free no painel Groq.');
    if(provider==='openai'&&!model)throw new Error('Informe o modelo OpenAI.');
    return {provider,secret:provider==='shared'?'':secret,model,baseUrl,freePlanConfirmed:input.freePlanConfirmed===true};
  }
  private make(s:Settings):AIProvider {return s.provider==='shared'?new SharedProvider(c=>this.sign(c)):s.provider==='compatible'?new CompatibleProvider(s.secret,s.model,s.baseUrl):s.provider==='groq'?new GroqProvider(s.secret):s.provider==='openai'?new OpenAIProvider(s.secret,s.model):new OllamaProvider({baseUrl:s.baseUrl,model:s.model,token:s.secret});}
  async save(input:unknown){
    if(this.saving)throw new Error('Aguarde a configuração anterior.');
    this.saving=true;
    try{const next=this.validate(input,this.profiles[(input as Settings)?.provider]??null);this.make(next);await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({...next,version:2,profiles:{...this.profiles,[next.provider]:next}}),{mode:0o600,flag:'wx'});await rename(temp,this.file);this.settings=next;this.profiles[next.provider]=next;this.fallback=null;return this.status();}finally{this.saving=false;}
  }
  async generateResponse(context:AIContext){
    if(this.settings)return this.make(this.settings).generateResponse(context);
    if(!this.env.MAYUNA_AI_PROVIDER)return new SharedProvider(c=>this.sign(c)).generateResponse(context);
    try{this.fallback??=createAIProvider(this.env);}catch{throw new AIConnectionError('Abra Conversa · IA para configurar a conversa.');}
    return this.fallback.generateResponse(context);
  }
}
