import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ItemDef, CreatureDef } from '@rules';
import {
  PAGES, buildCatalog, loadSnapshot, searchIndex, search, pretty, elLabel, elColor, fmt, skillName, creatureStatsAt,
  ITEM_TYPES, RARITIES, SPECIES, TIERS, TIER_UP, TIER_KEYS, WEAPON_TECHNIQUES, COMBO_FINISHERS, COMBO_LINKS, INFUSIONS, STYLE_RANKS,
  TECH_EVOLUTIONS, ELEMENT_SETS, SET_TIERS, REFINES, NODE_KINDS, DEFAULT_BIOME_RESOURCES, DEFAULT_WAR, GATES, GATE_IDS, GENERAL,
  WAR_TITLE, LAGRIMA, CRYSTAL_DRAIN, hordeSchedule, bossAtSec, ARCHETYPES, TEMPERAMENTS, TIMES, FAMILY_TIERS, ANALYSIS_TARGET,
  MOCHILA_CAPACITY, COMBO_WINDOW, COMBO_PERFECT_BONUS,
} from './data';
import type { PageId, Snapshot } from './data';

type Cat = { items: ItemDef[]; creatures: CreatureDef[] };

/** Rota: #/pagina ou #/pagina/ancora */
function useRoute(): [PageId, string, (page: PageId, anchor?: string) => void] {
  const read = (): [PageId, string] => {
    const [p, a] = location.hash.replace(/^#\/?/, '').split('/');
    return [(PAGES.some((x) => x.id === p) ? p : 'inicio') as PageId, a ?? ''];
  };
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => setR(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (page: PageId, anchor = '') => { location.hash = `#/${page}${anchor ? '/' + anchor : ''}`; };
  return [r[0], r[1], go];
}

const Chip = ({ children, color }: { children: ReactNode; color?: string }) => <span className="chip" style={color ? { borderColor: color, color } : undefined}>{children}</span>;
const Card = ({ id, title, sub, children, accent }: { id: string; title: string; sub?: ReactNode; children?: ReactNode; accent?: string }) => (
  <article className="card" id={id} style={accent ? { borderLeftColor: accent } : undefined}>
    <h3>{title}</h3>{sub && <div className="sub">{sub}</div>}{children}
  </article>
);
const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="tbl"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
);
const Section = ({ id, title, children }: { id?: string; title: string; children: ReactNode }) => <section id={id}><h2>{title}</h2>{children}</section>;
const statLine = (s: Partial<Record<string, number>>) => Object.entries(s).filter(([, v]) => v).map(([k, v]) => `${k} ${v! > 0 ? '+' : ''}${v}%`).join(' · ') || '—';

export function Wiki() {
  const [page, anchor, go] = useRoute();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { loadSnapshot().then(setSnap); }, []);
  const cat = useMemo<Cat>(() => buildCatalog(snap), [snap]);
  const index = useMemo(() => searchIndex(cat), [cat]);
  const hits = useMemo(() => search(index, q), [index, q]);

  useEffect(() => {
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    else window.scrollTo(0, 0);
  }, [page, anchor, cat]);
  useEffect(() => { document.title = `${PAGES.find((p) => p.id === page)?.label ?? 'Wiki'} · Wiki do Companion Core`; }, [page]);

  return (
    <div className="wiki">
      <header className="top">
        <a className="brand" href="#/inicio"><span className="brand-mark">✦</span> Wiki do Companion Core</a>
        <div className="search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item, monstro, técnica, recurso…" aria-label="Buscar na wiki" />
          {q.trim() && (
            <ul className="hits" role="listbox">
              {hits.length === 0 && <li className="none">Nada encontrado.</li>}
              {hits.map((h) => (
                <li key={h.id}><button onClick={() => { go(h.page, h.id); setQ(''); }}><b>{h.title}</b><span>{h.kind} · {PAGES.find((p) => p.id === h.page)?.label}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <a className="play" href="/">Jogar</a>
      </header>
      <nav className="tabs" aria-label="Seções">
        {PAGES.map((p) => <a key={p.id} href={`#/${p.id}`} className={p.id === page ? 'on' : ''} title={p.hint}>{p.label}</a>)}
      </nav>
      <main>
        {page === 'inicio' && <Inicio cat={cat} go={go} snap={snap} />}
        {page === 'itens' && <Itens items={cat.items} />}
        {page === 'monstros' && <Monstros creatures={cat.creatures} />}
        {page === 'classes' && <Classes />}
        {page === 'tecnicas' && <Tecnicas />}
        {page === 'coleta' && <Coleta />}
        {page === 'mecanicas' && <Mecanicas />}
        {page === 'guerra' && <Guerra />}
      </main>
      <footer>Os números vêm das regras do jogo{snap?.at ? ` e do catálogo publicado em ${snap.at}` : ''}. Valores de balanceamento podem mudar entre versões.</footer>
    </div>
  );
}

function Inicio({ cat, go, snap }: { cat: Cat; go: (p: PageId) => void; snap: Snapshot | null }) {
  return (
    <>
      <div className="hero">
        <h1>Bem-vinda à Wiki</h1>
        <p>O guia de <b>Áster, a Cidade-Farol</b> e dos arredores: o que cada item faz, como derrotar cada criatura, como as técnicas se encadeiam e como defender o cristal na Guerra de Áster.</p>
      </div>
      <div className="grid">
        {PAGES.filter((p) => p.id !== 'inicio').map((p) => (
          <button key={p.id} className="tile" onClick={() => go(p.id)}><b>{p.label}</b><span>{p.hint}</span></button>
        ))}
      </div>
      <Section title="Em números">
        <div className="stats">
          <div><b>{cat.items.length}</b><span>itens</span></div>
          <div><b>{cat.creatures.length}</b><span>criaturas</span></div>
          <div><b>{Object.keys(SPECIES).length}</b><span>classes</span></div>
          <div><b>{WEAPON_TECHNIQUES.length + COMBO_FINISHERS.length}</b><span>técnicas de arma</span></div>
          <div><b>{Object.keys(NODE_KINDS).length}</b><span>recursos</span></div>
        </div>
        {!snap && <p className="note">Mostrando os itens e criaturas padrão do jogo. O catálogo completo publicado entra aqui assim que a foto do servidor for gerada.</p>}
      </Section>
    </>
  );
}

const tierChip = (t?: number) => { const k = (t && t >= 1 && t <= 5 ? t : 1) as 1; return <Chip color={TIERS[k].color}>{TIERS[k].label}</Chip>; };

function Itens({ items }: { items: ItemDef[] }) {
  const [kind, setKind] = useState('todos');
  const kinds = useMemo(() => ['todos', ...Array.from(new Set(items.map((i) => i.type)))], [items]);
  const list = items.filter((i) => kind === 'todos' || i.type === kind);
  return (
    <>
      <h1>Itens</h1>
      <p className="lead">Armas e equipamentos do Arsenal. Cada peça tem um <b>tier</b> (T1 a T5), uma raridade e, às vezes, uma essência que infunde as técnicas da arma.</p>
      <Section title="Tiers">
        <Table head={['Tier', 'Material', 'Poder', 'Atributos', 'Vínculo mínimo', 'Subir de tier']} rows={TIER_KEYS.map((t) => [
          tierChip(t), TIERS[t].material, `×${fmt(TIERS[t].power)}`, `×${fmt(TIERS[t].stat)}`, String(TIERS[t].bond),
          t === 1 ? '—' : TIER_UP[t as 2].map((m) => `${m.qty}× ${pretty(m.material)}`).join(', '),
        ])} />
      </Section>
      <Section title="Catálogo">
        <div className="filters">{kinds.map((k) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{k === 'todos' ? 'Todos' : ITEM_TYPES[k as keyof typeof ITEM_TYPES]?.label ?? k}</button>)}</div>
        <div className="cards">
          {list.map((i) => {
            const t = ITEM_TYPES[i.type]; const w = t?.weapon;
            return (
              <Card key={i.slug} id={'item-' + i.slug} title={i.name} accent={RARITIES[i.rarity]?.color}
                sub={<><Chip>{t?.label}</Chip> <Chip color={RARITIES[i.rarity]?.color}>{RARITIES[i.rarity]?.label}</Chip> {tierChip(i.tier)} {i.essence && <Chip color={elColor(i.essence)}>{elLabel(i.essence)}</Chip>}</>}>
                <p>{i.description}</p>
                <dl>
                  <dt>Atributos</dt><dd>{statLine(i.stats)}</dd>
                  {w && <><dt>Golpe básico</dt><dd>alcance {fmt(w.range)} m · {fmt(w.cadence)} golpes/s · poder ×{fmt(w.power)}{w.twoHanded ? ' · duas mãos' : ''}</dd></>}
                  <dt>Peso</dt><dd>{fmt(Number.isFinite(i.weight) ? i.weight : t?.weight ?? 0)} kg</dd>
                  {i.recipe?.ingredients?.length > 0 && <><dt>Forja</dt><dd>{i.recipe.ingredients.map((g) => `${g.qty}× ${g.item}`).join(', ')}{i.recipe.minBond ? ` · vínculo ${i.recipe.minBond}` : ''}</dd></>}
                  {i.obtain && <><dt>Onde</dt><dd>{i.obtain}</dd></>}
                </dl>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Monstros({ creatures }: { creatures: CreatureDef[] }) {
  const groups = useMemo(() => {
    const fam = creatures.filter((c) => c.family);
    const free = creatures.filter((c) => !c.family);
    return { fam: [...fam].sort((a, b) => ['bebe', 'jovem', 'adulto', 'elite', 'chefe', 'mvp'].indexOf(a.family!.tier) - ['bebe', 'jovem', 'adulto', 'elite', 'chefe', 'mvp'].indexOf(b.family!.tier)), free };
  }, [creatures]);
  const card = (c: CreatureDef) => {
    const s = creatureStatsAt(c, c.level[0]);
    return (
      <Card key={c.slug} id={'mob-' + c.slug} title={c.name} accent={c.color}
        sub={<><Chip color={elColor(c.essence)}>{elLabel(c.essence)}</Chip> <Chip>nível {c.level[0]}{c.level[1] !== c.level[0] ? `–${c.level[1]}` : ''}</Chip> {c.family && <Chip>{FAMILY_TIERS[c.family.tier]?.label ?? c.family.tier}</Chip>}</>}>
        <p>{c.description}</p>
        <dl>
          <dt>Perfil</dt><dd>{ARCHETYPES[c.archetype]?.label} · {TEMPERAMENTS[c.temperament]?.label} · {TIMES[c.time]}</dd>
          <dt>No nível {c.level[0]}</dt><dd>vida {Math.round(s.vida)} · poder {Math.round(s.poder)} · defesa {Math.round(s.defesa)} · agilidade {Math.round(s.agilidade)}</dd>
          <dt>Habilidades</dt><dd>{c.skills.map((k) => pretty(k.slug)).join(', ') || '—'}</dd>
          <dt>Drops</dt><dd>{c.drops.map((d) => `${d.item} (${Math.round(d.chance * 100)}%)`).join(', ') || '—'}</dd>
          {c.lumes[1] > 0 && <><dt>Lumes</dt><dd>{c.lumes[0]}–{c.lumes[1]}</dd></>}
        </dl>
      </Card>
    );
  };
  return (
    <>
      <h1>Bestiário</h1>
      <p className="lead">Analise uma criatura derrotando-a (<b>{ANALYSIS_TARGET}</b> partículas) para abrir o dossiê dela no jogo. Aqui está o resumo de cada uma.</p>
      <Section title="Criaturas dos campos"><div className="cards">{groups.free.map(card)}</div></Section>
      {groups.fam.length > 0 && <Section title="Distorcidos · Linhagem do Cristal Rachado">
        <p className="lead">Lascas do Cristal Ápice que caíram longe da cidade. Quanto mais crescem, mais querem voltar. Quando a Fúria deles enche, vem a <a href="#/guerra">Guerra de Áster</a>.</p>
        <div className="cards">{groups.fam.map(card)}</div>
      </Section>}
    </>
  );
}

function Classes() {
  return (
    <>
      <h1>Classes</h1>
      <p className="lead">Cada Companion pertence a uma linhagem. A classe muda a velocidade, os atributos de partida e a afinidade com as essências (−10% de SP nas habilidades delas).</p>
      <div className="cards">
        {Object.values(SPECIES).map((s) => (
          <Card key={s.key} id={'classe-' + s.key} title={s.label} sub={<><Chip>{s.vocation}</Chip> {s.affinities.map((e) => <Chip key={e} color={elColor(e)}>{elLabel(e)}</Chip>)}</>}>
            <p>{s.lineage}.</p>
            <dl>
              <dt>Traços</dt><dd>{s.featuresPt}</dd>
              <dt>Tendência</dt><dd>{Object.entries(s.attrs).map(([k, v]) => `${k} ${v! > 0 ? '+' : ''}${v}`).join(' · ') || '—'}</dd>
              <dt>Velocidade</dt><dd>×{fmt(s.speed)}</dd>
              {s.craft && <><dt>Ofício</dt><dd>{s.craft.label}: {s.craft.hint}</dd></>}
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}

function Tecnicas() {
  const kinds = Array.from(new Set(WEAPON_TECHNIQUES.map((t) => t.weapon).filter(Boolean))) as string[];
  return (
    <>
      <h1>Técnicas e combos</h1>
      <p className="lead">A <b>arma dá o golpe</b> e a <b>essência infunde</b> o efeito. Encadeie técnicas no ritmo para soltar <b>finalizadores</b> e suba o <b>Estilo</b>.</p>
      <Section title="Essências (infusão)">
        <Table head={['Essência', 'Efeito', 'Estado']} rows={Object.entries(INFUSIONS).map(([e, f]) => [
          <Chip key={e} color={elColor(e)}>{elLabel(e)}</Chip>, f.text, f.status ? `${Math.round(f.status.chance * 100)}% · ${fmt(f.status.seconds)} s` : '—',
        ])} />
      </Section>
      {kinds.map((k) => (
        <Section key={k} title={`Técnicas de ${ITEM_TYPES[k as keyof typeof ITEM_TYPES]?.label ?? k}`}>
          <div className="cards">
            {WEAPON_TECHNIQUES.filter((t) => t.weapon === k).map((t) => {
              const evo = TECH_EVOLUTIONS[t.slug];
              return (
                <Card key={t.slug} id={'tec-' + t.slug} title={t.name} sub={<><Chip>poder {t.power}</Chip> <Chip>{t.energy} SP</Chip> <Chip>recarga {fmt(t.cooldown)} s</Chip> {t.unlockBond ? <Chip>vínculo {t.unlockBond}</Chip> : null}</>}>
                  <p>{t.description}</p>
                  {evo && <dl><dt>Evolução T3</dt><dd>{evo.map((p) => `${p.label}: ${p.t3.name}`).join(' ou ')}</dd><dt>Evolução T5</dt><dd>{evo.map((p) => p.t5.name).join(' / ')}</dd></dl>}
                </Card>
              );
            })}
          </div>
        </Section>
      ))}
      <Section title="Finalizadores">
        <p className="lead">Aperte a técnica seguinte dentro da janela de tempo e a ligação vira um finalizador. Acertar no <b>meio da janela</b> (perfeito) dá ×{fmt(COMBO_PERFECT_BONUS)} de dano.</p>
        <div className="cards">
          {COMBO_FINISHERS.map((f) => {
            const l = COMBO_LINKS.find((x) => x.becomes === f.slug);
            return (
              <Card key={f.slug} id={'tec-' + f.slug} title={f.name} sub={<><Chip>poder {f.power}</Chip> {l && <Chip>{skillName(l.from)} → {skillName(l.press)}{l.basics ? ` (${l.basics} golpes básicos)` : ''}</Chip>}</>}>
                <p>{f.description}</p>
              </Card>
            );
          })}
        </div>
      </Section>
      <Section id="mec-estilo" title="Estilo (D a S)">
        <p className="lead">Cada acerto enche o medidor; ficar sem golpear ou apanhar o esvazia. Quanto maior a letra, mais dano e mais SP recuperado.</p>
        <Table head={['Letra', 'Nome', 'Pontos', 'Dano', 'SP']} rows={STYLE_RANKS.map((r) => [<Chip key={r.letter} color={r.color}>{r.letter}</Chip>, r.label, String(r.min), `×${fmt(r.damage)}`, `×${fmt(r.sp)}`])} />
        <p className="note">Janela do ritmo: abre em {fmt(COMBO_WINDOW.open)} s, perfeita de {fmt(COMBO_WINDOW.perfectFrom)} a {fmt(COMBO_WINDOW.perfectTo)} s, fecha em {fmt(COMBO_WINDOW.close)} s depois do golpe.</p>
      </Section>
    </>
  );
}

function Coleta() {
  return (
    <>
      <h1>Coleta</h1>
      <p className="lead">Cada fonte oferece <b>abordagens</b>: uma mais gentil (preserva a fonte), outra mais rápida (rende mais, esgota por um tempo). Ferramentas abrem as melhores.</p>
      <Section title="Recursos">
        <div className="cards">
          {Object.values(NODE_KINDS).map((k) => {
            const dens = DEFAULT_BIOME_RESOURCES.find((r) => r.kind === k.kind);
            return (
              <Card key={k.kind} id={'rec-' + k.kind} title={k.name} sub={<><Chip>{pretty(k.category)}</Chip> <Chip>{pretty(k.zone)}</Chip> {dens?.unlock && <Chip>missão</Chip>}</>}>
                <p>{k.sign}</p>
                <dl>
                  <dt>Capacidade</dt><dd>{k.capacity} · recupera {k.regenPerHour}/h</dd>
                  {dens && <><dt>Quando</dt><dd>{dens.time === 'sempre' ? 'sempre' : dens.time === 'dia' ? 'de dia' : 'de noite'}{dens.weather.length ? ` · ${dens.weather.join(', ')}` : ''}</dd></>}
                </dl>
                <ul className="ap">{k.approaches.map((a) => (
                  <li key={a.id}><b>{a.label}</b> · {a.seconds} s{a.tool ? ` · ${a.tool}` : ''} → {a.yields.map((y) => `${y.qty[0]}${y.qty[1] !== y.qty[0] ? `–${y.qty[1]}` : ''}× ${pretty(y.material)}`).join(', ')}<small>{a.effect}</small></li>
                ))}</ul>
              </Card>
            );
          })}
        </div>
      </Section>
      <Section title="Refino">
        <p className="lead">Materiais brutos viram materiais refinados na bancada; a qualidade do refinado herda a do que entrou.</p>
        <Table head={['Refinado', 'Feito de']} rows={REFINES.map((r) => [<span id={'refino-' + r.id} key={r.id}>{pretty(r.id)}</span>, r.label])} />
      </Section>
    </>
  );
}

function Mecanicas() {
  return (
    <>
      <h1>Mecânicas</h1>
      <Section id="mec-tiers" title="Tiers (T1 a T5)">
        <p className="lead">Cada peça tem um tier. Tiers maiores dão mais poder e atributos, mas exigem vínculo. Nos tiers <b>T3</b> e <b>T5</b> as técnicas da arma <b>evoluem</b> (no T3 há dois caminhos para escolher).</p>
        <Table head={['Tier', 'Material', 'Poder', 'Vínculo']} rows={TIER_KEYS.map((t) => [tierChip(t), TIERS[t].material, `×${fmt(TIERS[t].power)}`, String(TIERS[t].bond)])} />
      </Section>
      <Section id="mec-carga" title="Carga e peso">
        <p className="lead">Tudo pesa. A mochila básica carrega <b>{MOCHILA_CAPACITY}</b> de peso, e o vínculo e a força aumentam o limite. Passando do limite você fica <b>pesado</b> (anda e golpeia mais devagar) e depois <b>sobrecarregado</b>.</p>
      </Section>
      <Section id="mec-conjuntos" title="Conjuntos de essência">
        <p className="lead">Vestir peças da mesma essência ativa bônus: {SET_TIERS.map((s) => `${s.pieces} peças (×${fmt(s.mul)})`).join(', ')}.</p>
        <Table head={['Conjunto', 'Bônus', 'Efeito']} rows={Object.entries(ELEMENT_SETS).map(([e, s]) => [<Chip key={e} color={elColor(e)}>{s.label}</Chip>, statLine(Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, v]))).replace(/%/g, ''), s.note])} />
      </Section>
      <Section id="mec-analise" title="Análise de criaturas">
        <p className="lead">Cada criatura derrotada deixa partículas; com {ANALYSIS_TARGET} delas o dossiê abre e mostra atributos, habilidades e o que ela solta.</p>
      </Section>
    </>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Guerra() {
  const cfg = DEFAULT_WAR;
  const hordes = hordeSchedule(cfg);
  const rows: [string, string][] = [
    ['Fúria a 100% ou o Administrador liga', `Anúncio para todo o servidor e contagem regressiva. O alistamento abre (${cfg.enlistMin} min quando é pela Fúria).`],
    ['0:00', `A cidade e os arredores fecham. Os alistados vão aos portões (no mínimo ${cfg.minPerGate} por portão; heróis NPC completam). Quem ficou na cidade sem alistar sente medo e vai para o Refúgio.`],
    ...hordes.map((t, i): [string, string] => [mmss(t), `Horda ${i + 1} nos quatro cantos dos arredores.`]),
    [mmss(bossAtSec(cfg)), 'O chefe general entra pelo portão sul.'],
    [mmss(cfg.durationMin * 60), 'Fim: vitória (cristal de pé) ou derrota (cristal destruído).'],
  ];
  return (
    <>
      <h1>Guerra de Áster</h1>
      <p className="lead">Quando os Distorcidos se enfurecem, uma guerra de <b>{cfg.durationMin} minutos</b> começa. O servidor inteiro defende a cidade e o cristal sagrado guardado pela fada rainha Cibel.</p>
      <Section id="guerra-fury" title="Como a guerra começa">
        <ul className="plain">
          <li><b>Fúria dos Distorcidos:</b> enche com os abates de todo o servidor. Com {cfg.killTrigger.toLocaleString('pt-BR')} abates, a guerra é anunciada. O número pode ser ajustado e todos veem o progresso.</li>
          <li><b>Administrador:</b> também pode marcar uma guerra ("em 20 minutos", "em 2 dias"), adiar ou cancelar.</li>
          <li>Entre uma guerra e outra há um intervalo mínimo de {cfg.minGapHours} horas.</li>
        </ul>
      </Section>
      <Section id="guerra-tempo" title="Linha do tempo">
        <Table head={['Momento', 'O que acontece']} rows={rows} />
      </Section>
      <Section id="guerra-defesa" title="Como se defende">
        <ul className="plain">
          <li><b>Alistamento:</b> alistar-se antes garante uma vaga num portão. Quem chega depois entra como reforço no portão mais vazio.</li>
          <li><b>Portões:</b> {GATE_IDS.map((g) => GATES[g].label).join(', ')}. Cada um tem vida; se cair, os monstros avançam para o cristal.</li>
          <li><b>Cristal:</b> perde {CRYSTAL_DRAIN} de vida por segundo para cada monstro dentro. <b>Derrota</b> quando chega a zero; <b>vitória</b> se estiver de pé no fim.</li>
          <li><b>Chefe general:</b> tem {GENERAL.hpMul}× a vida, {GENERAL.atkMul}× o ataque e {GENERAL.defMul}× a defesa, e dá {GENERAL.xpMul}× mais XP. Derrotá-lo dá vitória gloriosa.</li>
          <li>Os guardas, heróis e torres seguram o avanço. A força das hordas cresce com o número de alistados.</li>
        </ul>
      </Section>
      <Section id="guerra-premios" title="Recompensas">
        <ul className="plain">
          <li><b>Vitória:</b> +{cfg.victory.dropPct}% de drops e +{cfg.victory.xpPct}% de XP para o servidor por {cfg.victory.minutes} min.</li>
          <li><b>Vitória gloriosa:</b> +{cfg.glorious.dropPct}% e +{cfg.glorious.xpPct}% por {cfg.glorious.minutes} min.</li>
          <li><b>Placar de dano:</b> o 1º lugar ganha o título <b>{WAR_TITLE.label}</b> (+{WAR_TITLE.buff.dmgPct}% de dano e +{WAR_TITLE.buff.xpPct}% de XP).</li>
          <li>Um MVP aparece em algum canto do mundo e baús especiais surgem no Labirinto.</li>
          <li>Para ganhar prêmios é preciso estar alistado e causar pelo menos {cfg.minDamage} de dano.</li>
        </ul>
      </Section>
      <Section id="guerra-derrota" title="Se a cidade cai">
        <p className="lead">A cidade fica destruída: lojas e comércios fecham, escolas e NPCs não entregam missões especiais e o servidor inteiro reconstrói entregando materiais e itens à guardiã Cibel. Quem mais entregar ganha um título e <b>{LAGRIMA.label}</b>, que dura {LAGRIMA.days} dias (+{LAGRIMA.buff.dmgPct}% de dano, +{LAGRIMA.buff.defPct}% de defesa, +{LAGRIMA.buff.xpPct}% de XP).</p>
      </Section>
    </>
  );
}
