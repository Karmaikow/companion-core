import { SessionRegistry, registryHttpServer } from '../portability/registry.js';
import path from 'node:path';
const file=path.resolve(process.env.COMPANION_REGISTRY_DATA??'.companion-registry/registry.json');
const registry=new SessionRegistry(file);await registry.initialize();
const server=registryHttpServer(registry);
server.on('error',()=>{console.error('Não foi possível iniciar o registro de sessões. Confira host e porta.');process.exitCode=1;});
server.listen(Number(process.env.PORT??4174),process.env.HOST??'127.0.0.1',()=>console.info(`Registro de sessões: ${process.env.HOST??'127.0.0.1'}:${process.env.PORT??4174}\nDados privados: ${file}`));
