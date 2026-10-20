// Copia shared/rules para dentro da Edge Function (o deploy precisa dos arquivos locais).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const dest = new URL('../supabase/functions/refuge/rules/', import.meta.url);
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(new URL('../shared/rules/', import.meta.url), dest, { recursive: true });
console.log('rules sincronizadas ->', dest.pathname);
