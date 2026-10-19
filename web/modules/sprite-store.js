const DB='companion-sprite-studio-v1';
export function spriteKey(id,generation){return `${id}:form:${generation}`;}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('sprites');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readSprite(key){const db=await open();try{return await new Promise((resolve,reject)=>{const r=db.transaction('sprites').objectStore('sprites').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function write(key,value){const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('sprites','readwrite');tx.objectStore('sprites').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Não foi possível salvar.'));});}finally{db.close();}}
export const readSpriteDraft=key=>readSprite(key+':draft');
export const saveSpriteDraft=(key,value)=>write(key+':draft',value);
export async function saveSprite(key,value){await write(key,value);const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(DB):null;channel?.postMessage({key});channel?.close();window.dispatchEvent(new CustomEvent('sprite:saved',{detail:{key}}));}
export function watchSprites(callback){const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(DB):null;const on=e=>callback(e.data||e.detail);if(channel)channel.onmessage=on;window.addEventListener('sprite:saved',on);return()=>{channel?.close();window.removeEventListener('sprite:saved',on);};}
