import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../storage/store.js';

export const MAX_ART_BYTES = 4_000_000;
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
export function validateArt(dataUrl: unknown, frames: unknown = 1, fps: unknown = 6) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_ART_BYTES*4/3)+32 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw Error('Envie uma imagem PNG de até 4 MB.');
  const bytes = Buffer.from(dataUrl.slice(22),'base64');
  if (bytes.length < 45 || bytes.length > MAX_ART_BYTES || !bytes.subarray(0,8).equals(PNG) || bytes.toString('ascii',12,16) !== 'IHDR' || bytes.readUInt32BE(8)!==13 || bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND') throw Error('PNG inválido.');
  const width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20);
  if (!Number.isInteger(frames) || (frames as number)<1 || (frames as number)>8 || !Number.isInteger(fps) || (fps as number)<1 || (fps as number)>12) throw Error('Use de 1 a 8 quadros e de 1 a 12 quadros por segundo.');
  if (width<1 || height<1 || width>8192 || height>2048 || width*height>4_194_304 || width%(frames as number)!==0) throw Error('A imagem deve ter até 4 milhões de pixels e quadros de larguras iguais.');
  return {bytes, frames:frames as number, fps:fps as number, id:createHash('sha256').update(bytes).digest('hex')};
}

/** Content-addressed, private PNGs; state/events carry small signed references only. */
export class FormArtStore {
  constructor(private root:string) {}
  private filename(companionId:string,id:string) {
    if (!/^MC-[A-Z0-9-]+$/.test(companionId) || !/^[a-f0-9]{64}$/.test(id)) throw Error('Referência da arte inválida.');
    return path.join(this.root,'artwork',companionId,id+'.png');
  }
  async put(companionId:string,art:ReturnType<typeof validateArt>) {
    const file=this.filename(companionId,art.id);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
    await writeFileAtomic(file,art.bytes,0o600);
  }
  async get(companionId:string,id:string) {return readFile(this.filename(companionId,id));}
}

/** Optional paid generation. No image request is made during evolution or chat. */
export class FormImageProvider {
  private key='';
  private busy=false;
  private file:string;
  constructor(root:string, private request:typeof fetch=fetch, private env:NodeJS.ProcessEnv=process.env) {this.file=path.join(root,'.access','images.json');}
  async initialize() {
    try {const saved=JSON.parse(await readFile(this.file,'utf8'));if(typeof saved.key!=='string')throw Error();this.key=saved.key;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Configuração de imagens inválida. Preserve data/.access/images.json.');}
  }
  status() {return {configured:!!(this.key||this.env.COMPANION_IMAGE_API_KEY),model:this.env.COMPANION_IMAGE_MODEL||'gpt-image-2.5-sunburst'};}
  async configure(input:unknown) {
    const key=(input as {key?:unknown})?.key;
    if(typeof key!=='string'||key.length>4096||/[\r\n\x00]/.test(key))throw Error('Chave inválida.');
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    await writeFileAtomic(this.file,JSON.stringify({key:key.trim()}),0o600);this.key=key.trim();return this.status();
  }
  async generate(prompt:string, paidConsent:unknown, reference?:Buffer|Buffer[]) {
    if(paidConsent!==true)throw Error('Confirme o uso da API paga de imagens.');
    const key=this.key||this.env.COMPANION_IMAGE_API_KEY;
    if(!key)throw Error('Configure uma chave OpenAI de imagens ou importe um PNG. A chave Groq não gera estas imagens.');
    if(this.busy)throw Error('Uma imagem já está sendo gerada. Aguarde.');
    this.busy=true;
    try {
      const params={model:this.status().model,prompt,n:1,size:'1024x1024',quality:'medium',background:'transparent',output_format:'png'};
      let body:BodyInit=JSON.stringify(params);
      const headers:Record<string,string>={Authorization:`Bearer ${key}`};
      const references=reference?(Array.isArray(reference)?reference:[reference]):[];
      if(references.length){const form=new FormData();for(const [k,v] of Object.entries(params))form.set(k,String(v));for(const [i,image] of references.entries())form.append('image[]',new Blob([new Uint8Array(image)],{type:'image/png'}),`reference-${i}.png`);body=form;}
      else headers['Content-Type']='application/json';
      const response=await this.request('https://api.openai.com/v1/images/'+(references.length?'edits':'generations'),{method:'POST',headers,body,signal:AbortSignal.timeout(160_000)});
      if(!response.ok)throw Error(`A API de imagens recusou o pedido (${response.status}). Confira acesso ao modelo, saldo e chave no painel OpenAI.`);
      const data=await response.json() as {data?:{b64_json?:string}[]};
      const image='data:image/png;base64,'+(data.data?.[0]?.b64_json??'');validateArt(image);
      return image;
    }catch(e){if(e instanceof Error && /API de imagens|PNG|pixels|Envie/.test(e.message))throw e;throw Error('A geração não foi concluída. Nenhuma forma foi substituída. Confira o painel antes de tentar novamente.');}
    finally{this.busy=false;}
  }
}

