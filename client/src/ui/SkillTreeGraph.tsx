import type { SkillTree, Allocation, SkillDef } from '@rules';
import './skill-tree-graph.css';
const BRANCHES = ['essencia', 'classe', 'vinculo'] as const;
const COLORS = ['#6debb9', '#ffda79', '#cf9dff'];
export function SkillTreeGraph({tree, alloc, catalog, selected, onSelect}: {tree:SkillTree;alloc:Allocation;catalog:SkillDef[];selected:string|null;onSelect:(id:string)=>void}) {
  const positions = new Map<string,{x:number;y:number;color:string}>();
  BRANCHES.forEach((branch,b) => tree.nodes.filter(n=>n.branch===branch).forEach((n,i) => positions.set(n.id,{x:115+b*220+(i%2 ? 30 : -15),y:400-i*72,color:COLORS[b]})));
  return <div className="skill-constellation"><svg viewBox="0 0 700 520" role="group" aria-label="Árvore de essência, linhagem e vínculo">
    <circle cx="350" cy="480" r="24" fill="#122333" stroke="#b8cfdd"/><text x="350" y="486" textAnchor="middle" fill="white">✦</text>
    {BRANCHES.map((branch,b) => <text key={branch} x={115+b*220} y="36" textAnchor="middle" fill={COLORS[b]} fontSize="15">{tree.branches[branch].label}</text>)}
    {tree.nodes.map(n => {const to=positions.get(n.id)!;return (n.requires.length?n.requires:['root']).map(fromId=>{
      const from=positions.get(fromId)??{x:350,y:480,color:to.color};
      return <path key={`${fromId}-${n.id}`} d={`M ${from.x} ${from.y} C ${from.x} ${(from.y+to.y)/2}, ${to.x} ${(from.y+to.y)/2}, ${to.x} ${to.y}`} fill="none" stroke={to.color} strokeOpacity={alloc[n.id] ? .9 : .22} strokeWidth={alloc[n.id]?3:1.5}/>;
    });})}
    {tree.nodes.map(n=>{const p=positions.get(n.id)!,skill=catalog.find(s=>s.slug===n.skill),rank=alloc[n.id]??0;return <g key={n.id} role="button" tabIndex={0} aria-label={`${n.name}, ${rank} de ${n.maxRank} pontos`} aria-pressed={selected===n.id} className="skill-graph-node" onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}}>
      <title>{n.name}</title><circle cx={p.x} cy={p.y} r={selected===n.id?27:23} fill={rank?'#233d43':'#111c2e'} stroke={p.color} strokeWidth={selected===n.id?4:2} opacity={rank?1:.75}/>
      {skill?.iconUrl ? <image href={skill.iconUrl} x={p.x-16} y={p.y-16} width="32" height="32" preserveAspectRatio="xMidYMid meet"/> : <text x={p.x} y={p.y+6} fill={p.color} textAnchor="middle" fontSize="20">{n.kind==='skill'?'✦':n.kind==='rank'?'▲':'◆'}</text>}
      <text x={p.x} y={p.y+39} fill="#dbe6ec" textAnchor="middle" fontSize="11">{rank}/{n.maxRank}</text>
    </g>;})}
  </svg><p>Selecione um nó para consultar os requisitos e distribuir pontos.</p></div>;
}
