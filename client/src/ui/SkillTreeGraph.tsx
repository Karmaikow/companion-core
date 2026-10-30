import type { SkillTree, Allocation, SkillDef } from '@rules';
import './skill-tree-graph.css';
const BRANCHES = ['essencia', 'classe', 'vinculo'] as const;
const COLORS = ['#6debb9', '#ffda79', '#cf9dff'];
export function SkillTreeGraph({tree, alloc, catalog, selected, onSelect, large}: {tree:SkillTree;alloc:Allocation;catalog:SkillDef[];selected:string|null;onSelect:(id:string)=>void;large?:boolean}) {
  const W = large ? 900 : 700, H = large ? 660 : 520;
  const BW = large ? 270 : 220, BX = large ? 165 : 115, RX = W / 2;
  const NY = large ? 580 : 400, NS = large ? 98 : 72, NR = large ? 29 : 23;
  const positions = new Map<string,{x:number;y:number;color:string}>();
  BRANCHES.forEach((branch,b) => tree.nodes.filter(n=>n.branch===branch).forEach((n,i) => positions.set(n.id,{x:BX+b*BW+(i%2 ? 34 : -18),y:NY-i*NS,color:COLORS[b]})));
  return <div className={'skill-constellation' + (large ? ' large' : '')}><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Árvore de essência, linhagem e vínculo">
    <circle cx={RX} cy={H-40} r={large ? 28 : 24} fill="#122333" stroke="#b8cfdd"/><text x={RX} y={H-33} textAnchor="middle" fill="white">✦</text>
    {BRANCHES.map((branch,b) => <text key={branch} x={BX+b*BW} y="38" textAnchor="middle" fill={COLORS[b]} fontSize={large ? 17 : 15} fontWeight="500">{tree.branches[branch].label}</text>)}
    {tree.nodes.map(n => {const to=positions.get(n.id)!;return (n.requires.length?n.requires:['root']).map(fromId=>{
      const from=positions.get(fromId)??{x:RX,y:H-40,color:to.color};
      return <path key={`${fromId}-${n.id}`} d={`M ${from.x} ${from.y} C ${from.x} ${(from.y+to.y)/2}, ${to.x} ${(from.y+to.y)/2}, ${to.x} ${to.y}`} fill="none" stroke={to.color} strokeOpacity={alloc[n.id] ? .9 : .22} strokeWidth={alloc[n.id]?3:1.5}/>;
    });})}
    {tree.nodes.map(n=>{const p=positions.get(n.id)!,skill=catalog.find(s=>s.slug===n.skill),rank=alloc[n.id]??0,sel=selected===n.id,r=sel?NR+5:NR,fs=large?22:20;
    return <g key={n.id} role="button" tabIndex={0} aria-label={`${n.name}, ${rank} de ${n.maxRank} pontos`} aria-pressed={sel} className="skill-graph-node" onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}}>
      <title>{n.name}</title>
      {sel && <circle cx={p.x} cy={p.y} r={r+6} fill="none" stroke={p.color} strokeWidth="1" strokeOpacity=".35" strokeDasharray="3 3"/>}
      <circle cx={p.x} cy={p.y} r={r} fill={rank?'#1e3d4a':'#0f1c30'} stroke={p.color} strokeWidth={sel?3.5:1.8} opacity={rank?1:.72}/>
      {rank > 0 && <circle cx={p.x} cy={p.y} r={r-3} fill="none" stroke={p.color} strokeWidth=".8" strokeOpacity=".3"/>}
      {skill?.iconUrl ? <image href={skill.iconUrl} x={p.x-r*0.55} y={p.y-r*0.55} width={r*1.1} height={r*1.1} preserveAspectRatio="xMidYMid meet"/> : <text x={p.x} y={p.y+fs*0.28} fill={p.color} textAnchor="middle" fontSize={fs}>{n.kind==='skill'?'✦':n.kind==='rank'?'▲':'◆'}</text>}
      <text x={p.x} y={p.y+r+13} fill={rank?'#d4eaf0':'#8a9fbc'} textAnchor="middle" fontSize={large?12:11} fontWeight={rank?'500':'400'}>{rank}/{n.maxRank}</text>
      {large && <text x={p.x} y={p.y-r-7} fill={sel?'#fff6e0':'#c8d6e8'} textAnchor="middle" fontSize="10.5">{n.name.length>16?n.name.slice(0,15)+'…':n.name}</text>}
    </g>;})}
  </svg>{!large && <p>Selecione um nó para consultar os requisitos e distribuir pontos.</p>}</div>;
}
