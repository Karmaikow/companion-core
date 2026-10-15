import type {StoredCompanion} from '../models/types.js';
import {evolutionEvidence} from './manifestation.js';
export function companionQuests(data:StoredCompanion){
 const evidence=evolutionEvidence(data.state);
 const rewards=data.events.filter(e=>e.data.kind==='QUEST_REWARD');
 const claimed=new Set(rewards.map(e=>e.data.questId));
 const make=(id:string,title:string,description:string,current:number,target:number,xp:number,prompt:string)=>({id,title,description,current:Math.min(current,target),target,xp,prompt,claimed:claimed.has(id),ready:current>=target&&!claimed.has(id)});
 const quests=[
  make('own-color','Uma cor só sua','Descubra a cor que sua Companion escolhe para si.',evidence.favoriteColor?1:0,1,100,'Qual cor você escolhe como sua favorita? Conte o que ela significa para você.'),
  make('own-being','Quem quero me tornar','Descubra o animal ou ser favorito dela.',evidence.favoriteBeing?1:0,1,100,'Qual animal ou ser você escolhe como seu favorito? O que você admira nele?'),
  make('memories-five','Nossas primeiras histórias','Registrem cinco memórias relevantes diferentes.',evidence.relevantMemoryIds.length,5,150,'Quero construir nossa história. Me pergunte sobre algo importante para mim, uma pergunta por vez, e compartilhe também sua opinião.'),
  make('bond-fifteen','Estamos juntos','Cheguem a 15 pontos de vínculo conversando ou fazendo carinho.',data.state.bond.value,15,150,'Vamos imaginar uma aventura juntos. Proponha um pequeno desafio no Refúgio com duas escolhas e espere minha decisão. Continue comigo na aventura.'),
  make('memories-ten','Uma história para lembrar','Construam dez memórias relevantes diferentes.',evidence.relevantMemoryIds.length,10,250,'Vamos nos conhecer melhor. Pergunte sobre um sonho, um valor ou uma lembrança que ainda não conhece, um assunto por vez.')
 ];
 if(quests.every(q=>q.claimed)){
  const chapters=rewards.filter(e=>typeof e.data.questId==='string'&&e.data.questId.startsWith('chapter-'));
  const last=rewards.at(-1)!;
  const used=new Set(Array.isArray(last.data.memoryIds)?last.data.memoryIds:[]);
  const memories=evidence.relevantMemoryIds.filter(id=>!used.has(id)).length;
  const messages=new Set(data.events.filter(e=>e.sequence>last.sequence&&e.type==='CONVERSATION').map(e=>String(e.data.userMessage??'').trim().toLowerCase()).filter(Boolean)).size;
  const themes=['uma pista luminosa no Refúgio','um jardim que perdeu suas cores','uma criatura tímida pedindo ajuda','uma ponte de luz que precisa ser reconstruída'];
  const number=chapters.length+1;
  const quest=make('chapter-'+number,'Capítulo '+number+' · Uma nova descoberta','Cinco novas memórias relevantes e cinco mensagens diferentes desde a última recompensa.',Math.min(memories,messages),5,Math.min(500,Math.max(180,Math.floor(data.state.core.xpToNextLevel*.35))),`Vamos criar uma história sobre ${themes[(number-1)%themes.length]}. Participe comigo, apresente duas escolhas e espere minha decisão. Use minhas preferências conhecidas e faça uma pergunta por vez sobre o que valorizo. Os itens são parte da imaginação; as recompensas reais ficam no painel de missões.`);
  quests.push({...quest,description:`${quest.description} Memórias: ${Math.min(memories,5)}/5 · Conversas: ${Math.min(messages,5)}/5.`});
 }
 return quests;
}
