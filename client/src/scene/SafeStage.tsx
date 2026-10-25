/**
 * Proteção do 3D: se o navegador perde o WebGL (a placa de vídeo do celular travou) ou se recusa a criá-lo (o Chrome
 * bloqueia o 3D do site depois de travar), o jogo não fica em branco: o resto da tela continua e aparece um aviso com
 * "Tentar de novo". Depois de uma queda, o 3D volta em qualidade leve até fechar a aba.
 */
import { Component, useEffect, useState, type ReactNode } from 'react';

const LOST_KEY = 'cc-gl-lost';
/** O 3D caiu nesta aba? (aí a qualidade fica leve) */
export const glLostBefore = () => { try { return sessionStorage.getItem(LOST_KEY) === '1'; } catch { return false; } };
const markLost = () => { try { sessionStorage.setItem(LOST_KEY, '1'); } catch { /* ok */ } };

class Catch extends Component<{ onFail: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[3D] falhou', e); this.props.onFail(e); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Notice({ blocked }: { blocked: boolean }) {
  return (
    <div className="gl-down" role="alert">
      <b>O 3D parou neste navegador</b>
      <p>{blocked
        ? 'O navegador bloqueou o 3D do jogo depois que a placa de vídeo travou. Feche o Chrome por completo (tire ele da lista de apps abertos) e abra de novo.'
        : 'A placa de vídeo do aparelho travou (costuma ser falta de memória). Feche outras abas e apps e toque em tentar de novo; o jogo volta em qualidade leve.'}</p>
      <button className="primary" onClick={() => location.reload()}>Tentar de novo</button>
    </div>
  );
}

export function SafeStage({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let t = 0;
    const onLost = () => { markLost(); window.clearTimeout(t); t = window.setTimeout(() => setLost(true), 1500); };
    const onBack = () => { window.clearTimeout(t); setLost(false); };
    window.addEventListener('webglcontextlost', onLost, true);
    window.addEventListener('webglcontextrestored', onBack, true);
    return () => { window.clearTimeout(t); window.removeEventListener('webglcontextlost', onLost, true); window.removeEventListener('webglcontextrestored', onBack, true); };
  }, []);
  return (
    <>
      <Catch onFail={() => { markLost(); setFailed(true); }}>{children}</Catch>
      {(failed || lost) && <Notice blocked={failed} />}
    </>
  );
}
