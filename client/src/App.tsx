import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { canCompleteEquipment, masculinize, ELEMENTS, derivePalette, refugeFeatures, animKind, sanitizeBiome, sanitizeCreature, makeCompanionWorld, worldBiomeList, characterSheet, sanitizeItem, DEFAULT_ITEMS, isWearable, validateEquipped, equipmentBonus, equippedItems, ITEM_TYPES, sanitizeWeather, weatherAt, WEATHERS, DEFAULT_WEATHER, DEFAULT_BIOME_WEATHER, type ItemDef, type WeatherConfig, WORLD_SEED, DEFAULT_CREATURES, type BiomeConfig, type CreatureDef, type WorldSite,
  ASTER_GATE, DEFAULT_CITY_LAYOUT, OUT_ARRIVAL, OUT_GATE_ARRIVE, cityArrival, outskirtsGatePoint, sanitizeCityLayout, type CityLayout, type CityState } from '@rules';
import { Refuge } from './scene/Refuge';
import { WorldScene } from './scene/WorldScene';
import { AsterScene, type AsterTravel } from './scene/AsterScene';
import { WorldMap } from './ui/WorldMap';
import { stableSeed, teleport } from './scene/world';
import { useGame, type Tab } from './store';
import { Icon } from './ui/icons';
import { ChatPanel, MemoriesPanel, DiaryPanel, QuestsPanel, InventoryPanel, RecipesPanel, BondPanel } from './ui/Panels';
import { Celebration, AwakenCall, AwakenButton } from './ui/Celebration';
import { SkillsPanel } from './ui/ConstellationPanel';
import { useBuildSync } from './build/buildStore';
import { Entry } from './ui/Entry';
import { Creation } from './ui/Creation';
import { SkillTreePanel } from './ui/SkillTreePanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { EcosPanel } from './ui/EcosPanel';
import { MissionsPanel } from './ui/MissionsPanel';
import { PactoPanel } from './ui/PactoPanel';
import { LocationHud, QuestTracker } from './ui/GameHud';
import { ChatComposer } from './ui/ChatComposer';
import { Joystick, RotateHint, useTouchLandscape } from './ui/TouchControls';
import { useSkills } from './ui/skillState';
import { joinWorld, type PresenceMap, type RemoteInfo } from './net/presence';
import { SocialPanel } from './ui/SocialPanel';
import { useSocialLoop, useSocial } from './net/social';
import { HudGlyph } from './ui/HudGlyph';
import { usePacto } from './pacto/pactoStore';
import { EcosHud } from './ui/EcosHud';
import { speak, sendPlayerMessage, stopConversation, useConversation, useMic } from './ui/voice';
import { brain } from './scene/brain';
import { SkillBar } from './ui/SkillBar';
import { ComboHud } from './ui/ComboHud';
import { HudEditor } from './ui/HudEditor';
import { GodMode, GodButton } from './ui/GodPanel';
import { ShopPanel } from './ui/ShopPanel';
import { SchoolPanel } from './ui/SchoolPanel';
import { EcosHouse } from './ui/EcosHouse';
import { TowerPanel } from './ui/TowerPanel';
import { useChests } from './chests/chestStore';
import { useGod } from './ui/godMode';
import { SafeStage, glLostBefore } from './scene/SafeStage';
import { useHud } from './ui/hudLayout';
import { VitalsBars, TouchMoves, FaintCounter } from './ui/VitalsHud';
import { useSkillSync } from './ui/skillState';
import { pressAttack, releaseAttack } from './scene/Combat';
import { ownsItem, EquipmentPanel } from './ui/EquipmentPanel';
import { MenuBook, type BookMenu } from './ui/MenuBook';
import { useCarry } from './ui/bag';
import { useToolBelt } from './ui/toolBelt';
import { WeatherOverlay } from './ui/WeatherOverlay';
import { supabase } from './backend/online';

/** Menu lateral em grupos: o Companion, a jornada, a bolsa, os ofícios e os ajustes. A Forja só aparece para Taurinas. */
const TAB_GROUPS: { label: string; tabs: { key: Tab; label: string }[] }[] = [
  { label: 'Companion', tabs: [{ key: 'chat', label: 'Conversa' }, { key: 'bond', label: 'Vínculo' }, { key: 'skills', label: 'Habilidades' }] },
  { label: 'Jornada', tabs: [{ key: 'quests', label: 'Quests' }, { key: 'missoes', label: 'Missões' }, { key: 'diary', label: 'Diário' }, { key: 'memories', label: 'Memórias' }] },
  { label: 'Bolsa', tabs: [{ key: 'inventory', label: 'Inventário' }, { key: 'recipes', label: 'Receitas' }] },
  { label: 'Ofícios', tabs: [{ key: 'pacto', label: 'Oficina' }, { key: 'forja', label: 'Forja Primordial' }] },
  { label: 'Mundo', tabs: [{ key: 'social', label: 'Amigos e grupo' }] },
  { label: 'Sistema', tabs: [{ key: 'settings', label: 'Ajustes' }] },
];
const TABS = TAB_GROUPS.flatMap((g) => g.tabs);

function quality(): 'high' | 'low' {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  if (glLostBefore()) return 'low';
  const mobile = matchMedia('(pointer: coarse)').matches;
  return mobile && (navigator.hardwareConcurrency ?? 8) <= 6 ? 'low' : 'high';
}

const SkillsTab = () => <SkillsPanel Tree={SkillTreePanel} />;
/** onde o Companion está: o Refúgio, o Companion World ou os dois mapas de Áster */
export type Place = 'refuge' | 'world' | 'arredores' | 'cidade';

export function App() {
  const { backend, snap, tab, setTab, run, error, toasts, lastReply, pulse, burst, busy, setBackend } = useGame();
  const [bubble, setBubble] = useState<string | null>(null);

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
    const he = useGame.getState().snap?.companion?.discoveries.pronoun === 'ele';
    const line = he ? masculinize(barkMsg.text) : barkMsg.text; // "ele": fala de si no masculino (também as falas da IA)
    setBubble(line);
    speak(line);
    const t = setTimeout(() => setBubble((b) => (b === line ? null : b)), barkMsg.ms ?? Math.max(2600, barkMsg.text.length * 75));
    return () => clearTimeout(t);
  }, [barkMsg]);
  // segure V (fora de campos de texto) para falar com ela
  const vmic = useMic((t) => sendPlayerMessage(t));
  const conv = useConversation();
  useEffect(() => () => stopConversation(), []);
  const vmicRef = useRef(vmic); vmicRef.current = vmic;
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable); };
    const down = (e: KeyboardEvent) => { if (e.repeat || typing() || e.key.toLowerCase() !== 'v') return; vmicRef.current.start(); };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v') vmicRef.current.stop(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

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
  // cinto de ferramentas (Inventário): a coleta já respeita o que foi tirado, mesmo sem abrir o painel
  useEffect(() => { if (c?.id) useToolBelt.getState().load(c.id); }, [c?.id]);
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
  const godModel = useGod((g) => g.model);
  const model = godModel ?? testModel ?? snap?.visualJob?.model;
  const testWorld = useMemo(() => new URLSearchParams(location.search).has('mundo'), []);
  const passage = features.window || testWorld;
  // teste: ?aster abre nos Arredores de Áster, ?cidade dentro da cidade (?destruida mostra a cidade caída),
  // ?estrada no Companion World ao lado do portal de Áster
  const testAster = useMemo(() => { const q = new URLSearchParams(location.search); return q.has('cidade') ? 'cidade' as const : q.has('aster') ? 'arredores' as const : q.has('estrada') ? 'estrada' as const : null; }, []);
  const [place, setPlace] = useState<Place>(testAster === 'estrada' ? 'world' : testAster ?? 'refuge');
  const [explore, setExplore] = useState(false);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [hereRegion, setHereRegion] = useState<string | null>(null); // fica no brasão (o banner some sozinho)
  const toast = useGame((s) => s.toast);
  const companionWorld = useMemo(() => {
    // regiões: os biomas publicados com "aparece no mundo"; com poucos, entram as regiões de reserva
    return makeCompanionWorld(WORLD_SEED, worldBiomeList(worldBiomes));
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
    const here = place === 'world' ? companionWorld.biomes.find((b) => b.slug === regionBiome) : place === 'refuge' ? biome : undefined;
    const key = place === 'world' ? 'mundo:' + (here?.slug ?? 'refugio') : place === 'refuge' ? 'refugio:' + (here?.slug ?? 'refugio') : 'aster:' + place;
    const w = weatherAt(weatherCfg, clock, key, here?.settings.weather ?? DEFAULT_BIOME_WEATHER);
    return { kind: w.kind, intensity: w.intensity };
  }, [weatherCfg, clock, place, regionBiome, companionWorld, biome]);

  const enterRegion = (s: WorldSite) => {
    setRegionBiome(companionWorld.biomes[s.biome].slug);
    const label = s.home ? 'Portal do Refúgio' : s.gate ? s.name : companionWorld.biomes[s.biome].name;
    setRegionName(label); setHereRegion(label);
  };
  useEffect(() => { if (!regionName) return; const t = setTimeout(() => setRegionName(null), 3200); return () => clearTimeout(t); }, [regionName]);
  const goWorld = () => { setWorldStart(undefined); setPlace('world'); setExplore(false); };
  const goHome = () => { setPlace('refuge'); setExplore(false); toast('De volta ao Refúgio.', 'soft'); };

  // ---- Áster, a Cidade-Farol: Arredores (vista de fora + anéis de defesa) e a Cidade (montada no Estúdio da Cidade)
  const inAster = place === 'arredores' || place === 'cidade';
  const [arrive, setArrive] = useState<{ x: number; z: number }>(() => (testAster === 'cidade' ? cityArrival(DEFAULT_CITY_LAYOUT, 'sul') : { x: OUT_ARRIVAL.x, z: OUT_ARRIVAL.z - 6 }));
  const [worldStart, setWorldStart] = useState<[number, number] | undefined>(() => (testAster === 'estrada' ? [ASTER_GATE.x + 9, ASTER_GATE.z + 9] : undefined));
  const [travelKey, setTravelKey] = useState(0);
  const [asterPlace, setAsterPlace] = useState<string | null>(null);
  const [cityLayout, setCityLayout] = useState<CityLayout>(DEFAULT_CITY_LAYOUT);
  // Áster: normal ou destruída (lido do banco; ?destruida força a cidade caída para teste)
  const forcedDown = useMemo(() => new URLSearchParams(location.search).has('destruida'), []);
  const realCity = useChests((s) => s.city?.state);
  useEffect(() => { void useChests.getState().loadCity(); const t = setInterval(() => void useChests.getState().loadCity(), 60_000); return () => clearInterval(t); }, []);
  const cityState: CityState = forcedDown ? 'destruida' : realCity ?? 'normal';
  const godAdmin = useGod((g) => g.admin);
  useEffect(() => {
    if (!inAster && !godAdmin) return; // o Administrador precisa dos lugares da cidade para o teleporte
    let alive = true;
    supabase().from('city_layouts').select('data').eq('slug', 'aster').eq('status', 'published').maybeSingle()
      .then(({ data }) => { if (alive && data?.data) setCityLayout(sanitizeCityLayout(data.data)); }, () => {});
    return () => { alive = false; };
  }, [inAster, godAdmin]);
  const goAster = () => { setArrive({ x: OUT_ARRIVAL.x, z: OUT_ARRIVAL.z - 6 }); setTravelKey((k) => k + 1); setPlace('arredores'); setExplore(false); toast('Arredores de Áster, a Cidade-Farol.', 'gold'); };
  const asterTravel = (t: AsterTravel) => {
    setTravelKey((k) => k + 1);
    if (t.to === 'mundo') { setWorldStart([ASTER_GATE.x + 6, ASTER_GATE.z + 6]); setPlace('world'); toast('De volta ao Companion World.', 'soft'); }
    else if (t.to === 'cidade') { setArrive(cityArrival(cityLayout, t.gate)); setPlace('cidade'); toast('Você entrou em Áster.', 'gold'); }
    else { setArrive(outskirtsGatePoint(t.gate, OUT_GATE_ARRIVE)); setPlace('arredores'); }
  };

  // teleporte do modo GOD: no mesmo mapa só move o Companion; em outro, troca de mapa já no ponto
  const godTp = useGod((g) => g.tp);
  useEffect(() => {
    if (!godTp) return;
    const { place: to, x, z } = godTp;
    if (to === place) { teleport.point.set(x, 0, z); teleport.id++; return; }
    setExplore(false); setTravelKey((k) => k + 1);
    if (to === 'world') setWorldStart([x, z]);
    else if (to !== 'refuge') setArrive({ x, z });
    setPlace(to);
  }, [godTp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // presença (MMO fase 1): no Companion World e em Áster, os Companions de outros jogadores aparecem na mesma tela
  // (só quem está no mesmo mapa). Online: canal do Supabase Realtime; no dev, `?eco` testa entre abas.
  const presenceKey = place !== 'refuge' && c?.id && (backend?.kind === 'online' || (import.meta.env.DEV && new URLSearchParams(location.search).has('eco'))) ? place + '|' + c.id + '|' + (model?.url.split('?')[0] ?? '') + '|' + c.discoveries.name : '';
  const presenceMe = useRef<RemoteInfo | null>(null);
  presenceMe.current = c ? { id: import.meta.env.DEV && new URLSearchParams(location.search).get('eco') ? c.id + ':' + new URLSearchParams(location.search).get('eco') : c.id, name: c.discoveries.name ?? 'Companion', color: visual.glow, model: model ?? null, pronoun: c.discoveries.pronoun, slots: Object.fromEntries(['idle', 'walk', 'run'].map((k) => [k, useSkills.getState().animMap['slot:' + k] ?? '']).filter(([, v]) => v)) } : null;
  useEffect(() => {
    if (!presenceKey || !presenceMe.current) return;
    return joinWorld(presenceMe.current, backend?.kind !== 'online', place as PresenceMap);
  }, [presenceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocialLoop({ on: backend?.kind === 'online' && c?.stage === 'awakened', inWorld: place === 'world', me: c?.id ?? null });
  // grupo: o líder explora sozinho quando o grupo está explorando ou caçando (os outros vão atrás dele)
  const groupExplore = useSocial((s) => !!s.group && s.group.role === 'leader' && s.group.activity !== 'conversar');
  const socialBadge = useSocial((s) => (s.data ? s.data.friendRequests.length + s.data.partyInvites.length + s.data.trades.filter((t) => !t.mine && t.status === 'proposed').length : 0));

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

  // ---- Pacto das Cinco: peças forjadas, trabalhos em andamento (terminam sozinhos, mesmo com o painel fechado)
  useEffect(() => {
    if (!c?.id || c.stage !== 'awakened' || !backend) return;
    void usePacto.getState().refresh();
    const t = setInterval(() => usePacto.getState().tick(), 1000);
    return () => clearInterval(t);
  }, [c?.id, c?.stage, backend]);

  // ---- armas e equipamentos: arsenal publicado (ou o inicial) + o que está equipado
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  useEffect(() => {
    supabase().from('items').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeItem({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is ItemDef => !!x);
      // materiais e diversos de reserva continuam valendo (são os drops dos monstros de exemplo)
      if (list.length) useGame.getState().setItems([...list, ...DEFAULT_ITEMS.filter((d) => !isWearable(d.type) && !list.some((x) => x.slug === d.slug))]);
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
      if (alive) useGame.getState().setEquipped(validateEquipped(raw, useGame.getState().items, ownsItem, useGame.getState().snap?.companion?.bond.level));
    })();
    return () => { alive = false; };
  }, [c?.id, backend?.kind, items]);
  const gear = useMemo(() => {
    const worn = equippedItems(equipped, items);
    const list = worn.map((w) => w.item);
    const slots = Object.fromEntries(worn.map((w) => [w.item.slug, w.slot]));
    // a arma que ataca é a da mão direita (a secundária soma atributos e aparece na mão esquerda)
    const weapon = worn.find((w) => w.slot === 'mainhand' && ITEM_TYPES[w.item.type].weapon)?.item ?? null;
    return { items: list, slots, weapon, species: d.form ?? null, color: visual.color, poder: equipmentBonus(equipped, items).poder ?? 0, modelKey: c?.id ?? null };
  }, [equipped, items, d.form, visual.color, c?.id]);
  // Constelação Viva: números de combate da build ativa (+ árvore e equipamento); HP/SP/ST máximos sem curar na troca
  // carga: pesado demais tira agilidade e o passo fica mais lento
  const carry = useCarry();
  const equipBonus = useMemo(() => {
    const b = equipmentBonus(equipped, items);
    return carry.load.agilityPct ? { ...b, agilidade: Math.round(((b.agilidade ?? 0) + carry.load.agilityPct) * 10) / 10 } : b;
  }, [equipped, items, carry.load.agilityPct]);
  const built0 = useBuildSync(equipBonus);
  const built = useMemo(() => (carry.load.moveMul === 1 ? built0 : { ...built0, moveSpeed: built0.moveSpeed * carry.load.moveMul }), [built0, carry.load.moveMul]);
  const bowEquipped = gear.weapon?.type === 'arco';
  // teclado: F ataca (segurar carrega o arco); Espaço pula, E defende e C senta ficam no Companion; ignorado enquanto digita
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'); };
    const down = (e: KeyboardEvent) => { if (typing() || e.repeat) return; if (e.key === 'f' || e.key === 'F') { e.preventDefault(); pressAttack(); } };
    const up = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') releaseAttack(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', releaseAttack);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', releaseAttack); };
  }, []);

  const pactoView = usePacto((s) => s.view);
  const pactoForms = pactoView ? (pactoView.cls.forms?.length ? pactoView.cls.forms : pactoView.cls.effective ? [pactoView.cls.effective] : []) : [];
  const [minimized, setMinimized] = useState(false);
  // celular deitado: joystick, atalhos em volta do ataque, menu e conversa recolhidos atrás de botões
  const touchLand = useTouchLandscape();
  const [railOpen, setRailOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => { if (!touchLand) setChatOpen(false); }, [touchLand]);
  const hudEditing = useHud((h) => h.editing) && touchLand;
  useEffect(() => { if (hudEditing) { setTab(null); setRailOpen(false); } }, [hudEditing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!touchLand && useHud.getState().editing) useHud.getState().edit(false); }, [touchLand]);
  useEffect(() => { if (tab) setRailOpen(false); }, [tab]);
  // Taurina (classe real, de teste ou linhagem): a Oficina vira a Forja Primordial, com menu próprio
  const taurina = canCompleteEquipment(pactoForms.length ? pactoForms : d.form ? [d.form] : []);
  const hiddenTab = (k: Tab) => (k === 'forja' ? !taurina : k === 'pacto' ? taurina : false);
  useEffect(() => setMinimized(false), [tab]);
  useEffect(() => { if ((tab === 'forja' && !taurina) || (tab === 'pacto' && taurina)) setTab(taurina ? 'forja' : 'pacto'); }, [tab, taurina]); // eslint-disable-line react-hooks/exhaustive-deps
  const panel = { chat: ChatPanel, memories: MemoriesPanel, diary: DiaryPanel, quests: QuestsPanel, missoes: MissionsPanel, inventory: InventoryPanel, recipes: RecipesPanel, skills: SkillsTab, bond: BondPanel, ecos: EcosPanel, pacto: PactoPanel, forja: PactoPanel, social: SocialPanel, settings: SettingsPanel };
  const Panel = tab ? panel[tab] : null;
  const bookMenu: BookMenu = { tabs: TABS.filter((t) => t.key !== 'chat' && !hiddenTab(t.key)), current: tab ?? 'inventory', go: (t) => setTab(t) };

  return (
    <div className={'app game-ui' + (tab === 'chat' && !minimized ? ' has-panel' : '') + (place === 'world' ? ' in-world' : '') + (model ? ' with-vitals' : '') + (touchLand ? ' touch-land' : '') + (hudEditing ? ' hud-editing' : '') + (railOpen ? ' rail-open' : '') + (chatOpen ? ' chat-open' : '')}>
      <div className="stage">
        <SafeStage>
        <Suspense fallback={null}>
          {inAster && model ? (
            <AsterScene key={place + travelKey} map={place as 'arredores' | 'cidade'} layout={cityLayout} state={cityState} arrive={arrive} model={model} appendages={appendages} speed={built.moveSpeed} gear={gear} weather={weather} speech={bubble} burstKey={burst} quality={quality()} onTravel={asterTravel} onPlace={setAsterPlace} />
          ) : place === 'world' && model ? (
            <WorldScene key={'w' + travelKey} start={worldStart} onAster={goAster} world={companionWorld} creatures={creatures} model={model} appendages={appendages} speed={built.moveSpeed} gear={gear} weather={weather} weatherCfg={weatherCfg} speech={bubble} burstKey={burst} color={visual.color} quality={quality()} discovered={discovered} explore={explore || groupExplore} onRegion={enterRegion} onDiscover={discover} onHome={goHome} />
          ) : <Refuge color={visual.color} glow={visual.glow} element={d.element} energy={energy} pulseKey={pulse} burstKey={burst} features={passage && !features.window ? { ...features, window: true } : features} contract={c?.stage === 'awakened' ? c.identityContract : null} speech={bubble} model={model} seed={seed} biome={biome} quality={quality()} appendages={appendages} speed={built.moveSpeed} gear={gear} weather={weather} />}
        </Suspense>
        </SafeStage>
      </div>

      <WeatherOverlay />
      {backend && c && weather.kind !== 'limpo' && <div className="weather-chip" title={WEATHERS[weather.kind].hint}>{WEATHERS[weather.kind].icon} {WEATHERS[weather.kind].label}</div>}
      {!backend && <Entry />}

      {backend && c && (
        <>
          <LocationHud place={place} region={inAster ? asterPlace : hereRegion} />
          {c.stage === 'particles' && <QuestTracker />}
          {tab !== 'chat' && <ChatComposer variant="world" speech={bubble} />}
          <header className="nameplate deco">
            {snap?.visualJob?.artUrl
              ? <div className="portrait art" style={{ backgroundImage: `url("${snap.visualJob.artUrl}")` }} role="img" aria-label={`Retrato de ${d.name ?? 'Companion'}`} />
              : <div className="portrait" style={{ background: `radial-gradient(circle at 50% 45%, #fff 0 12%, ${visual.color} 40%, transparent 72%)` }} />}
            <div>
              <h1>{d.name ?? 'Núcleo sem nome'}</h1>
              <p>{c.stage === 'awakened' ? 'Primeira forma' : 'Partículas'} · vínculo {c.bond.level}</p>
              {model ? <VitalsBars bondRatio={c.bond.ratio} bondLevel={c.bond.level} /> : <div className="bar small"><i style={{ width: Math.round(c.bond.ratio * 100) + '%' }} /></div>}
            </div>
            {backend.kind === 'local' && <span className="mode" title="Progresso salvo apenas neste navegador; respostas sem IA">Offline · sem IA</span>}
            <button className="leave" title="Sair" aria-label="Sair" onClick={() => void leave()}>⎋</button>
          </header>

          {model && !tab && <div className="key-hint">{place === 'world' ? 'Clique ou WASD para andar (corre sozinho) · Shift anda devagar · Shift + 1–9 concentra a habilidade · pise no portal para voltar' : inAster ? 'Clique ou WASD para andar · pise num portão para entrar ou sair da cidade · o portal dourado do sul volta ao Companion World' : 'Clique ou WASD para andar (corre sozinho) · Shift anda devagar · Shift + 1–9 concentra a habilidade · arraste para girar a câmera'}</div>}
          {model && (
            <div className="travel">
              {place === 'refuge' ? (
                <button className="primary" disabled={!passage} onClick={goWorld} title={passage ? 'Atravessar a passagem na muralha' : 'A passagem na muralha abre depois do primeiro sonho'}>
                  Companion World{!passage && <small>abre depois do primeiro sonho</small>}
                </button>
              ) : (
                <>
                  <button onClick={goHome}>⌂ Voltar ao Refúgio</button>
                  {place === 'world' && <button className={explore ? 'on' : ''} aria-pressed={explore} onClick={() => setExplore(!explore)}>{explore ? 'Explorando sozinho…' : 'Explorar sozinho'}</button>}
                </>
              )}
            </div>
          )}
          {model && <SkillBar color={visual.glow} />}
          {model && <ComboHud />}
          {model && <TouchMoves />}
          {model && touchLand && <Joystick />}
          {touchLand && chatOpen && (
            <button className="chat-close" onClick={() => setChatOpen(false)} aria-label="Fechar a conversa">×</button>
          )}
          {touchLand && (
            <button className="mobile-menu-btn" onClick={() => { setChatOpen(false); setRailOpen(true); }} aria-label="Abrir o menu" aria-expanded={railOpen}>☰{socialBadge > 0 && <em className="dot" aria-label={socialBadge + ' pedidos'} />}</button>
          )}
          {touchLand && railOpen && (
            <div className="mobile-menu" role="dialog" aria-label="Menu">
              <header>
                <b>{d.name ?? 'Companion'}</b>
                <small>{c.stage === 'awakened' ? 'Primeira forma' : 'Partículas'} · vínculo {c.bond.level}</small>
                <button className="close" onClick={() => setRailOpen(false)} aria-label="Fechar o menu">×</button>
              </header>
              <div className="mm-actions">
                <button onClick={() => { setRailOpen(false); setChatOpen(true); }}><HudGlyph kind="send" /><span>Conversar</span></button>
                {model && (place === 'refuge'
                  ? <button disabled={!passage} onClick={() => { setRailOpen(false); goWorld(); }}><span aria-hidden>✦</span><span>Companion World{!passage && <small>abre depois do primeiro sonho</small>}</span></button>
                  : <>
                    <button onClick={() => { setRailOpen(false); goHome(); }}><span aria-hidden>⌂</span><span>Voltar ao Refúgio</span></button>
                    {place === 'world' && <button className={explore ? 'on' : ''} onClick={() => setExplore(!explore)}><span aria-hidden>➶</span><span>{explore ? 'Explorando sozinho…' : 'Explorar sozinho'}</span></button>}
                  </>)}
              </div>
              {c.stage === 'particles' && <div className="mm-quest" onClick={() => setRailOpen(false)}><QuestTracker /></div>}
              <nav className="mm-grid" aria-label="Seções">
                {TABS.filter((t) => !hiddenTab(t.key)).map((t) => (
                  <button key={t.key} onClick={() => { setRailOpen(false); setTab(t.key); }}>
                    <Icon tab={t.key} size={26} />
                    <span>{t.label}</span>
                    {t.key === 'social' && socialBadge > 0 && <em className="dot" />}
                  </button>
                ))}
                {model && <GodButton />}
              </nav>
              <button className="mm-leave" onClick={() => void leave()}>⎋ Sair da conta</button>
            </div>
          )}
          {hudEditing && <HudEditor />}
          {place === 'cidade' && <ShopPanel />}
          {place === 'cidade' && <SchoolPanel />}
          {place === 'cidade' && <EcosHouse />}
          {place === 'cidade' && <TowerPanel />}
          {model && !hudEditing && <GodMode inWorld={place === 'world'} place={place} world={companionWorld} city={cityLayout} />}
          {model && <FaintCounter onReturn={place !== 'refuge' ? goHome : undefined} />}
          {model && (
            <button className={'attack-btn' + (bowEquipped ? ' bow' : '')} aria-label={bowEquipped ? 'Segure para carregar o arco e solte para atirar' : 'Atacar'}
              onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pressAttack(); }}
              onPointerUp={() => releaseAttack()} onPointerCancel={() => releaseAttack()} onContextMenu={(e) => e.preventDefault()}>
              {bowEquipped ? <span aria-hidden>🏹</span> : <HudGlyph kind={gear.weapon && ITEM_TYPES[gear.weapon.type].weapon?.ranged === 'magic' ? 'sintonia' : 'ataque'} />}
              <small>{bowEquipped ? 'segure' : 'F'}</small>
            </button>
          )}
          {place === 'world' && <WorldMap world={companionWorld} discovered={discovered} />}
          {place === 'world' && c.stage === 'awakened' && <EcosHud panelOpen={!!tab} />}
          {place === 'world' && regionName && <div className="region-banner" key={regionName}>{regionName}</div>}
          {/* a fala aparece num balão sobre a cabeça do Companion (na cena); aqui só para leitores de tela */}
          {bubble && <div className="sr-only" role="status">{bubble}</div>}
          {vmic.listening && <div className="listening" role="status"><span>🎙</span>{vmic.heard || 'Ouvindo… pode falar'}</div>}
          {conv.on && !vmic.listening && (
            <div className={'listening conv' + (conv.listening ? '' : ' paused')} role="status">
              <span>🎙</span>{conv.listening ? conv.heard || 'Conversa por voz ligada — pode falar' : 'Ela está falando…'}
              <button type="button" onClick={stopConversation} aria-label="Desligar a conversa por voz">desligar</button>
            </div>
          )}

          <nav className="rail deco" aria-label="Menu do Companion">
            {TAB_GROUPS.map((g, gi) => (
              <div className="rail-group" role="group" aria-label={g.label} key={g.label}>
                {gi > 0 && <i className="rail-sep" aria-hidden="true" />}
                {g.tabs.filter((t) => !hiddenTab(t.key)).map((t) => (
                  <button key={t.key} className={(tab === t.key ? 'on' : '') + (t.key === 'forja' ? ' forge' : '')} onClick={() => setTab(tab === t.key ? null : t.key)} aria-pressed={tab === t.key} aria-label={t.label} data-tip={t.label}>
                    <Icon tab={t.key} />
                    <span>{t.label}</span>
                    {t.key === 'social' && socialBadge > 0 && <em className="dot" aria-label={socialBadge + ' pedidos'} />}
                    {t.key === 'bond' && snap?.awakening?.ready && c.stage === 'particles' && <em className="dot" aria-label="pronto para despertar" />}
                  </button>
                ))}
              </div>
            ))}
            {model && !hudEditing && <div className="rail-group" role="group" aria-label="Administrador"><GodButton /></div>}
          </nav>

          {/* menus em livro de pergaminho (a Conversa continua por cima do mundo); os marcadores trocam de menu */}
          {tab === 'inventory' && <EquipmentPanel onClose={() => setTab(null)} menu={bookMenu} />}
          {Panel && tab && tab !== 'inventory' && tab !== 'chat' && (
            <MenuBook title={TABS.find((t) => t.key === tab)?.label ?? ''} menu={bookMenu} onClose={() => setTab(null)} className={'single book-' + tab}>
              <section className={'ib-page single menu panel-' + tab}><Panel /></section>
            </MenuBook>
          )}
          {Panel && tab === 'chat' && (
            <section className={'panel deco panel-' + tab + (minimized ? ' is-minimized' : '')} aria-label={TABS.find((t) => t.key === tab)?.label}>
              <header>
                <h2>{TABS.find((t) => t.key === tab)?.label}</h2>
                <div className="panel-controls">
                  <button className="minimize" onClick={() => setMinimized(!minimized)} aria-expanded={!minimized} aria-label={minimized ? 'Restaurar painel' : 'Minimizar painel'}>{minimized ? '▢' : '−'}</button>
                  <button className="close" onClick={() => setTab(null)} aria-label="Fechar painel">×</button>
                </div>
              </header>
              <div className="panel-body" hidden={minimized}><Panel /></div>
            </section>
          )}
        </>
      )}

      {backend && c && <RotateHint />}
      {backend && c && <Celebration tint={visual.color} />}
      {backend && c && !tab && <AwakenButton />}
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
