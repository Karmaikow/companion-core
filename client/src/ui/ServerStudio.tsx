/**
 * Servidor (painel do ADM): o que vale para todos os jogadores, gravado em game_config.values e lido pela função
 * a cada mensagem — muda na hora, sem publicar nada.
 * - XP: multiplicador e valores base do ganho de vínculo, limite diário e curva de níveis (com prévia).
 * - Clima: automático (janelas sorteadas pelo bioma) ou fixo, intensidade, duração das janelas e pesos globais.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONFIG, DEFAULT_WEATHER, REFUGE_BIOME, WEATHERS, WEATHER_KINDS, resolveConfig, sanitizeWeather, xpForLevel, weatherAt, type GameConfig, type WeatherConfig } from '@rules';
import { supabase } from '../backend/online';
import { WeatherOverlay } from './WeatherOverlay';

const BiomePreview = lazy(() => import('../scene/BiomePreview').then((m) => ({ default: m.BiomePreview })));

const XP_FIELDS: [keyof GameConfig, string, string][] = [
  ['messageXp', 'XP por mensagem significativa', 'base 8'],
  ['discoveryXp', 'XP por descoberta (quest)', 'base 40'],
  ['memoryXp', 'XP por memória nova', 'base 4'],
  ['maxMemoryXpPerTurn', 'Memórias que dão XP por turno', 'base 2'],
  ['dailySoftCap', 'Mensagens/dia antes do XP cair pela metade', 'base 25'],
  ['minMessageChars', 'Caracteres mínimos para dar XP', 'base 8'],
  ['levelBase', 'Curva: XP base do nível', 'base 60'],
  ['levelExp', 'Curva: expoente', 'base 1,6'],
];

export function ServerStudio() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [cfg, setCfg] = useState<GameConfig>(DEFAULT_CONFIG);
  const [weather, setWeather] = useState<WeatherConfig>(DEFAULT_WEATHER);
  const [mult, setMult] = useState(1);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>('chuva');

  useEffect(() => {
    void supabase().from('game_config').select('values').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setMsg({ text: 'Não consegui ler a configuração: ' + error.message }); return; }
      const v = (data?.values ?? {}) as Record<string, unknown>;
      setValues(v); setCfg(resolveConfig(v as Partial<GameConfig>)); setWeather(sanitizeWeather(v.weather));
      setMult(typeof v.xpMultiplier === 'number' ? v.xpMultiplier : 1);
    });
  }, []);

  async function save(patch: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const next = { ...(values ?? {}), ...patch };
    const { error } = await supabase().from('game_config').update({ values: next, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', 1);
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui salvar: ' + error.message }); return; }
    setValues(next); setMsg({ ok: true, text: ok });
  }

  // multiplicador: escala os XP base (a função lê os valores já multiplicados)
  const scaled = (k: keyof GameConfig) => Math.round(DEFAULT_CONFIG[k] * mult * 10) / 10;
  function applyMult() {
    setCfg({ ...cfg, messageXp: scaled('messageXp'), discoveryXp: scaled('discoveryXp'), memoryXp: scaled('memoryXp') });
  }
  const levels = useMemo(() => [2, 3, 5, 8, 10, 15, 20].map((l) => ({ l, xp: Math.round(xpForLevel(l, cfg)) })), [cfg]);
  const msgsTo5 = Math.ceil(xpForLevel(5, cfg) / Math.max(1, cfg.messageXp));
  const now = weatherAt(weather, Date.now(), 'refugio:refugio', REFUGE_BIOME.settings.weather);

  return (
    <div className="server-studio">
      <section className="biome-form">
        <fieldset>
          <legend>XP de vínculo</legend>
          <label>Multiplicador de XP <input type="range" min={0.5} max={5} step={0.25} value={mult} onChange={(e) => setMult(Number(e.target.value))} /> <b>{mult}×</b></label>
          <div className="row"><button className="ghost" onClick={applyMult}>Aplicar {mult}× nos valores base</button><small className="hint">Mensagem {scaled('messageXp')} · descoberta {scaled('discoveryXp')} · memória {scaled('memoryXp')}</small></div>
          <div className="grid-form">
            {XP_FIELDS.map(([k, label, hint]) => (
              <label key={k}>{label}<input type="number" step={k === 'levelExp' ? 0.05 : 1} min={0} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} /><small className="hint">{hint}</small></label>
            ))}
          </div>
          <div className="xp-curve">
            {levels.map(({ l, xp }) => <span key={l}>nível {l}: <b>{xp}</b> XP</span>)}
            <small className="hint">≈ {msgsTo5} mensagens significativas até o vínculo 5 (o despertar), sem contar descobertas.</small>
          </div>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => { const out: Record<string, unknown> = { xpMultiplier: mult }; for (const [k] of XP_FIELDS) out[k] = cfg[k]; void save(out, 'XP salvo: já vale na próxima mensagem de todos os jogadores.'); }}>Salvar XP</button>
            <button className="link" disabled={busy} onClick={() => { setCfg(DEFAULT_CONFIG); setMult(1); }}>voltar ao padrão</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Clima</legend>
          <div className="chips">
            <button className={'chip' + (weather.mode === 'auto' ? ' on' : '')} onClick={() => setWeather({ ...weather, mode: 'auto' })}>Automático</button>
            <button className={'chip' + (weather.mode === 'fixo' ? ' on' : '')} onClick={() => setWeather({ ...weather, mode: 'fixo' })}>Fixo</button>
            <small className="hint">Agora no Refúgio padrão: {WEATHERS[now.kind].icon} {WEATHERS[now.kind].label}</small>
          </div>
          {weather.mode === 'fixo' ? (
            <>
              <div className="chips">{WEATHER_KINDS.map((k) => <button key={k} className={'chip' + (weather.fixed === k ? ' on' : '')} onClick={() => { setWeather({ ...weather, fixed: k }); setPreview(k); }} title={WEATHERS[k].hint}>{WEATHERS[k].icon} {WEATHERS[k].label}</button>)}</div>
              <label>Intensidade <input type="range" min={0} max={1} step={0.05} value={weather.intensity} onChange={(e) => setWeather({ ...weather, intensity: Number(e.target.value) })} /> <b>{Math.round(weather.intensity * 100)}%</b></label>
            </>
          ) : (
            <>
              <label>Cada clima dura <input type="number" min={2} max={240} value={weather.windowMinutes} onChange={(e) => setWeather({ ...weather, windowMinutes: Number(e.target.value) })} style={{ width: 70 }} /> minutos</label>
              <small className="hint">Chance global de cada clima (multiplica a chance do bioma, que se ajusta no Estúdio de Biomas — neve e areia só aparecem onde o bioma permite):</small>
              <div className="look-sliders">
                {WEATHER_KINDS.map((k) => (
                  <label key={k}>{WEATHERS[k].icon} {WEATHERS[k].label}<input type="range" min={0} max={10} step={0.5} value={weather.weights[k]} onChange={(e) => setWeather({ ...weather, weights: { ...weather.weights, [k]: Number(e.target.value) } })} /><small>{weather.weights[k]}</small></label>
                ))}
              </div>
            </>
          )}
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => void save({ weather }, weather.mode === 'fixo' ? `Clima fixo em ${WEATHERS[weather.fixed].label} para todos.` : 'Clima automático salvo.')}>Salvar clima</button>
          </div>
        </fieldset>
        {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
      </section>

      <section className="biome-editor">
        <div className="biome-preview">
          <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}>
            <BiomePreview biome={REFUGE_BIOME} daylight={1} seed={7} open={false} weather={{ kind: preview as never, intensity: weather.mode === 'fixo' ? weather.intensity : 0.85 }} />
          </Suspense>
          <WeatherOverlay />
          <div className="preview-tools">
            {WEATHER_KINDS.map((k) => <button key={k} className={'chip' + (preview === k ? ' on' : '')} onClick={() => setPreview(k)} title={WEATHERS[k].label}>{WEATHERS[k].icon}</button>)}
          </div>
        </div>
        <small className="hint">Prévia de cada clima na clareira. O jogo faz a transição suave quando o clima muda.</small>
      </section>
    </div>
  );
}
