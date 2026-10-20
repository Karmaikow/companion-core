/**
 * Primeira forma procedural (estágio 1) gerada a partir do contrato de identidade.
 * Determinística pelo seed: o mesmo contrato sempre produz o mesmo Companion.
 * A família define a base; a descrição livre ("raposa com asas", "cachorrinho",
 * "dragão") ajusta orelhas, cauda, asas e chifres.
 */
import type { IdentityContractV1 } from '@rules';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Ears = 'pointed' | 'fox' | 'floppy' | 'long' | 'round' | 'feather' | 'horn' | 'fin' | 'mystic';
type Tail = 'fluffy' | 'thin' | 'puff' | 'spiky' | 'feather' | 'tuft' | 'serpent' | 'none';

export interface Anatomy { ears: Ears; tail: Tail; wings: boolean; wingStyle: 'feather' | 'membrane' | 'fairy'; horns: 'none' | 'pair' | 'single'; snout: boolean; mane: boolean }

/** Lê a família e a descrição para decidir a anatomia (exportado para testes visuais). */
export function anatomyFor(c: IdentityContractV1): Anatomy {
  const d = norm(c.species.description);
  const has = (...w: string[]) => w.some((x) => d.includes(x));
  const fam = c.species.family;
  const a: Anatomy = { ears: 'mystic', tail: 'none', wings: false, wingStyle: 'feather', horns: 'none', snout: false, mane: false };
  if (fam === 'felino') Object.assign(a, { ears: 'pointed', tail: 'thin' });
  if (fam === 'passaro') Object.assign(a, { ears: 'feather', tail: 'feather', wings: true });
  if (fam === 'touro') Object.assign(a, { ears: 'horn', tail: 'tuft', horns: 'pair', snout: true });
  if (fam === 'serpente') Object.assign(a, { ears: 'fin', tail: 'serpent' });
  if (fam === 'mistica') Object.assign(a, { ears: 'mystic', tail: 'none', wings: true, wingStyle: 'fairy' });
  if (has('raposa', 'kitsune', 'fox')) Object.assign(a, { ears: 'fox', tail: 'fluffy', snout: true });
  if (has('lobo', 'loba')) Object.assign(a, { ears: 'pointed', tail: 'fluffy', snout: true });
  if (has('cachorr', 'cao', 'cadela', 'filhote')) Object.assign(a, { ears: 'floppy', tail: 'thin', snout: true });
  if (has('coelh')) Object.assign(a, { ears: 'long', tail: 'puff' });
  if (has('urso')) Object.assign(a, { ears: 'round', tail: 'puff', horns: 'none' });
  if (has('leao', 'leoa')) Object.assign(a, { ears: 'round', tail: 'tuft', mane: true });
  if (has('dragao', 'draco', 'morcego', 'wyvern')) Object.assign(a, { ears: 'fin', tail: 'spiky', wings: true, wingStyle: 'membrane', horns: 'pair' });
  if (has('fada', 'borboleta', 'espirito')) a.wingStyle = 'fairy';
  if (has('coruja', 'aguia', 'passar', 'fenix', 'corvo', 'beija')) Object.assign(a, { ears: 'feather', tail: 'feather', wings: true });
  if (has('unicornio')) Object.assign(a, { horns: 'single' });
  if (has('chifre')) a.horns = a.horns === 'none' ? 'pair' : a.horns;
  if (has('asa', 'alad', 'voa')) a.wings = true;
  if (has('sem asa')) a.wings = false;
  return a;
}

export function drawCompanion(c: IdentityContractV1, size = 512, blink = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const r = rng(c.seed);
  const P = c.palette;
  const S = size / 512;
  g.scale(S, S);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const line = P.shadow;
  const stroke = (w = 7) => { g.strokeStyle = line; g.lineWidth = w; g.stroke(); };
  const A = anatomyFor(c);
  const cx = 256;
  const headY = 215, headR = 112;
  const light = '#fff8ec';

  // ---- asas (atrás de tudo) -------------------------------------------------
  if (A.wings) {
    const span = 135 + r() * 25;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx + side * 52, 318);
      g.scale(side, 1);
      g.rotate(-0.12);
      if (A.wingStyle === 'fairy') {
        // duas asas translúcidas, como de libélula
        for (const [rx, ry, rot, y] of [[78, 34, -0.55, -70], [58, 26, 0.25, -12]] as const) {
          g.beginPath(); g.ellipse(70, y, rx, ry, rot, 0, Math.PI * 2);
          g.fillStyle = P.glow + '66'; g.fill(); g.lineWidth = 4; g.strokeStyle = P.glow; g.stroke();
        }
      } else {
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(span * 0.35, -115, span * 0.95, -120, span + 8, -78);
        if (A.wingStyle === 'feather') for (let i = 0; i < 4; i++) g.quadraticCurveTo(span - 6 - i * 26, -38 + i * 14, span - 26 - i * 30, -24 + i * 22);
        else for (let i = 0; i < 3; i++) g.quadraticCurveTo(span - 30 - i * 34, -46 + i * 6, span - 40 - i * 38, -14 + i * 14);
        g.closePath();
        g.fillStyle = A.wingStyle === 'feather' ? light : P.secondary;
        g.fill();
        stroke(6);
        g.beginPath();
        if (A.wingStyle === 'membrane') { for (let i = 0; i < 3; i++) { g.moveTo(10, -10); g.lineTo(span - 30 - i * 38, -60 + i * 22); } }
        else { for (let i = 0; i < 3; i++) { g.moveTo(span * 0.3 + i * 22, -62 + i * 4); g.quadraticCurveTo(span * 0.5 + i * 20, -40, span * 0.42 + i * 22, -18 + i * 8); } }
        g.lineWidth = 3; g.strokeStyle = A.wingStyle === 'feather' ? P.secondary : line; g.stroke();
      }
      g.restore();
    }
  }

  // ---- cauda ---------------------------------------------------------------
  g.save();
  if (A.tail === 'fluffy') {
    g.beginPath();
    g.moveTo(cx + 55, 410);
    g.bezierCurveTo(cx + 175, 440, cx + 235, 330, cx + 190, 245);
    g.bezierCurveTo(cx + 165, 205, cx + 120, 235, cx + 140, 275);
    g.bezierCurveTo(cx + 170, 330, cx + 130, 380, cx + 70, 365);
    g.closePath();
    g.fillStyle = P.primary; g.fill(); stroke();
    // ponta clara
    g.beginPath();
    g.moveTo(cx + 190, 245); g.bezierCurveTo(cx + 165, 205, cx + 120, 235, cx + 140, 275);
    g.bezierCurveTo(cx + 160, 285, cx + 195, 275, cx + 190, 245);
    g.fillStyle = light; g.fill(); stroke(5);
  } else if (A.tail === 'thin') {
    g.beginPath(); g.moveTo(cx + 60, 400); g.bezierCurveTo(cx + 170, 420, cx + 190, 300, cx + 150, 260);
    g.lineWidth = 26; g.strokeStyle = line; g.stroke(); g.lineWidth = 16; g.strokeStyle = P.primary; g.stroke();
  } else if (A.tail === 'spiky') {
    g.beginPath(); g.moveTo(cx + 60, 405); g.bezierCurveTo(cx + 180, 430, cx + 215, 340, cx + 175, 300);
    g.lineWidth = 34; g.strokeStyle = line; g.stroke(); g.lineWidth = 24; g.strokeStyle = P.primary; g.stroke();
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.2, x = cx + 60 + 130 * t + 20 * t * t, y = 405 + 10 * t - 95 * t * t;
      g.beginPath(); g.moveTo(x - 10, y - 8); g.lineTo(x + 6, y - 30); g.lineTo(x + 14, y - 4); g.closePath(); g.fillStyle = P.accent; g.fill(); stroke(4);
    }
    g.beginPath(); g.moveTo(cx + 165, 300); g.lineTo(cx + 200, 270); g.lineTo(cx + 190, 315); g.closePath(); g.fillStyle = P.accent; g.fill(); stroke(5);
  } else if (A.tail === 'feather') {
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.ellipse(cx + 95 + i * 6, 395 - Math.abs(i) * 8, 16, 52, 1.1 + i * 0.35, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? P.accent : P.secondary; g.fill(); stroke(5);
    }
  } else if (A.tail === 'puff') {
    g.beginPath(); g.arc(cx + 88, 405, 28, 0, Math.PI * 2); g.fillStyle = light; g.fill(); stroke(6);
  } else if (A.tail === 'tuft') {
    g.beginPath(); g.moveTo(cx + 60, 400); g.quadraticCurveTo(cx + 125, 425, cx + 132, 372); g.lineWidth = 10; g.strokeStyle = line; g.stroke();
    g.beginPath(); g.arc(cx + 133, 362, 15, 0, Math.PI * 2); g.fillStyle = P.shadow; g.fill();
  } else if (A.tail === 'serpent') {
    g.beginPath(); g.moveTo(cx - 40, 420); g.bezierCurveTo(cx - 200, 440, cx - 210, 330, cx - 130, 320); g.bezierCurveTo(cx - 80, 315, cx - 100, 380, cx - 150, 370);
    g.lineWidth = 34; g.strokeStyle = line; g.stroke(); g.lineWidth = 24; g.strokeStyle = P.primary; g.stroke();
  }
  g.restore();

  // ---- corpo ----------------------------------------------------------------
  const bodyW = c.species.family === 'touro' ? 96 : 82;
  g.beginPath(); g.ellipse(cx, 372, bodyW, 80, 0, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke();
  g.beginPath(); g.ellipse(cx, 388, bodyW * 0.55, 52, 0, 0, Math.PI * 2); g.fillStyle = A.snout ? light : P.secondary; g.fill();
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * 48, 448, 30, 20, 0, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(6); }

  // ---- juba (atrás da cabeça) -----------------------------------------------
  if (A.mane) {
    g.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * (headR + 34), headY + Math.sin(a) * (headR + 30)); g.lineTo(cx + Math.cos(a + 0.22) * (headR + 8), headY + Math.sin(a + 0.22) * (headR + 6)); }
    g.closePath(); g.fillStyle = P.accent; g.fill(); stroke(6);
  }

  // ---- orelhas ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    g.save();
    g.translate(cx + side * 68, headY - 72);
    g.scale(side, 1);
    g.beginPath();
    if (A.ears === 'pointed' || A.ears === 'fox') {
      const h = A.ears === 'fox' ? 120 : 92 + r() * 20;
      const w = A.ears === 'fox' ? 64 : 52;
      g.moveTo(-34, 34); g.lineTo(8, -h); g.lineTo(w, 22); g.closePath();
      g.fillStyle = P.primary; g.fill(); stroke();
      g.beginPath(); g.moveTo(-14, 22); g.lineTo(10, -h + 42); g.lineTo(w - 18, 16); g.closePath(); g.fillStyle = A.ears === 'fox' ? light : P.secondary; g.fill();
      if (A.ears === 'fox') { g.beginPath(); g.moveTo(-2, -h + 30); g.lineTo(8, -h); g.lineTo(20, -h + 30); g.closePath(); g.fillStyle = P.shadow; g.fill(); }
    } else if (A.ears === 'floppy') {
      g.translate(18, 40);
      g.moveTo(0, -20); g.bezierCurveTo(55, -30, 70, 70, 40, 110); g.bezierCurveTo(15, 120, -5, 60, 0, -20);
      g.fillStyle = P.shadow; g.fill(); stroke(6);
    } else if (A.ears === 'long') {
      g.beginPath(); g.ellipse(6, -70, 24, 86, 0.12, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke();
      g.beginPath(); g.ellipse(8, -66, 11, 66, 0.12, 0, Math.PI * 2); g.fillStyle = '#ffc3d8'; g.fill();
    } else if (A.ears === 'round') {
      g.beginPath(); g.arc(4, 4, 34, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke();
      g.beginPath(); g.arc(4, 4, 18, 0, Math.PI * 2); g.fillStyle = P.secondary; g.fill();
    } else if (A.ears === 'horn') {
      g.beginPath(); g.ellipse(40, 50, 34, 20, 0.5, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(6);
    } else if (A.ears === 'feather') {
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-20 + i * 14, -30 - i * 12, 12, 46, -0.5 + i * 0.25, 0, Math.PI * 2); g.fillStyle = i === 1 ? P.accent : P.secondary; g.fill(); stroke(5); }
    } else if (A.ears === 'fin') {
      g.moveTo(0, 40); g.lineTo(70, -10); g.lineTo(50, 30); g.lineTo(80, 40); g.lineTo(30, 70); g.closePath();
      g.fillStyle = P.accent; g.fill(); stroke(6);
    } else {
      g.moveTo(10, 40); g.quadraticCurveTo(110, -10, 120, -40); g.quadraticCurveTo(80, 20, 40, 70); g.closePath();
      g.fillStyle = P.primary; g.fill(); stroke(6);
    }
    g.restore();
  }

  // ---- chifres ---------------------------------------------------------------
  if (A.horns === 'pair') {
    for (const side of [-1, 1]) {
      g.save(); g.translate(cx + side * 42, headY - 92); g.scale(side, 1);
      g.beginPath(); g.moveTo(-12, 10); g.bezierCurveTo(-4, -30, 20, -55, 34, -62); g.bezierCurveTo(26, -40, 18, -10, 14, 12); g.closePath();
      g.fillStyle = '#f3e6c8'; g.fill(); stroke(6); g.restore();
    }
  } else if (A.horns === 'single') {
    g.beginPath(); g.moveTo(cx - 14, headY - 98); g.lineTo(cx, headY - 190); g.lineTo(cx + 14, headY - 98); g.closePath();
    g.fillStyle = P.glow; g.fill(); stroke(6);
  }

  // ---- cabeça ---------------------------------------------------------------
  g.beginPath(); g.arc(cx, headY, headR, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(8);
  if (A.snout) {
    // focinho claro + "bochechas" de pelo (raposa/lobo/cachorro)
    g.beginPath();
    g.moveTo(cx - 92, headY + 20); g.quadraticCurveTo(cx - 70, headY + 95, cx, headY + 100); g.quadraticCurveTo(cx + 70, headY + 95, cx + 92, headY + 20);
    g.quadraticCurveTo(cx + 40, headY + 40, cx, headY + 30); g.quadraticCurveTo(cx - 40, headY + 40, cx - 92, headY + 20);
    g.fillStyle = light; g.fill();
    g.beginPath(); g.ellipse(cx, headY + 50, 13, 9, 0, 0, Math.PI * 2); g.fillStyle = line; g.fill();
  } else {
    g.beginPath(); g.ellipse(cx, headY + 45, 76, 56, 0, 0, Math.PI * 2); g.fillStyle = P.secondary; g.fill();
  }
  // franja
  g.beginPath();
  g.moveTo(cx - 98, headY - 40);
  for (let i = 0; i <= 5; i++) g.quadraticCurveTo(cx - 88 + i * 37, headY - 106 + (i % 2) * 20, cx - 78 + i * 35, headY - 40 - (i % 2) * 18);
  g.quadraticCurveTo(cx + 40, headY - 126, cx - 98, headY - 40);
  g.fillStyle = P.primary; g.fill();

  // ---- olhos ----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const ex = cx + side * 44, ey = headY + 12;
    if (blink) { g.beginPath(); g.moveTo(ex - 22, ey); g.quadraticCurveTo(ex, ey + 12, ex + 22, ey); g.lineWidth = 7; g.strokeStyle = line; g.stroke(); continue; }
    g.beginPath(); g.ellipse(ex, ey, 23, 30, 0, 0, Math.PI * 2); g.fillStyle = '#1b1530'; g.fill();
    const grad = g.createLinearGradient(ex, ey - 28, ex, ey + 28);
    grad.addColorStop(0, '#1b1530'); grad.addColorStop(1, P.glow);
    g.beginPath(); g.ellipse(ex, ey + 4, 17, 22, 0, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
    g.beginPath(); g.arc(ex - 7, ey - 11, 8, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.arc(ex + 8, ey + 10, 4, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.45;
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * 78, headY + 52, 16, 9, 0, 0, Math.PI * 2); g.fillStyle = '#ff7aa8'; g.fill(); }
  g.globalAlpha = 1;
  g.beginPath();
  if (A.ears === 'feather' && !A.snout) { g.moveTo(cx - 12, headY + 50); g.lineTo(cx + 12, headY + 50); g.lineTo(cx, headY + 68); g.closePath(); g.fillStyle = '#ffc04d'; g.fill(); stroke(4); }
  else { const my = A.snout ? headY + 66 : headY + 56; g.moveTo(cx - 12, my); g.quadraticCurveTo(cx - 6, my + 8, cx, my); g.quadraticCurveTo(cx + 6, my + 8, cx + 12, my); g.lineWidth = 5; g.strokeStyle = line; g.stroke(); }

  // ---- marca elemental na testa --------------------------------------------
  g.save(); g.translate(cx, headY - 60); g.rotate(Math.PI / 4);
  g.shadowColor = P.glow; g.shadowBlur = 24; g.fillStyle = P.glow; g.fillRect(-10, -10, 20, 20);
  g.restore();

  if (c.species.family === 'mistica') {
    g.beginPath(); g.ellipse(cx, headY - 148, 66, 15, 0, 0, Math.PI * 2);
    g.lineWidth = 8; g.strokeStyle = P.glow; g.shadowColor = P.glow; g.shadowBlur = 30; g.stroke(); g.shadowBlur = 0;
  }
  return cv;
}
