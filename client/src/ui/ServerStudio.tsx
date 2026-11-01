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
import { AiSettings } from './AiSettings';
import { useAdminDirty } from './adminKit';

const BiomePreview = lazy(() => import('../scene/BiomePreview').then((m) => ({ default: m.BiomePreview })));

const XP_FIELDS: [keyof GameConfig, string, string][] = [
  ['messageXp', 'XP por mensagem significativa', 'base 8'],
  ['discoveryXp', 'XP por descoberta (quest)', 'base 40'],
  ['memoryXp', 'XP por memória nova', 'base 4'],
  ['killXp', 'XP por criatura derrotada', 'base 4 (+1 a cada 3 níveis dela)'],
  ['firstKillXp', 'Bônus: primeira vez contra uma espécie', 'base 15'],
  ['analysisXp', 'Bônus: Análise de Partículas completa', 'base 30'],
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
  // cada seção mostra a própria mensagem, perto do botão que a gerou
  const [msg, setMsg] = useState<{ text: string; ok?: boolean; at: 'xp' | 'clima' | 'geral' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>('chuva');

  useEffect(() => {
    void supabase().from('game_config').select('values').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setMsg({ text: 'Não consegui ler a configuração: ' + error.message, at: 'geral' }); return; }
      const v = (data?.values ?? {}) as Record<string, unknown>;
      setValues(v); setCfg(resolveConfig(v as Partial<GameConfig>)); setWeather(sanitizeWeather(v.weather));
      setMult(typeof v.xpMultiplier === 'number' ? v.xpMultiplier : 1);
    });
  }, []);

  async function save(patch: Record<string, unknown>, ok: string, at: 'xp' | 'clima') {
    setBusy(true); setMsg(null);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const next = { ...(values ?? {}), ...patch };
    const { error } = await supabase().from('game_config').update({ values: next, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', 1);
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui salvar: ' + error.message, at }); return; }
    setValues(next); setMsg({ ok: true, text: ok, at });
  }

  // o que está salvo hoje × o que está na tela: mostra a diferença antes de mudar o jogo de todo mundo
  const savedCfg = useMemo(() => resolveConfig((values ?? {}) as Partial<GameConfig>), [values]);
  const savedMult = typeof values?.xpMultiplier === 'number' ? values.xpMultiplier : 1;
  const xpDiff = values ? [
    ...(mult !== savedMult ? [`Multiplicador: ${savedMult}× → ${mult}×`] : []),
    ...XP_FIELDS.filter(([k]) => cfg[k] !== savedCfg[k]).map(([k, label]) => `${label}: ${savedCfg[k]} → ${cfg[k]}`),
  ] : [];
  const weatherDirty = !!values && JSON.stringify(weather) !== JSON.stringify(sanitizeWeather(values.weather));
  useAdminDirty(xpDiff.length > 0 || weatherDirty);
  function saveXp() {
    if (!xpDiff.length || !window.confirm(`Mudar o XP de todos os jogadores agora?\n\n${xpDiff.join('\n')}`)) return;
    const out: Record<string, unknown> = { xpMultiplier: mult };
    for (const [k] of XP_FIELDS) out[k] = cfg[k];
    void save(out, 'XP salvo: já vale na próxima mensagem de todos os jogadores.', 'xp');
  }
  const note = (at: 'xp' | 'clima') => msg?.at === at && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>;

  // multiplicador: o servidor multiplica os valores base abaixo na hora de dar o XP
  const scaled = (k: keyof GameConfig) => Math.round(Number(cfg[k]) * mult * 10) / 10;
  const levels = useMemo(() => [2, 3, 5, 8, 10, 15, 20].map((l) => ({ l, xp: Math.round(xpForLevel(l, cfg)) })), [cfg]);
  const msgsTo5 = Math.ceil(xpForLevel(5, cfg) / Math.max(1, cfg.messageXp * mult));
  const now = weatherAt(weather, Date.now(), 'refugio:refugio', REFUGE_BIOME.settings.weather);

  return (
    <div className="server-studio">
      <section className="biome-form">
        <AiSettings />
        <fieldset>
          <legend>XP de vínculo</legend>
          <label>Multiplicador de XP <input type="range" min={0.5} max={10} step={0.25} value={mult} onChange={(e) => setMult(Number(e.target.value))} /> <b>{mult}×</b></label>
          <small className="hint">Vale para tudo (conversa, descobertas, memórias e combate). Com {mult}×, cada um dá: mensagem {scaled('messageXp')} · descoberta {scaled('discoveryXp')} · memória {scaled('memoryXp')} · criatura {scaled('killXp')} · 1ª vez {scaled('firstKillXp')} · análise {scaled('analysisXp')}.</small>
          <div className="grid-form">
            {XP_FIELDS.map(([k, label, hint]) => (
              <label key={k} className={values && cfg[k] !== savedCfg[k] ? 'changed' : ''}>{label}<input type="number" step={k === 'levelExp' ? 0.05 : 1} min={0} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} /><small className="hint">{hint}{values && cfg[k] !== savedCfg[k] ? ` · salvo: ${savedCfg[k]}` : ''}</small></label>
            ))}
          </div>
          <div className="xp-curve">
            {levels.map(({ l, xp }) => <span key={l}>nível {l}: <b>{xp}</b> XP</span>)}
            <small className="hint">≈ {msgsTo5} mensagens significativas até o vínculo 5 (o despertar), sem contar descobertas.</small>
          </div>
          <div className="section-foot" data-dirty={xpDiff.length > 0 || undefined}>
            {xpDiff.length > 0 && <small className="dirty-note">{xpDiff.length} mudança{xpDiff.length > 1 ? 's' : ''} não salva{xpDiff.length > 1 ? 's' : ''}</small>}
            {note('xp')}
            <button className="link" disabled={busy} onClick={() => { setCfg(DEFAULT_CONFIG); setMult(1); }} title="Preenche os valores padrão; só vale depois de salvar">usar valores padrão</button>
            <button className="ghost" disabled={busy || !xpDiff.length} onClick={() => { setCfg(savedCfg); setMult(savedMult); }}>Desfazer</button>
            <button className="primary" disabled={busy || !xpDiff.length} onClick={saveXp}>Salvar XP</button>
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
          <div className="section-foot" data-dirty={weatherDirty || undefined}>
            {weatherDirty && <small className="dirty-note">Clima não salvo</small>}
            {note('clima')}
            <button className="ghost" disabled={busy || !weatherDirty} onClick={() => setWeather(sanitizeWeather(values?.weather))}>Desfazer</button>
            <button className="primary" disabled={busy || !weatherDirty} onClick={() => { if (window.confirm(weather.mode === 'fixo' ? `Fixar o clima em ${WEATHERS[weather.fixed].label} para todos os jogadores agora?` : 'Voltar o clima para automático para todos os jogadores agora?')) void save({ weather }, weather.mode === 'fixo' ? `Clima fixo em ${WEATHERS[weather.fixed].label} para todos.` : 'Clima automático salvo.', 'clima'); }}>Salvar clima</button>
          </div>
        </fieldset>
        {msg?.at === 'geral' && <p className="msg err" role="alert">{msg.text}</p>}
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
