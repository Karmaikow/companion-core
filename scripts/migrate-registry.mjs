import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {mergeRegistries} from '../dist/portability/registry-migration.js';
import {authorityUrl} from '../dist/portability/registry-client.js';
const args=process.argv.slice(2);
try {
 const configPath=args.find(arg=>!arg.startsWith('--'));
 if(!configPath)throw Error('Uso: npm run crystal:migrate -- migracao.json [--write --registries-stopped]');
 if(args.some(arg=>arg.startsWith('--')&&!['--write','--registries-stopped'].includes(arg)))throw Error('Opção desconhecida.');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 const base=path.dirname(path.resolve(configPath));
 if(!Array.isArray(config.sources)||!config.sources.length||typeof config.output!=='string')throw Error('Informe sources e output no arquivo de migração.');
 const target=authorityUrl(config.targetAuthority);
 const sources=[];
 for(const source of config.sources)sources.push({authority:source.authority,entries:JSON.parse(await readFile(path.resolve(base,source.file),'utf8'))});
 const merged=mergeRegistries(sources);
 console.info(`Validação concluída: ${Object.keys(merged).length} identidades; destino ${target}.`);
 if(args.includes('--write')){
  if(!args.includes('--registries-stopped'))throw Error('Pare TODOS os registros de origem e destino. Confirme com --registries-stopped.');
  const output=path.resolve(base,config.output);await mkdir(path.dirname(output),{recursive:true,mode:0o700});
  // Exclusive creation: never overwrite an existing or running registry.
  await writeFile(output,JSON.stringify(merged,null,2),{flag:'wx',mode:0o600});
  console.info('Novo registro gravado. As origens foram preservadas; mantenha os servidores antigos desligados.');
 }else console.info('Simulação: nenhum arquivo alterado. Para gravar, pare os registros e use --write --registries-stopped.');
}catch(error){console.error(error.message);process.exitCode=1;}
