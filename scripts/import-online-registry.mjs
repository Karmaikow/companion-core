import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mergeRegistries } from '../dist/portability/registry-migration.js';
import { SupabaseRegistryStore } from '../dist/portability/online-registry.js';
import { stableJson } from '../dist/crypto/crypto.js';
import { authorityUrl } from '../dist/portability/registry-client.js';

// Operator-only migration. Never run this in a browser or distribute the admin key.
const args=process.argv.slice(2);
try{
  const configPath=args.find(a=>!a.startsWith('--'));
  if(!configPath||args.some(a=>a.startsWith('--')&&!['--write','--registries-stopped'].includes(a)))
    throw Error('Uso: npm run registry:import -- migracao.json [--write --registries-stopped]');
  const config=JSON.parse(await readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath));
  if(!Array.isArray(config.sources)||!config.sources.length)throw Error('Informe os registros originais em sources.');
  const target=authorityUrl(config.targetAuthority);
  const sources=[];
  for(const source of config.sources)sources.push({authority:source.authority,entries:JSON.parse(await readFile(path.resolve(base,source.file),'utf8'))});
  const entries=mergeRegistries(sources);
  console.info(`Validação local: ${Object.keys(entries).length} identidades; destino ${target}.`);
  if(!args.includes('--write')){
    console.info('Simulação: nenhuma rede acessada e nenhum arquivo alterado. Conflitos no destino serão verificados antes da gravação.');
  }else{
    if(!args.includes('--registries-stopped'))throw Error('Pare os registros de origem e confirme com --registries-stopped.');
    const url=process.env.COMPANION_REGISTRY_DATABASE_URL,key=process.env.COMPANION_REGISTRY_ADMIN_KEY;
    if(!url||!key)throw Error('Configure COMPANION_REGISTRY_DATABASE_URL e COMPANION_REGISTRY_ADMIN_KEY apenas no ambiente administrativo.');
    if(target!==authorityUrl(new URL(url).origin+'/functions/v1/companion-registry'))throw Error('O destino informado não corresponde ao projeto Supabase administrativo.');
    const store=new SupabaseRegistryStore(url,key);
    const missing=[];
    for(const [id,entry] of Object.entries(entries)){
      const current=await store.read(id);
      if(current&&stableJson(current.entry)!==stableJson(entry))throw Error(`Registro divergente no destino para ${id.split(':')[0]}. Nada foi sobrescrito.`);
      if(!current)missing.push([id,entry]);
    }
    for(const [id,entry] of missing){
      if(!await store.compareAndSwap(id,null,entry))throw Error('O destino mudou durante a migração. Preserve as origens desligadas e execute novamente para conferir.');
    }
    console.info('Registros copiados sem sobrescrever sessões. Mantenha as origens desligadas e conecte os Cores ao novo registro.');
  }
}catch(e){console.error(e.message);process.exitCode=1;}
