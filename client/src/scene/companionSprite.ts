/**
 * Primeira forma procedural (estágio 1) gerada a partir do contrato de identidade.
 * Determinística pelo seed: o mesmo contrato sempre produz o mesmo Companion,
 * o que garante consistência visual mesmo antes da arte final do Studio.
 */
import type { IdentityContractV1 } from '@rules';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
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
  const fam = c.species.family;
  const cx = 256;

  // ---- atrás do corpo -------------------------------------------------------
  if (fam === 'passaro' || fam === 'mistica') {
    const span = fam === 'passaro' ? 150 + r() * 30 : 120;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx + side * 40, 300);
      g.scale(side, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(span * 0.5, -120, span, -110, span + 10, -60);
      for (let i = 0; i < 4; i++) g.quadraticCurveTo(span - i * 25, -40 + i * 18, span - 20 - i * 30, -30 + i * 30);
      g.closePath();
      g.fillStyle = fam === 'mistica' ? P.glow + 'aa' : P.secondary;
      g.fill();
      stroke(6);
      g.restore();
    }
  }
  if (fam === 'felino') {
    g.beginPath();
    g.moveTo(cx + 60, 400);
    g.bezierCurveTo(cx + 190, 420, cx + 200, 260, cx + 150, 230);
    g.bezierCurveTo(cx + 175, 300, cx + 150, 370, cx + 70, 370);
    g.closePath();
    g.fillStyle = P.primary; g.fill(); stroke();
    g.beginPath(); g.ellipse(cx + 152, 240, 22, 26, 0.4, 0, Math.PI * 2); g.fillStyle = P.secondary; g.fill(); stroke(5);
  }
  if (fam === 'serpente') {
    g.beginPath();
    g.moveTo(cx - 40, 420);
    g.bezierCurveTo(cx - 200, 440, cx - 210, 330, cx - 130, 320);
    g.bezierCurveTo(cx - 80, 315, cx - 100, 380, cx - 150, 370);
    g.lineWidth = 34; g.strokeStyle = line; g.stroke();
    g.lineWidth = 24; g.strokeStyle = P.primary; g.stroke();
  }
  if (fam === 'touro') {
    g.beginPath(); g.moveTo(cx + 60, 400); g.quadraticCurveTo(cx + 120, 420, cx + 130, 370); g.lineWidth = 10; g.strokeStyle = line; g.stroke();
    g.beginPath(); g.arc(cx + 132, 362, 14, 0, Math.PI * 2); g.fillStyle = P.shadow; g.fill();
  }

  // ---- corpo ----------------------------------------------------------------
  const bodyW = fam === 'touro' ? 98 : 84;
  g.beginPath();
  g.ellipse(cx, 370, bodyW, 82, 0, 0, Math.PI * 2);
  g.fillStyle = P.primary; g.fill(); stroke();
  g.beginPath(); g.ellipse(cx, 385, bodyW * 0.55, 55, 0, 0, Math.PI * 2); g.fillStyle = P.secondary; g.fill();
  // patinhas
  for (const side of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + side * 48, 448, 30, 20, 0, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(6);
  }

  // ---- orelhas / chifres ----------------------------------------------------
  const headY = 215, headR = 118;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(cx + side * 70, headY - 70);
    g.scale(side, 1);
    g.beginPath();
    if (fam === 'felino') {
      const h = 90 + r() * 30;
      g.moveTo(-30, 30); g.lineTo(10, -h); g.lineTo(55, 20); g.closePath();
      g.fillStyle = P.primary; g.fill(); stroke();
      g.beginPath(); g.moveTo(-10, 20); g.lineTo(12, -h + 40); g.lineTo(38, 15); g.closePath(); g.fillStyle = P.secondary; g.fill();
    } else if (fam === 'touro') {
      g.moveTo(0, 10); g.bezierCurveTo(40, -20, 70, -60, 50, -100); g.bezierCurveTo(40, -60, 20, -40, -10, -15); g.closePath();
      g.fillStyle = '#f3e6c8'; g.fill(); stroke(6);
      g.beginPath(); g.ellipse(40, 50, 34, 20, 0.5, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(6);
    } else if (fam === 'passaro') {
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.ellipse(-20 + i * 14, -30 - i * 12, 12, 46, -0.5 + i * 0.25, 0, Math.PI * 2);
        g.fillStyle = i === 1 ? P.accent : P.secondary; g.fill(); stroke(5);
      }
    } else if (fam === 'serpente') {
      g.moveTo(0, 40); g.lineTo(70, -10); g.lineTo(50, 30); g.lineTo(80, 40); g.lineTo(30, 70); g.closePath();
      g.fillStyle = P.accent; g.fill(); stroke(6);
    } else {
      g.moveTo(10, 40); g.quadraticCurveTo(110, -10, 120, -40); g.quadraticCurveTo(80, 20, 40, 70); g.closePath();
      g.fillStyle = P.primary; g.fill(); stroke(6);
    }
    g.restore();
  }

  // ---- cabeça ---------------------------------------------------------------
  g.beginPath(); g.arc(cx, headY, headR, 0, Math.PI * 2); g.fillStyle = P.primary; g.fill(); stroke(8);
  g.beginPath(); g.ellipse(cx, headY + 45, 78, 58, 0, 0, Math.PI * 2); g.fillStyle = P.secondary; g.fill();
  // franja
  g.beginPath();
  g.moveTo(cx - 100, headY - 40);
  for (let i = 0; i <= 5; i++) g.quadraticCurveTo(cx - 90 + i * 38, headY - 110 + (i % 2) * 20, cx - 80 + i * 36, headY - 40 - (i % 2) * 18);
  g.quadraticCurveTo(cx + 40, headY - 130, cx - 100, headY - 40);
  g.fillStyle = P.primary; g.fill();

  // ---- olhos ----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const ex = cx + side * 46, ey = headY + 18;
    if (blink) {
      g.beginPath(); g.moveTo(ex - 22, ey); g.quadraticCurveTo(ex, ey + 12, ex + 22, ey); g.lineWidth = 7; g.strokeStyle = line; g.stroke();
      continue;
    }
    g.beginPath(); g.ellipse(ex, ey, 24, 32, 0, 0, Math.PI * 2); g.fillStyle = '#1b1530'; g.fill();
    const grad = g.createLinearGradient(ex, ey - 30, ex, ey + 30);
    grad.addColorStop(0, '#1b1530'); grad.addColorStop(1, P.glow);
    g.beginPath(); g.ellipse(ex, ey + 4, 18, 24, 0, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
    g.beginPath(); g.arc(ex - 7, ey - 12, 8, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.arc(ex + 8, ey + 10, 4, 0, Math.PI * 2); g.fill();
  }
  // bochechas e boca
  g.globalAlpha = 0.45;
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * 80, headY + 58, 16, 9, 0, 0, Math.PI * 2); g.fillStyle = '#ff7aa8'; g.fill(); }
  g.globalAlpha = 1;
  g.beginPath();
  if (fam === 'passaro') { g.moveTo(cx - 12, headY + 52); g.lineTo(cx + 12, headY + 52); g.lineTo(cx, headY + 70); g.closePath(); g.fillStyle = '#ffc04d'; g.fill(); stroke(4); }
  else { g.moveTo(cx - 12, headY + 58); g.quadraticCurveTo(cx - 6, headY + 66, cx, headY + 58); g.quadraticCurveTo(cx + 6, headY + 66, cx + 12, headY + 58); g.lineWidth = 5; g.strokeStyle = line; g.stroke(); }

  // ---- marca elemental na testa --------------------------------------------
  g.save();
  g.translate(cx, headY - 62);
  g.rotate(Math.PI / 4);
  g.shadowColor = P.glow; g.shadowBlur = 24;
  g.fillStyle = P.glow; g.fillRect(-11, -11, 22, 22);
  g.restore();

  if (fam === 'mistica') {
    g.beginPath(); g.ellipse(cx, headY - 150, 70, 16, 0, 0, Math.PI * 2);
    g.lineWidth = 8; g.strokeStyle = P.glow; g.shadowColor = P.glow; g.shadowBlur = 30; g.stroke(); g.shadowBlur = 0;
  }
  return cv;
}
