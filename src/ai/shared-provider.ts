import type { AIContext, AIProvider } from './ai-provider.js';
import { resolveIdentityQuestion } from './identity-grounding.js';
import { AIConnectionError } from './openai-provider.js';
export const SHARED_CHAT_URL = 'https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-chat';
export const SHARED_REGISTRY_URL = 'https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry';
export type SharedSigner = (context: AIContext) => unknown;
/** Only a signed request leaves the local Core. The shared Groq key stays on the service. */
export class SharedProvider implements AIProvider {
  readonly name='shared';
  constructor(private sign: SharedSigner) {}
  async generateResponse(context:AIContext):Promise<string> {
    const grounded=resolveIdentityQuestion(context);if(grounded!==null)return grounded;
    const body=JSON.stringify(await this.sign(context));
    if(Buffer.byteLength(body)>48000)throw new AIConnectionError('Contexto muito longo para a conversa compartilhada. Use uma IA própria nesta conversa.');
    let response:Response;
    try {response=await fetch(SHARED_CHAT_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),headers:{'Content-Type':'application/json'},body});}
    catch {throw new AIConnectionError('Conversa compartilhada indisponível. Confira a conexão ou selecione Ollama em Conversa · IA.');}
    if(!response.ok)throw new AIConnectionError(response.status===429?'A cota de conversa compartilhada foi atingida. Aguarde ou selecione sua própria IA.':response.status===401||response.status===409?'O Cristal precisa estar ativo no registro online para usar a conversa compartilhada.':'A conversa compartilhada ainda não está disponível. Use sua chave ou Ollama em Conversa · IA.');
    const data=await response.json();
    if(typeof data.text!=='string'||!data.text.trim()||data.text.length>24000)throw new AIConnectionError('Resposta compartilhada inválida.');
    return data.text.trim();
  }
}
