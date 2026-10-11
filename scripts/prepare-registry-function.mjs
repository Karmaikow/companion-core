import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root='supabase/functions/companion-registry/shared';
for(const name of ['crypto/crypto.js','portability/bond-protocol.js','portability/crystal-error.js','portability/registry-engine.js','portability/online-registry.js']){
  const target=path.join(root,name);
  await mkdir(path.dirname(target),{recursive:true});
  await copyFile(path.join('dist',name),target);
}
console.info('Registro preparado a partir dos mesmos módulos testados pelo Core.');
