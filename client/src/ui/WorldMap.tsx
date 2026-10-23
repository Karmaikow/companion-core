/** Mapa do Companion World: as regiões em volta (ou o mundo inteiro, ampliado), trilhas, pedras-guia e o Companion. */
import { useEffect, useRef, useState } from 'react';
import { WORLD_R, type CompanionWorld } from '@rules';
import { companionFocus } from '../scene/world';

export function WorldMap({ world, discovered }: { world: CompanionWorld; discovered: Set<string> }) {
  const base = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLCanvasElement>(null);
  const [big, setBig] = useState(false);
  const SIZE = big ? 300 : 150;
  const span = big ? WORLD_R * 2.1 : 260; // metros mostrados de ponta a ponta

  // fundo: cor de cada região + trilhas (refeito quando o Companion anda um bom pedaço)
  useEffect(() => {
    let last = { x: Infinity, z: Infinity };
    const draw = () => {
      const cvs = base.current; if (!cvs) return;
      const cx = big ? 0 : companionFocus.x, cz = big ? 0 : companionFocus.z;
      if (Math.hypot(cx - last.x, cz - last.z) < 12) return;
      last = { x: cx, z: cz };
      const g = cvs.getContext('2d')!, N = 75, img = g.createImageData(N, N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = cx + (i / N - 0.5) * span, z = cz + (j / N - 0.5) * span;
        const edge = Math.max(Math.abs(x), Math.abs(z)) > WORLD_R - 18;
        const hit = world.regionAt(x, z), pal = world.biomes[hit.site.biome].palette;
        let [r, gg, b] = hex(world.dirtAt(x, z) > 0.5 ? pal.dirt : world.forestAt(x, z) > 0.6 ? pal.grassDark : pal.grassLight);
        if (hit.edge < 2.5) { r *= 0.82; gg *= 0.82; b *= 0.82; }
        if (edge) [r, gg, b] = hex(pal.rockSide);
        const o = (j * N + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.clearRect(0, 0, SIZE, SIZE); g.drawImage(tmp, 0, 0, N, N, 0, 0, SIZE, SIZE);
    };
    draw();
    const t = setInterval(draw, 700);
    return () => clearInterval(t);
  }, [world, big, SIZE, span]);

  // por cima: portal, pedras-guia e o Companion (todo quadro)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cvs = top.current; if (!cvs) return;
      const g = cvs.getContext('2d')!, cx = big ? 0 : companionFocus.x, cz = big ? 0 : companionFocus.z, k = SIZE / span;
      const P = (x: number, z: number) => [SIZE / 2 + (x - cx) * k, SIZE / 2 + (z - cz) * k];
      g.clearRect(0, 0, SIZE, SIZE);
      for (const s of world.sites) {
        const [x, y] = P(s.x, s.z);
        if (x < -6 || y < -6 || x > SIZE + 6 || y > SIZE + 6) continue;
        g.beginPath();
        if (s.home) { g.fillStyle = '#ffffff'; g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7a6bd0'; g.lineWidth = 2; g.stroke(); continue; }
        const lit = discovered.has(s.name);
        g.fillStyle = lit ? '#ffd56b' : 'rgba(40,36,70,0.55)';
        g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.closePath(); g.fill();
        if (big && lit) { g.font = '11px "Alegreya Sans", sans-serif'; g.fillStyle = '#1b1830'; g.fillText(s.name, x + 6, y + 4); }
      }
      const [x, y] = P(companionFocus.x, companionFocus.z);
      g.beginPath(); g.fillStyle = '#ff7a9a'; g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [world, discovered, big, SIZE, span]);

  const found = world.sites.filter((s) => !s.home && discovered.has(s.name)).length;
  return (
    <button className={'world-map' + (big ? ' big' : '')} onClick={() => setBig(!big)} aria-label={big ? 'Diminuir o mapa' : 'Ampliar o mapa'} style={{ width: SIZE, height: SIZE }} aria-expanded={big}>
      <span className="compass-n" aria-hidden="true">N</span><span className="compass-s" aria-hidden="true">S</span><span className="compass-e" aria-hidden="true">L</span><span className="compass-w" aria-hidden="true">O</span>
      <canvas ref={base} width={SIZE} height={SIZE} />
      <canvas ref={top} width={SIZE} height={SIZE} />
      <span className="map-count">{found}/{world.sites.length - 1} lugares</span>
    </button>
  );
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

