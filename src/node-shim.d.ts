declare module 'node:crypto' { export const randomUUID:any; export const createHash:any; export const createPrivateKey:any; export const createPublicKey:any; export const generateKeyPairSync:any; export const sign:any; export const verify:any; }
declare module 'node:fs/promises' { export const mkdir:any; export const open:any; export const readFile:any; export const rename:any; export const rm:any; export const writeFile:any; }
declare module 'node:path' { const path:any; export default path; }
declare const Buffer:any;
