import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Assoalho de tábuas pintado (aspecto "pintado à mão" do HD-2D). */
export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rand(7);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 200;
    while (x < 512) {
      const w = 140 + r() * 180;
      const l = 30 + r() * 10;
      g.fillStyle = `hsl(${24 + r() * 8}, ${38 + r() * 12}%, ${l}%)`;
      g.fillRect(x, i * 64, w, 64);
      g.strokeStyle = 'rgba(40,20,10,.55)'; g.lineWidth = 3; g.strokeRect(x, i * 64, w, 64);
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(60,30,15,${0.1 + r() * 0.15})`; g.lineWidth = 1;
        g.beginPath(); const y = i * 64 + 8 + r() * 48; g.moveTo(x + 4, y); g.bezierCurveTo(x + w * 0.3, y + r() * 6 - 3, x + w * 0.6, y + r() * 6 - 3, x + w - 4, y); g.stroke();
      }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Parede de pedra com reboco gasto. */
export function stoneTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rand(11);
  g.fillStyle = '#3a3a4a'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 48) {
    let x = (y / 48) % 2 ? -40 : 0;
    while (x < 512) {
      const w = 70 + r() * 50;
      g.fillStyle = `hsl(${220 + r() * 30}, ${8 + r() * 10}%, ${26 + r() * 10}%)`;
      g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, 42, 8); g.fill();
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Círculo mágico com runas desenhadas. */
export function runeTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  g.translate(512, 512);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  for (const [rad, w] of [[490, 10], [440, 4], [300, 6], [260, 3]] as const) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); }
  g.font = '44px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < glyphs.length; i++) {
    const a = (i / glyphs.length) * Math.PI * 2;
    g.save(); g.rotate(a); g.fillText(glyphs[i], 0, -465); g.restore();
  }
  g.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + k * Math.PI; g.lineTo(Math.sin(a) * 440, -Math.cos(a) * 440); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ponto redondo e macio para as partículas (em vez do quadrado padrão). */
let dotTex: THREE.Texture | null = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
