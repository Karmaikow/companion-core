// Explicitly synthetic UI fixture. No credentials, Companion keys or real history.
const state = {
 identity:{id:'DEMO-SEM-CORE',name:'Companion',createdAt:'2026-01-01T00:00:00.000Z'},
 profile:{name:'Companion',identity:{description:'Demonstração visual da interface.'},preferences:{favoriteColor:'azul-safira'},companionOf:{name:'Visitante',preferredAddress:'Visitante'}},
 core:{level:1,xp:0,xpToNextLevel:100,evolutionStage:'SOUL',evolutionProgress:0},combat:{level:1,xp:0,xpToNextLevel:100,wins:0,losses:0},bond:{value:0,relationship:'STRANGER'},
 personality:{loyalty:100,curiosity:50,humor:50,courage:50,empathy:50,autonomy:50},memories:[],journal:[],achievements:[],inventory:[],discoveries:[],meta:{provider:'mock',eventCount:0,snapshotCount:0}
};
export async function demoRequest(url, options={}) {
 let data, status=200;
 if(url==='/api/auth/status') data={configured:true,authenticated:true,scope:'demo'};
 else if(url==='/api/companion/state') data=structuredClone(state);
 else if(url==='/api/companion/verify') data={valid:false,reason:'Prévia visual: nenhum Core real está conectado.'};
 else if(url==='/api/companion/chat') {
  const message=JSON.parse(options.body||'{}').message||'';
  data={response:/nome|conhece/i.test(message)?'Esta é uma prévia da interface. Seu nome e sua história virão do seu Core quando a conexão local for implementada.':'A alma reage e a conversa aparece aqui. Nesta prévia, as respostas são demonstrativas: nenhuma IA real é consultada e nenhuma memória ou XP é criado.',state:structuredClone(state),guarded:false};
 }else{status=404;data={error:'Ação indisponível na prévia.'};}
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
}
