/** Ajustes: controles do mouse, mira, postura explorando sozinha, falas, voz e números de dano (neste navegador). */
import { useEffect, useState } from 'react';
import { useSettings, type Settings } from '../settings';
import { useGame } from '../store';
import { useHud } from './hudLayout';
import { useTouchLandscape } from './TouchControls';
import { VOICE_OUT_ENABLED, micSupported, speak, voiceGender, voicesPtBr } from './voice';

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
  const touch = useTouchLandscape();
  const customHud = useHud((h) => Object.keys(h.pos).length > 0 || h.size !== 1);
  const he = useGame((g) => g.snap?.companion?.discoveries.pronoun === 'ele');
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
      <small className="hint">Teclado: WASD anda (corre; Shift anda devagar) · F ataca · Espaço pula · E defende · C senta · 1–9 habilidades (Shift + 1–9 segura para concentrar: até 2,5 s, dano até ×2) · segure V para falar.</small>

      <h3>Ela sozinha</h3>
      <Choice k="posture" label="Explorando sozinha, ela…" options={[['pacifica', 'Só passeia'], ['defensiva', 'Se defende'], ['cacadora', 'Caça monstros']]} hint="Ela sempre obedece às ordens no chat: “ataque!”, “fuja!”, “mate 10 monstros na Floresta Densa”, “vá até a Montanha Azul e me chame quando chegar”." />
      <Choice k="fleeAt" label="Foge quando a vida cai abaixo de" options={[[0, 'Nunca'], [0.2, '20%'], [0.3, '30%'], [0.5, '50%']]} />
      <Choice k="barkSource" label="As falas dela no jogo" options={[['ia', 'Escritas pela IA, no jeito dela'], ['prontas', 'Frases prontas']]} hint="Com a IA, ela varia as falas e comenta cada criatura nova, a análise e as missões com o que sabe. Precisa estar online; sem conexão, usa as prontas." />
      <Choice k="chatter" label="Quanto ela comenta sozinha" options={[['muito', 'Muito'], ['normal', 'Normal'], ['pouco', 'Pouco'], ['nunca', 'Nunca']]} />
      <Choice k="ordersToChat" label="Ordens no chat também vão para a conversa" options={[[true, 'Sim (ela responde do jeito dela)'], [false, 'Não (só obedece)']]} />

      <h3>Voz</h3>
      {VOICE_OUT_ENABLED && (<>
      <Choice k="voiceOut" label="Ouvir a voz dela (respostas e falas no jogo)" options={[[true, 'Ligado'], [false, 'Desligado']]} hint={he ? 'Voz de menino.' : 'Voz de menina.'} />
      {s.voiceOut && (
        <fieldset className="set-row">
          <legend>Voz</legend>
          <div className="row">
            <select value={s.voiceName} onChange={(e) => s.set({ voiceName: e.target.value })} aria-label="Voz">
              <option value="">Automática ({voices.length ? (he ? 'voz de menino' : 'voz de menina') : 'nenhuma voz pt-BR neste navegador'})</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name}{voiceGender(v) ? ` · ${voiceGender(v)}` : ''}</option>)}
            </select>
            <button type="button" className="ghost" onClick={() => speak(he ? 'Oi! Assim fica a minha voz. Bora explorar?' : 'Oi! Assim fica a minha voz. Bora explorar?', { force: true })}>Ouvir</button>
          </div>
          <small className="hint">As vozes são as do seu navegador/sistema. Sem uma voz masculina em português no aparelho, a voz de menino usa a feminina num tom mais grave (no Edge há vozes melhores, como Antonio e Francisca).</small>
        </fieldset>
      )}
      </>)}
      <Choice k="micMode" label="Microfone (🎙 da conversa)" options={[['sempre', 'Fica ligado (conversa por voz)'], ['uma', 'Ouve uma frase só']]} hint={micSupported() ? 'Ligado, ele escuta sem parar e envia cada frase; pausa enquanto ela fala. Segure V em qualquer lugar para falar uma frase.' : 'Este navegador não reconhece fala (use Chrome ou Edge).'} />
      {s.micMode === 'uma' && <Choice k="voiceAutoSend" label="Ao terminar a frase" options={[[true, 'Envia sozinho'], [false, 'Deixa na caixa']]} />}

      <h3>Tela</h3>
      <fieldset className="set-row">
        <legend>Botões de ação (celular deitado)</legend>
        <div className="chips">
          <button type="button" className="chip on" disabled={!touch} onClick={() => useHud.getState().edit(true)}>Editar posição dos botões</button>
          {customHud && <button type="button" className="chip" onClick={() => useHud.getState().reset()}>Voltar ao padrão</button>}
        </div>
        <small className="hint">{touch ? 'Arraste ataque, pular, defender, sentar e as habilidades para onde ficar melhor para o dedo; dá para mudar o tamanho também.' : 'Disponível no celular deitado, onde os botões aparecem na tela.'}</small>
      </fieldset>
      <Choice k="damageNumbers" label="Números de dano" options={[[true, 'Mostrar'], [false, 'Esconder']]} />
      <button type="button" className="link" onClick={() => s.reset()}>voltar tudo ao padrão</button>
    </div>
  );
}
