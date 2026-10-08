import { Buffer } from 'node:buffer';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
type Account = { version: 1; username: string; salt: string; passwordHash: string; createdAt: string };
const TTL = 12 * 60 * 60 * 1000, COOKIE = 'mayuna_session';
const derive = (password: string, salt: string): Promise<Uint8Array> => new Promise((resolve,reject) => {
  scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
/** One local account. Credentials and sessions are separate from Companion identity. */
export class LocalAuth {
  private account: Account | null = null;
  private creating = false;
  private readonly sessions = new Map<string, number>();
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private readonly file: string;
  constructor(private readonly root = path.join(process.env.MAYUNA_DATA_DIR ?? 'data', '.access')) { this.file = path.join(root, 'account.json'); }
  async initialize() {
    try {
      const value = JSON.parse(await readFile(this.file,'utf8')) as Account;
      if (value.version !== 1 || !/^[a-z0-9_.-]{3,40}$/.test(value.username) || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.passwordHash)) throw new Error('Arquivo de acesso inválido. Preserve os dados e restaure o arquivo de acesso.');
      this.account = value;
    } catch (error) { if ((error as {code?:string}).code !== 'ENOENT') throw error; }
  }
  status(req: IncomingMessage) { return { configured: !!this.account, authenticated: this.authorized(req), scope: 'local' }; }
  private token(req: IncomingMessage) {
    const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : '';
  }
  authorized(req: IncomingMessage) {
    const token=this.token(req), expires=this.sessions.get(token);
    if (!expires || expires<=Date.now()) { if(token)this.sessions.delete(token);return false; }return true;
  }
  private credentials(body: unknown) {
    const input=body as {username?:unknown;password?:unknown}|null;
    const username=typeof input?.username==='string'?input.username.trim().toLowerCase():'';
    const password=typeof input?.password==='string'?input.password:'';
    if(!/^[a-z0-9_.-]{3,40}$/.test(username)||password.length<10||password.length>128)throw new AuthError(400,'Use um usuário de 3–40 letras/números e uma senha de 10–128 caracteres.');
    return {username,password};
  }
  private issue(req: IncomingMessage,res: ServerResponse) {
    this.sessions.delete(this.token(req));
    for(const [token,until] of this.sessions)if(until<=Date.now())this.sessions.delete(token);
    if(this.sessions.size>=32)this.sessions.delete(this.sessions.keys().next().value!);
    const token=Buffer.from(randomBytes(32)).toString('hex');this.sessions.set(token,Date.now()+TTL);
    // Current server is HTTP loopback. A future HTTPS deployment must add Secure.
    res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL/1000}`);
  }
  async setup(req: IncomingMessage,res: ServerResponse,body: unknown) {
    if(this.account||this.creating)throw new AuthError(409,'O acesso local já foi configurado. Entre com sua senha.');
    const {username,password}=this.credentials(body);this.creating=true;
    try{
      const salt=Buffer.from(randomBytes(16)).toString('hex');const hash=await derive(password,salt);
      const account:Account={version:1,username,salt,passwordHash:Buffer.from(hash).toString('hex'),createdAt:new Date().toISOString()};
      await mkdir(this.root,{recursive:true,mode:0o700});
      await writeFile(this.file,JSON.stringify(account,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
      this.account=account;this.issue(req,res);
    }finally{this.creating=false;}
  }
  async login(req: IncomingMessage,res: ServerResponse,body: unknown) {
    const address=req.socket.remoteAddress??'local',now=Date.now();
    for(const [key,value] of this.attempts)if(value.until<=now)this.attempts.delete(key);
    const attempt=this.attempts.get(address)??{count:0,until:now+15*60*1000};
    if(attempt.count>=8)throw new AuthError(429,'Muitas tentativas. Aguarde 15 minutos.');
    attempt.count++;this.attempts.set(address,attempt);
    const {username,password}=this.credentials(body);
    if(!this.account)throw new AuthError(409,'Configure o acesso local primeiro.');
    const hash=await derive(password,this.account.salt);
    if(!timingSafeEqual(hash,Buffer.from(this.account.passwordHash,'hex'))||username!==this.account.username)throw new AuthError(401,'Usuário ou senha incorretos.');
    this.attempts.delete(address);this.issue(req,res);
  }
  logout(req: IncomingMessage,res: ServerResponse) {
    this.sessions.delete(this.token(req));res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  }
}
