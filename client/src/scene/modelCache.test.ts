import { describe, expect, it } from 'vitest';
import { MODEL_CACHE_DAYS, modelCacheEvict, modelCacheFresh, modelCacheKey, shouldCacheModel } from './modelCache';

const SITE = 'https://jogo.example/';
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/companion-studio/companions/abc/model/v1-1792854601270-Mayuna-rig.glb?token=';
const DAY = 86_400_000, NOW = 1_800_000_000_000;

describe('cache local dos modelos assinados', () => {
  it('a chave ignora o token: o mesmo arquivo com endereço novo a cada sessão é um só', () => {
    expect(modelCacheKey(SIGNED + 'aaa', SITE)).toBe(modelCacheKey(SIGNED + 'bbb', SITE));
    expect(modelCacheKey(SIGNED + 'aaa', SITE)).toBe('https://x.supabase.co/storage/v1/object/sign/companion-studio/companions/abc/model/v1-1792854601270-Mayuna-rig.glb');
    // versão nova do modelo = caminho novo = outra chave (não serve o arquivo velho)
    expect(modelCacheKey(SIGNED.replace('v1-1792854601270', 'v2-1799999999999') + 'aaa', SITE)).not.toBe(modelCacheKey(SIGNED + 'aaa', SITE));
  });

  it('só guarda o que o cache do navegador não resolve: .glb de outro endereço ou com token', () => {
    expect(shouldCacheModel(SIGNED + 'aaa', SITE)).toBe(true);
    expect(shouldCacheModel('https://outro.example/modelo.glb', SITE)).toBe(true);
    expect(shouldCacheModel('/privado/corpo.glb?token=x', SITE)).toBe(true);
    // do próprio site, sem token: quem cuida é o cache do navegador (vercel.json)
    expect(shouldCacheModel('/assets/world/city/aster/forja.glb', SITE)).toBe(false);
    expect(shouldCacheModel('/rig/models/model-human.glb', SITE)).toBe(false);
    // já estão na memória, ou não são um arquivo só
    expect(shouldCacheModel('blob:https://jogo.example/123', SITE)).toBe(false);
    expect(shouldCacheModel('data:model/gltf-binary;base64,AAAA', SITE)).toBe(false);
    expect(shouldCacheModel('https://outro.example/modelo.gltf', SITE)).toBe(false);
    expect(shouldCacheModel('https://outro.example/foto.png?token=x', SITE)).toBe(false);
    expect(shouldCacheModel('ftp://outro.example/modelo.glb', SITE)).toBe(false);
  });

  it(`vale por ${MODEL_CACHE_DAYS} dias`, () => {
    expect(MODEL_CACHE_DAYS).toBeGreaterThanOrEqual(90);
    expect(modelCacheFresh(NOW - 89 * DAY, NOW)).toBe(true);
    expect(modelCacheFresh(NOW - 91 * DAY, NOW)).toBe(false);
    // carimbo ausente, inválido ou do futuro: não confia
    expect(modelCacheFresh(NaN, NOW)).toBe(false);
    expect(modelCacheFresh(NOW + DAY, NOW)).toBe(false);
  });

  it('limpeza: saem os vencidos e, passando do limite, os mais antigos', () => {
    const e: [string, number][] = [['novo', NOW - DAY], ['velho', NOW - 100 * DAY], ['sem-carimbo', NaN], ['meio', NOW - 30 * DAY], ['antigo', NOW - 80 * DAY]];
    expect(modelCacheEvict(e, NOW).sort()).toEqual(['sem-carimbo', 'velho']);
    expect(modelCacheEvict(e, NOW, 2).sort()).toEqual(['antigo', 'sem-carimbo', 'velho']);
    expect(modelCacheEvict([], NOW)).toEqual([]);
  });
});
