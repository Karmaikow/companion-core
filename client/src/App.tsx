import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES, ELEMENTS, derivePalette, refugeFeatures, animKind, sanitizeBiome, sanitizeCreature, makeCompanionWorld, characterSheet, speciesSpeed, sanitizeItem, validateEquipped, equipmentBonus, ITEM_TYPES, sanitizeWeather, weatherAt, WEATHERS, DEFAULT_WEATHER, DEFAULT_BIOME_WEATHER, type ItemDef, type WeatherConfig, WORLD_SEED, REFUGE_BIOME, WORLD_FALLBACK_BIOMES, DEFAULT_CREATURES, type BiomeConfig, type CreatureDef, type WorldSite } from '@rules';
import { Refuge } from './scene/Refuge';
import { WorldScene } from './scene/World';
import { WorldMap } from './ui/WorldMap';
import { stableSeed } from './scene/world';
import { useGame, type Tab } from './store';
import { Icon } from './ui/icons';
import { ChatPanel, MemoriesPanel, DiaryPanel, QuestsPanel, InventoryPanel, RecipesPanel, BondPanel } from './ui/Panels';
import { Celebration, AwakenCall } from './ui/Celebration';
import { Entry } from './ui/Entry';
import { Creation } from './ui/Creation';
import { SkillTreePanel } from './ui/SkillTreePanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { speak } from './ui/voice';
import { FloatingConversation } from './ui/FloatingConversation';
import { LocationHud, QuestTracker, BondTrack } from './ui/GameHud';
import { AttributesPanel } from './ui/AttributesPanel';
import { HudGlyph } from './ui/HudGlyph';
import { brain } from './scene/brain';
import { SkillBar } from './ui/SkillBar';
import { VitalsBars, TouchMoves, FaintCounter } from './ui/VitalsHud';
import { useSkillSync } from './ui/skillState';
import { pressAttack, releaseAttack } from './scene/Combat';
import { ownsItem } from './ui/EquipmentPanel';
import { WeatherOverlay } from './ui/WeatherOverlay';
import { supabase } from './backend/online';

const TABS: { key: Tab; label: string }[] = [
  { key: 'attributes', label: 'Atributos' },
  { key: 'chat', label: 'Histórico de conversa' },
  { key: 'memories', label: 'Memórias' },
  { key: 'diary', label: 'Diário' },
  { key: 'quests', label: 'Quests' },
  { key: 'inventory', label: 'Inventário' },
  { key: 'recipes', label: 'Receitas' },
  { key: 'skills', label: 'Habilidades' },
  { key: 'bond', label: 'Vínculo' },
  { key: 'settings', label: 'Ajustes' },
];

function quality(): 'high' | 'low' {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const mobile = matchMedia('(pointer: coarse)').matches;
  return mobile && (navigator.hardwareConcurrency ?? 8) <= 6 ? 'low' : 'high';
}

export function App() {
  const { backend, snap, tab, setTab, run, error, toasts, lastReply, pulse, burst, busy, setBackend } = useGame();
  const [bubble, setBubble] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => setMinimized(false), [tab]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) setTab(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setTab]);

  useEffect(() => {
    if (!backend) return;
    // Sem Companion ainda: o ritual de criação aparece (não cria automaticamente).
    void run((b) => b.state());
  }, [backend, run]);

  useEffect(() => {
    if (!lastReply) return;
    setBubble(lastReply);
    speak(lastReply);
    const t = setTimeout(() => setBubble(null), Math.max(5000, lastReply.length * 70));
    return () => clearTimeout(t);
  }, [lastReply]);
  // falas curtas no jogo (ao ver monstros, lutando, ordens): balão rápido e voz, se ligada
  const barkMsg = useGame((s) => s.bark);
  useEffect(() => {
    if (!barkMsg) return;
    setBubble(barkMsg.text);
    speak(barkMsg.text);
    const t = setTimeout(() => setBubble((b) => (b === barkMsg.text ? null : b)), Math.max(2600, barkMsg.text.length * 75));
    return () => clearTimeout(t);
  }, [barkMsg]);
  // Silêncio: depois de um tempo sem a pessoa responder, o Companion puxa assunto (online, até 3 vezes por sessão).
  const muses = useRef(0);
  const lastEvent = snap?.timeline?.[snap.timeline.length - 1];
  useEffect(() => {
    if (!backend?.muse || busy || muses.current >= 3 || !lastEvent || lastEvent.kind !== 'chat.companion' || lastEvent.payload.muse) return;
    const t = setTimeout(() => {
      if (document.hidden) return;
      muses.current++;
      void run((b) => b.muse!());
    }, 80_000);
    return () => clearTimeout(t);
  }, [backend, busy, lastEvent, run]);

  async function leave() {
    if (!backend) return;
    const guest = backend.kind === 'online' && (await supabase().auth.getUser()).data.user?.is_anonymous;
    const text = guest
      ? 'Você está jogando como convidado. Se sair, não será possível voltar a este Companion. Sair mesmo assim?'
      : 'Sair do Refúgio? Seu progresso continua salvo.';
    if (!confirm(text)) return;
    await backend.signOut?.();
    setBackend(null);
  }

  const c = snap?.companion;
  const d = c?.discoveries ?? {};
  const visual = useMemo(() => {
    const p = d.color ? derivePalette(d.color, d.element ?? null) : null;
    return { color: p?.primary ?? '#9fc9ff', glow: p?.glow ?? (d.element ? ELEMENTS[d.element].glow : '#ffffff') };
  }, [d.color, d.element]);
  const energy = c ? Math.min(1, (c.bond.level - 1) / 6 + c.bond.ratio / 6) : 0;
  const features = useMemo(
    () => refugeFeatures(d, snap?.quests ?? [], c?.bond.level ?? 1, { recipes: snap?.recipes?.length ?? 0, diary: snap?.diary?.length ?? 0 }),
    [d, snap?.quests, c?.bond.level, snap?.recipes?.length, snap?.diary?.length],
  );

  const seed = useMemo(() => stableSeed(c?.id ?? 'refugio'), [c?.id]);
  // Bioma do Refúgio: o próprio do Companion (escolhido na Fábrica) → o "refugio" publicado no Estúdio → o de fábrica.
  // O Companion World usa todos os biomas publicados com "aparece no mundo" (sem eles, as regiões de reserva).
  const [biome, setBiome] = useState<BiomeConfig | undefined>();
  const [worldBiomes, setWorldBiomes] = useState<BiomeConfig[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = supabase();
        const own = c?.id && backend?.kind === 'online' ? (await sb.from('companion_biomes').select('biome_slug').eq('companion_id', c.id).maybeSingle()).data?.biome_slug : null;
        const { data } = await sb.from('biomes').select('slug,name,description,palette,settings,assets,status').eq('status', 'published');
        if (!alive || !data) return;
        const all = data.map(sanitizeBiome);
        setBiome(all.find((b) => b.slug === own) ?? all.find((b) => b.slug === 'refugio'));
        setWorldBiomes(all.filter((b) => b.settings.world || b.slug === 'refugio')); // o refugio é a região do portal
      } catch { /* sem rede: fica o de fábrica */ }
    })();
    return () => { alive = false; };
  }, [c?.id, backend?.kind]);

  // Teste: ?modelo=corpo.glb,andando.glb mostra um modelo 3D no Refúgio sem passar pela Fábrica (o 1º arquivo é o corpo).
  const testModel = useMemo(() => {
    const list = new URLSearchParams(location.search).get('modelo')?.split(',').map((u) => u.trim()).filter(Boolean);
    return list?.length ? { url: list[0], anims: list.map((u) => ({ url: u, kind: animKind(u) ?? 'special', name: u })) } : undefined;
  }, []);

  // ---- Companion World: o mundo aberto além da passagem na muralha
  const model = testModel ?? snap?.visualJob?.model;
  const testWorld = useMemo(() => new URLSearchParams(location.search).has('mundo'), []);
  const passage = features.window || testWorld;
  const [place, setPlace] = useState<'refuge' | 'world'>('refuge');
  const [explore, setExplore] = useState(false);
  const [regionName, setRegionName] = useState<string | null>(null);
  const toast = useGame((s) => s.toast);
  const companionWorld = useMemo(() => {
    // regiões: os biomas publicados com "aparece no mundo"; com poucos, entram as regiões de reserva
    const list: BiomeConfig[] = [];
    const add = (b: BiomeConfig) => { if (!list.some((x) => x.slug === b.slug)) list.push(b); };
    add(worldBiomes.find((b) => b.slug === 'refugio') ?? REFUGE_BIOME);
    worldBiomes.forEach(add);
    if (list.length < 3) WORLD_FALLBACK_BIOMES.slice(1).forEach(add);
    return makeCompanionWorld(WORLD_SEED, list);
  }, [worldBiomes]);
  // criaturas do Invocador (publicadas); sem nenhuma, as de reserva
  const [creatures, setCreatures] = useState<CreatureDef[]>(DEFAULT_CREATURES);
  useEffect(() => { brain.defs = creatures; brain.creatures = creatures.map((c) => ({ slug: c.slug, name: c.name })); }, [creatures]);
  useEffect(() => {
    if (place !== 'world') return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase().from('creatures').select('slug,name,data').eq('status', 'published');
        const list = (data ?? []).map((r) => sanitizeCreature({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is CreatureDef => !!x);
        if (alive && list.length) setCreatures(list);
      } catch { /* sem rede: as de reserva */ }
    })();
    return () => { alive = false; };
  }, [place]);
  const discKey = 'companion-core:world-found:' + (c?.id ?? 'teste');
  const [discovered, setDiscovered] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setDiscovered(new Set(JSON.parse(localStorage.getItem(discKey) ?? '[]'))); } catch { setDiscovered(new Set()); }
  }, [discKey]);
  const discover = (s: WorldSite) => {
    setDiscovered((prev) => {
      if (prev.has(s.name)) return prev;
      const next = new Set(prev).add(s.name);
      try { localStorage.setItem(discKey, JSON.stringify([...next])); } catch { /* só nesta sessão */ }
      return next;
    });
    useGame.getState().celebrate({ kind: 'quest', eyebrow: 'Lugar descoberto', title: s.name, subtitle: companionWorld.biomes[s.biome].name });
  };
  // ---- clima: config do ADM (game_config.values.weather) × peso do bioma onde o Companion está
  const [weatherCfg, setWeatherCfg] = useState<WeatherConfig>(DEFAULT_WEATHER);
  const [regionBiome, setRegionBiome] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const load = () => supabase().from('game_config').select('values').eq('id', 1).maybeSingle().then(({ data }) => { const w = (data?.values as { weather?: unknown } | null)?.weather; if (w) setWeatherCfg(sanitizeWeather(w)); }, () => {});
    load();
    const t = setInterval(() => { setClock(Date.now()); load(); }, 30_000);
    return () => clearInterval(t);
  }, []);
  const weather = useMemo(() => {
    const test = new URLSearchParams(location.search).get('clima');
    if (test && test in WEATHERS) return { kind: test as keyof typeof WEATHERS, intensity: 0.9 };
    const here = place === 'world' ? companionWorld.biomes.find((b) => b.slug === regionBiome) : biome;
    const w = weatherAt(weatherCfg, clock, (place === 'world' ? 'mundo:' : 'refugio:') + (here?.slug ?? 'refugio'), here?.settings.weather ?? DEFAULT_BIOME_WEATHER);
    return { kind: w.kind, intensity: w.intensity };
  }, [weatherCfg, clock, place, regionBiome, companionWorld, biome]);

  const enterRegion = (s: WorldSite) => {
    setRegionBiome(companionWorld.biomes[s.biome].slug);
    const label = s.home ? 'Portal do Refúgio' : companionWorld.biomes[s.biome].name;
    setRegionName(label);
  };
  useEffect(() => { if (!regionName) return; const t = setTimeout(() => setRegionName(null), 3200); return () => clearTimeout(t); }, [regionName]);
  const goWorld = () => { setPlace('world'); setExplore(false); };
  const goHome = () => { setPlace('refuge'); setExplore(false); toast('De volta ao Refúgio.', 'soft'); };

  useSkillSync();

  // Cauda e asas desenhadas por código: desligadas no jogo (ficavam fora do modelo; só o modelo 3D por enquanto).
  // O código fica para uma versão futura (ex.: cauda no próprio rig). Teste: ?cauda=scaly|fluffy|tuft|feather|wisp&asas=feather|dragon|fairy
  const appendages = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const contract = c?.identityContract;
    const qt = q.get('cauda'), qw = q.get('asas');
    const tail = (qt && ['scaly', 'fluffy', 'tuft', 'feather', 'wisp'].includes(qt) ? qt : null) as never;
    const wings = (qw && ['feather', 'dragon', 'fairy'].includes(qw) ? qw : null) as never;
    if (!tail && !wings) return null;
    const pal = contract?.palette ?? { primary: visual.color, secondary: visual.color, accent: '#9e6bc7', glow: visual.glow };
    return { tail, wings, palette: { primary: pal.primary, secondary: pal.secondary, accent: pal.accent, glow: pal.glow } };
  }, [c?.identityContract, visual.color, visual.glow]);

  // ---- armas e equipamentos: arsenal publicado (ou o inicial) + o que está equipado
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  useEffect(() => {
    supabase().from('items').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeItem({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is ItemDef => !!x);
      if (list.length) useGame.getState().setItems(list);
    }, () => {});
  }, []);
  useEffect(() => {
    if (!c?.id) return;
    let alive = true;
    (async () => {
      let raw = {};
      try {
        if (backend?.kind === 'online') raw = (await supabase().from('companion_equipment').select('equipped').eq('companion_id', c.id).maybeSingle()).data?.equipped ?? {};
        else raw = JSON.parse(localStorage.getItem('companion-core:equipped:' + c.id) ?? '{}');
      } catch { /* vazio */ }
      if (alive) useGame.getState().setEquipped(validateEquipped(raw, useGame.getState().items, ownsItem));
    })();
    return () => { alive = false; };
  }, [c?.id, backend?.kind, items]);
  const gear = useMemo(() => {
    const list = Object.values(equipped).map((slug) => items.find((i) => i.slug === slug)).filter((x): x is ItemDef => !!x);
    const weapon = list.find((i) => ITEM_TYPES[i.type].slot === 'weapon') ?? null;
    return { items: list, weapon, species: d.form ?? null, color: visual.color, poder: equipmentBonus(equipped, items).poder ?? 0, modelKey: c?.id ?? null };
  }, [equipped, items, d.form, visual.color, c?.id]);
  const bowEquipped = gear.weapon?.type === 'arco';
  // teclado: F ataca (segurar carrega o arco); Espaço pula, E defende e C senta ficam no Companion; ignorado enquanto digita
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'); };
    const down = (e: KeyboardEvent) => { if (typing() || e.repeat) return; if (e.key === 'f' || e.key === 'F') { e.preventDefault(); pressAttack(); } };
    const up = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') releaseAttack(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', releaseAttack);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', releaseAttack); };
  }, []);

  const panel = { attributes: AttributesPanel, chat: ChatPanel, memories: MemoriesPanel, diary: DiaryPanel, quests: QuestsPanel, inventory: InventoryPanel, recipes: RecipesPanel, skills: SkillTreePanel, bond: BondPanel, settings: SettingsPanel };
  const Panel = tab ? panel[tab] : null;

  return (
    <div className={'app game-ui' + (tab && !minimized ? ' has-panel' : '') + (place === 'world' ? ' in-world' : '') + (model ? ' with-vitals' : '')}>
      <div className="stage">
        <Suspense fallback={null}>
          {place === 'world' && model ? (
            <WorldScene world={companionWorld} creatures={creatures} model={model} appendages={appendages} speed={speciesSpeed(d.form)} gear={gear} weather={weather} speech={bubble} burstKey={burst} color={visual.color} quality={quality()} discovered={discovered} explore={explore} onRegion={enterRegion} onDiscover={discover} onHome={goHome} />
          ) : <Refuge color={visual.color} glow={visual.glow} element={d.element} energy={energy} pulseKey={pulse} burstKey={burst} features={passage && !features.window ? { ...features, window: true } : features} contract={c?.stage === 'awakened' ? c.identityContract : null} speech={bubble} model={model} seed={seed} biome={biome} quality={quality()} appendages={appendages} speed={speciesSpeed(d.form)} gear={gear} weather={weather} />}
        </Suspense>
      </div>

      <WeatherOverlay />
      {backend && c && weather.kind !== 'limpo' && <div className="weather-chip" title={WEATHERS[weather.kind].hint}>{WEATHERS[weather.kind].icon} {WEATHERS[weather.kind].label}</div>}
      {!backend && <Entry />}

      {backend && c && (
        <>
          <LocationHud place={place} region={regionName} now={clock} />
          <QuestTracker />
          <FloatingConversation />
          <header className="nameplate">
            {snap?.visualJob?.artUrl
              ? <div className="portrait art" style={{ backgroundImage: `url("${snap.visualJob.artUrl}")` }} role="img" aria-label={`Retrato de ${d.name ?? 'Companion'}`} />
              : <div className="portrait" style={{ background: `radial-gradient(circle at 50% 45%, #fff 0 12%, ${visual.color} 40%, transparent 72%)` }} />}
            <div className="identity-info">
              <h1>{d.name ?? 'Núcleo sem nome'}</h1>
              <p>{d.form ? SPECIES[d.form].label : 'Partículas'}{d.element ? ' · ' + ELEMENTS[d.element].label : ''}</p>
              <VitalsBars bondRatio={c.bond.ratio} bondLevel={c.bond.level} />
            </div>
            <span className="portrait-level">Vínc. {c.bond.level}</span>
            {backend.kind === 'local' && <span className="mode" title="Progresso salvo apenas neste navegador; respostas sem IA">Offline · sem IA</span>}
            <button className="leave" title="Sair" aria-label="Sair" onClick={() => void leave()}>⎋</button>
          </header>

          {model && !tab && <div className="key-hint">{place === 'world' ? 'Clique ou WASD para andar · Shift corre · pise no portal para voltar' : 'Clique ou WASD para andar · Shift corre · arraste para girar a câmera'}</div>}
          {model && (
            <div className="travel">
              {place === 'refuge' ? (
                <button className="primary" disabled={!passage} onClick={goWorld} title={passage ? 'Atravessar a passagem na muralha' : 'A passagem na muralha abre depois do primeiro sonho'}>
                  Companion World{!passage && <small>abre depois do primeiro sonho</small>}
                </button>
              ) : (
                <>
                  <button onClick={goHome}>⌂ Voltar ao Refúgio</button>
                  <button className={explore ? 'on' : ''} aria-pressed={explore} onClick={() => setExplore(!explore)}>{explore ? 'Explorando sozinho…' : 'Explorar sozinho'}</button>
                </>
              )}
            </div>
          )}
          {model && <BondTrack />}
          {model && <TouchMoves />}
          {model && <FaintCounter />}
          {model && (
            <div className="combat-dock"><SkillBar color={visual.glow} /><button className={'attack-btn basic-attack' + (bowEquipped ? ' bow' : '')} aria-label={bowEquipped ? 'Segure para carregar o arco e solte para atirar' : 'Atacar'}
              onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pressAttack(); }}
              onPointerUp={() => releaseAttack()} onPointerCancel={() => releaseAttack()} onContextMenu={(e) => e.preventDefault()}>
              <HudGlyph kind={gear.weapon && ITEM_TYPES[gear.weapon.type].weapon?.ranged === 'magic' ? 'sintonia' : 'ataque'} />
              <small>{bowEquipped ? 'segure' : 'F'}</small>
            </button></div>
          )}
          {model && <WorldMap world={companionWorld} discovered={discovered} />}
          {place === 'world' && regionName && <div className="region-banner" key={regionName}>{regionName}</div>}
          {/* a fala aparece num balão sobre a cabeça do Companion (na cena); aqui só para leitores de tela */}
          {bubble && <div className="sr-only" role="status">{bubble}</div>}

          <nav className="rail" aria-label="Menu do Companion">
            {TABS.map((t) => (
              <button key={t.key} title={t.label} aria-label={t.label} className={tab === t.key ? 'on' : ''} onClick={() => setTab(tab === t.key ? null : t.key)} aria-pressed={tab === t.key}>
                <Icon tab={t.key} />
                <span>{t.label}</span>
                {t.key === 'bond' && snap?.awakening?.ready && c.stage === 'particles' && <em className="dot" aria-label="pronto para despertar" />}
              </button>
            ))}
          </nav>

          {Panel && tab && (
            <section className={'panel panel-' + tab + (minimized ? ' is-minimized' : '')} aria-label={TABS.find((t) => t.key === tab)?.label}>
              <header>
                <h2>{TABS.find((t) => t.key === tab)?.label}</h2>
                <div className="panel-controls"><button className="minimize" onClick={() => setMinimized(!minimized)} aria-expanded={!minimized} aria-label={minimized ? 'Restaurar painel' : 'Minimizar painel'}>{minimized ? '□' : '−'}</button><button className="close" onClick={() => setTab(null)} aria-label="Fechar painel">×</button></div>
              </header>
              <div className="panel-body" hidden={minimized}><Panel /></div>
            </section>
          )}
        </>
      )}

      {backend && c && <Celebration tint={visual.color} />}
      {backend && c && <AwakenCall name={d.name ?? 'Seu Companion'} he={d.pronoun === 'ele'} />}
      {backend && snap && !c && <Creation />}
      {backend && !c && busy && !snap && <div className="loading">Abrindo o Refúgio…</div>}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.tone}>{t.text}</div>)}
        {error && <div className="toast warn" onClick={() => useGame.setState({ error: null })}>{error}</div>}
        {backend && !snap && error && <button className="toast warn" onClick={() => setBackend(null)}>Voltar ao início</button>}
      </div>
    </div>
  );
}

