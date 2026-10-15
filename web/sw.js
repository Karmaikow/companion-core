// Static interface only. Never cache API responses, sessions or Companion data.
const CACHE='mayuna-shell-v17-refuge-motion';
const ASSETS=["/modules/refuge-motion.js","/modules/art-image.js","/modules/form-art.js","/modules/desktop-conversation.js","/evolution.css", "/modules/companion-body.js", "/modules/manifestation-rules.js", "/portal.css", "/modules/android-shell.js", "/modules/notice.js","/modules/crystal-panel.js","/modules/color-names.js","/creation-ritual.css", "/modules/creation-ritual.js", "/", "/icon.svg", "/sanctuary.css", "/manifest.webmanifest", "/styles.css", "/experience-layout.css", "/index.html", "/app.js", "/astral.css", "/modules/panel-manager.js", "/modules/preferences.js", "/modules/runtime-mode.js", "/modules/game-viewport.js", "/modules/api.js", "/modules/demo-transport.js", "/modules/remote-transport.js", "/modules/floating-chat.js", "/modules/access-gate.js", "/modules/cloud-vault.js", "/modules/http.js", "/modules/hud-effects.js"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mayuna-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok&&response.type==='basic'&&!response.redirected){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;
 }).catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
});


