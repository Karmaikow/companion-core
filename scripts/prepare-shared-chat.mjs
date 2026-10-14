// Run after npm run build. Collect only the compiled dependency closure for the Edge Function.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const destination=path.resolve('supabase/functions/companion-chat/shared');
const seen=new Set();
async function copy(relative){
 if(seen.has(relative))return;seen.add(relative);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Invalid dependency');
 const content=await readFile(path.join('dist',relative),'utf8');
 const output=path.join(destination,relative);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,content);
 for(const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))await copy(path.normalize(path.join(path.dirname(relative),match[1])));
}
await copy('server/shared-chat.js');
console.log(`Prepared ${seen.size} server modules; no credentials included.`);
