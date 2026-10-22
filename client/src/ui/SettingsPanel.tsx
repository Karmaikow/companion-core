/** Ajustes: controles do mouse, mira, postura explorando sozinha, falas, voz e números de dano (neste navegador). */
import { useEffect, useState } from 'react';
import { useSettings, type Settings } from '../settings';
import { micSupported, speak, voicesPtBr } from './voice';

function Choice<K extends keyof Settings>({ k, label, options, hint }: { k: K; label: string; options: [Settings[K], string][]; hint?: string }) {
  const v = useSettings((s) => s[k]), set = useSettings((s) => s.set);
  return (
    <fieldset className="set-row">
      <legend>{label}</legend>
      <div className="chips">{options.map(([val, l]) => <button key={String(val)} type="button" className={'chip' + (v === val ? ' on' : '')} aria-pressed={v === val} onClick={() => set({ [k]: val } as Partial<Settings>)}>{l}</button>)}</div>
      {hint && <small className="hint">{hint}</small>}
    </fieldset>
  );
}

export function SettingsPanel() {
  const s = useSettings();
  const [voices, setVoices] = useState(voicesPtBr());
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const up = () => setVoices(voicesPtBr());
    speechSynthesis.addEventListener('voiceschanged', up); up();
    return () => speechSynthesis.removeEventListener('voiceschanged', up);
  }, []);
  return (
    <div className="settings">
      <h3>Controles</h3>
      <Choice k="click" label="Clique esquerdo no chão" options={[['andar', 'Anda até lá'], ['atacar', 'Ataca']]} hint={s.click === 'atacar' ? 'Com o clique atacando, o clique direito anda.' : 'Ataque com F (segure para carregar o arco).'} />
      <Choice k="attackAim" label="Mira do ataque (PC)" options={[['mouse', 'Para onde o mouse aponta'], ['alvo', 'Monstro mais perto']]} />
      <Choice k="skillAim" label="Mira das habilidades (1–9)" options={[['mouse', 'Para onde o mouse aponta'], ['alvo', 'Monstro mais perto']]} />
      <small className="hint">Teclado: WASD anda (corre; Shift anda devagar) · F ataca · Espaço pula · E defende · C senta · 1–9 habilidades · segure V para falar.</small>

      <h3>Ela sozinha</h3>
      <Choice k="posture" label="Explorando sozinha, ela…" options={[['pacifica', 'Só passeia'], ['defensiva', 'Se defende'], ['cacadora', 'Caça monstros']]} hint="Ela sempre obedece às ordens no chat: “ataque!”, “fuja!”, “mate 10 monstros na Floresta Densa”, “vá até a Montanha Azul e me chame quando chegar”." />
      <Choice k="fleeAt" label="Foge quando a vida cai abaixo de" options={[[0, 'Nunca'], [0.2, '20%'], [0.3, '30%'], [0.5, '50%']]} />
      <Choice k="chatter" label="Quanto ela comenta sozinha" options={[['muito', 'Muito'], ['normal', 'Normal'], ['pouco', 'Pouco'], ['nunca', 'Nunca']]} />
      <Choice k="ordersToChat" label="Ordens no chat também vão para a conversa" options={[[true, 'Sim (ela responde do jeito dela)'], [false, 'Não (só obedece)']]} />

      <h3>Voz</h3>
      <Choice k="voiceOut" label="Ouvir as respostas dela em voz alta" options={[[true, 'Ligado'], [false, 'Desligado']]} />
      {s.voiceOut && (
        <fieldset className="set-row">
          <legend>Voz</legend>
          <div className="row">
            <select value={s.voiceName} onChange={(e) => s.set({ voiceName: e.target.value })} aria-label="Voz">
              <option value="">Automática ({voices.length ? 'português do Brasil' : 'nenhuma voz pt-BR neste navegador'})</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
            <button type="button" className="ghost" onClick={() => speak('Oi! Assim fica a minha voz.')}>Ouvir</button>
          </div>
          <small className="hint">As vozes são as do seu navegador/sistema (no Chrome e no Edge há vozes em português melhores).</small>
        </fieldset>
      )}
      <Choice k="voiceAutoSend" label="Microfone: ao terminar de falar" options={[[true, 'Envia sozinho'], [false, 'Deixa na caixa']]} hint={micSupported() ? 'Toque no 🎙 da conversa ou segure V em qualquer lugar.' : 'Este navegador não reconhece fala (use Chrome ou Edge).'} />

      <h3>Tela</h3>
      <Choice k="damageNumbers" label="Números de dano" options={[[true, 'Mostrar'], [false, 'Esconder']]} />
      <button type="button" className="link" onClick={() => s.reset()}>voltar tudo ao padrão</button>
    </div>
  );
}
