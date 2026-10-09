/** Narrative character seeds, not a psychological assessment. */
export const CREATION_GROUPS = [
  { id: 'openness', title: 'Horizonte · abertura', options: ['Curiosa','Criativa','Aventureira','Contemplativa'] },
  { id: 'conscientiousness', title: 'Propósito · disciplina', options: ['Organizada','Persistente','Responsável','Espontânea'] },
  { id: 'extraversion', title: 'Presença · energia', options: ['Sociável','Brincalhona','Reservada','Independente'] },
  { id: 'agreeableness', title: 'Vínculo · afeto', options: ['Gentil','Empática','Protetora','Franca'] },
  { id: 'stability', title: 'Maré interior · emoções', options: ['Serena','Paciente','Sensível','Intensa'] },
  { id: 'temperament', title: 'Chama · temperamento', options: ['Sanguínea','Colérica','Melancólica','Fleumática'] },
  { id: 'energy', title: 'Fonte de energia', options: ['Extrovertida','Introvertida'] },
  { id: 'perception', title: 'Olhar sobre o mundo', options: ['Sensorial','Intuitiva'] },
  { id: 'decision', title: 'Bússola das decisões', options: ['Racional','Sentimental'] },
  { id: 'rhythm', title: 'Ritmo da jornada', options: ['Planejadora','Exploradora'] }
].map(group => ({ ...group, options: group.options.map((label,index) => ({ id: `${group.id}-${index}`, label })) }));
export const CREATION_COLORS = [
 {hex:'#3f8cff',name:'Azul-safira'}, {hex:'#64834b',name:'Verde-musgo'},
 {hex:'#bf6cff',name:'Ametista'}, {hex:'#ff694d',name:'Rubi flamejante'},
 {hex:'#edbd54',name:'Ouro solar'}, {hex:'#42d9bd',name:'Jade astral'}, {hex:'#ee83b4',name:'Rosa aurora'}
];
export function creationSeed(ids: unknown) {
 if (!Array.isArray(ids) || ids.length < 1 || ids.length > 24 || ids.some(id=>typeof id!=='string') || new Set(ids).size!==ids.length) throw Error('Escolha de 1 a 24 traços distintos.');
 const all=CREATION_GROUPS.flatMap(g=>g.options);
 if(ids.some(id=>!all.some(o=>o.id===id))) throw Error('Traço de personalidade inválido.');
 for(const group of CREATION_GROUPS.slice(5)) if(group.options.filter(o=>ids.includes(o.id)).length>1) throw Error('Escolha apenas uma opção em cada eixo e temperamento.');
 const labels=all.filter(o=>ids.includes(o.id)).map(o=>o.label);
 const score=(group:string,positive:number[])=>Math.max(0,Math.min(100,50+CREATION_GROUPS.find(g=>g.id===group)!.options.reduce((n,o,i)=>n+(ids.includes(o.id)?positive[i]:0),0)));
 const bigFive={openness:score('openness',[18,18,15,8]),conscientiousness:score('conscientiousness',[18,18,15,-12]),extraversion:score('extraversion',[20,15,-20,-10]),agreeableness:score('agreeableness',[15,20,12,-8]),emotionalStability:score('stability',[20,15,-10,-15])};
 const has=(label:string)=>labels.includes(label);
 const personality={loyalty:has('Protetora')?85:75,curiosity:bigFive.openness,humor:has('Brincalhona')||has('Sanguínea')?82:50,courage:has('Aventureira')||has('Colérica')?82:55,empathy:bigFive.agreeableness,autonomy:has('Independente')?80:50};
 const influences=labels.filter(x=>['Criativa','Aventureira','Contemplativa','Protetora','Serena','Intensa','Exploradora'].includes(x));
 return {traits:ids as string[],labels,bigFive,personality,formInfluences:influences};
}
