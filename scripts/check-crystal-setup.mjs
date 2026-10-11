import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.MAYUNA_DATA_DIR||'data');
async function optional(file){try{return JSON.parse(await readFile(path.join(root,file),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error(`Não foi possível ler ${file}. Preserve os dados e confira seu backup.`);}}
try{
  const saved=await optional('.crystal/session.json');
  const active=await optional('active-companion.json');
  const configured=process.env.COMPANION_REGISTRY_URL||null;
  const sessions=saved?(saved.version===2?Object.values(saved.sessions):[saved]):[];
  console.log(JSON.stringify({
    dataDirectory:root,activeCompanionId:active?.id??null,configuredRegistry:configured,
    sessions:sessions.map(s=>({id:s.id,phase:s.phase,registry:s.authority,device:s.device?.name,
      needsRegistryMigration:Boolean(configured&&s.authority?.replace(/\/$/,'')!==configured.replace(/\/$/,''))})),
    note:sessions.length?'Sessões existentes mantêm seu registro de origem até uma migração explícita.':'Nenhuma sessão do Cristal foi registrada nesta pasta. A identidade local não foi alterada.'
  },null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
