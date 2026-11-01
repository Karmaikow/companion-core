import { Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { VfxStore } from './engine';
import type { CatalogueRuntime } from './catalogueRuntime.js';

/**
 * `warm`: ids do catálogo que esta cena vai usar (as habilidades na barra). Com eles, o motor nasce junto com a
 * cena e compila os efeitos antes — sem isso, o primeiro uso de cada efeito trava a tela por segundos.
 */
export function CatalogueRenderer({ store, timeScale = 1, warm, lights = true, volumeQuality = 1 }: { store: VfxStore; timeScale?: number; warm?: string[]; lights?: boolean; volumeQuality?: number }) {
  const { scene, camera, gl } = useThree();
  const [error, setError] = useState('');
  const runtime = useRef<CatalogueRuntime | null>(null), loading = useRef<Promise<CatalogueRuntime | null> | null>(null);
  useEffect(() => () => { runtime.current?.dispose(); runtime.current = null; loading.current = null; }, [scene, camera]);
  useEffect(() => {
    let alive = true;
    store.loadCatalogue = () => {
      if (loading.current || runtime.current) return loading.current;
      loading.current = import('./catalogueRuntime.js').then(({ CatalogueRuntime }) => {
        if (!alive) return null;
        runtime.current = new CatalogueRuntime(scene, camera, gl, { lights, volumeQuality });
        return runtime.current;
      }).catch((e) => { console.error('Falha ao carregar catálogo VFX', e); if (alive) setError('Não foi possível carregar o efeito. Selecione novamente para tentar.'); loading.current = null; return null; });
      return loading.current;
    };
    return () => { alive = false; loading.current = null; store.loadCatalogue = undefined; };
  }, [store, scene, camera, gl, lights, volumeQuality]);

  const warmKey = (warm ?? []).join(',');
  useEffect(() => {
    if (!warmKey) return;
    const ids = warmKey.split(',');
    void Promise.resolve(runtime.current ?? store.loadCatalogue?.()).then((rt) => (rt as CatalogueRuntime | null | undefined)?.warm(ids));
  }, [warmKey, store]);

  useFrame((_, dt) => {
    if (store.catalogueQueue.length || store.warmQueue.size) store.loadCatalogue?.();
    if (!runtime.current) return;
    if (store.warmQueue.size) { const ids = [...store.warmQueue]; store.warmQueue.clear(); void runtime.current.warm(ids); }
    if (timeScale > 0) for (const request of store.catalogueQueue.splice(0)) void runtime.current.cast(request).catch((e) => { console.error('Falha no efeito VFX', request.id, e); setError('Falha ao preparar o efeito ' + request.id); });
    runtime.current.update(Math.min(dt, 0.05) * timeScale, gl.domElement.width, gl.domElement.height);
  });
  return error ? <Html center><p role="alert" style={{ background: '#291c28', padding: 12, color: 'white', width: 240 }}>{error}</p></Html> : null;
}
