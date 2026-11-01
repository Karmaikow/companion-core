/**
 * Recursos de coleta do mundo aberto no cliente: o Companion World atual (posto pela cena do mundo) e o clima do ADM.
 * Os recursos vêm de shared/rules/ecosWorld.ts (os mesmos que o servidor recalcula pelo id).
 */
import { worldNodeById, nodesNear, nodeAvailable, nodeEnvAt, DEFAULT_WEATHER, type CompanionWorld, type WorldNode, type WeatherConfig, type NodeEnv } from '@rules';

let world: CompanionWorld | null = null;
let weatherCfg: WeatherConfig = DEFAULT_WEATHER;
let env: { at: number; v: NodeEnv } | null = null;

export function setEcosWorld(w: CompanionWorld | null, cfg?: WeatherConfig) {
  world = w; env = null;
  if (cfg) weatherCfg = cfg;
}
export const ecosWorld = () => world;

/** horário e clima de agora (refeito a cada 20 s) */
export function envNow(): NodeEnv | null {
  if (!world) return null;
  const now = Date.now();
  if (!env || now - env.at > 20_000) env = { at: now, v: nodeEnvAt(world, now, weatherCfg) };
  return env.v;
}

export function findNode(id: string): WorldNode | null {
  return world ? worldNodeById(world, id) : null;
}
export function isAvailable(n: WorldNode): boolean {
  const e = envNow();
  return !e || nodeAvailable(n, e);
}
/** Recursos à vista (horário e clima) até `r` metros. */
export function availableNear(x: number, z: number, r: number): WorldNode[] {
  if (!world) return [];
  const e = envNow()!;
  return nodesNear(world, x, z, r).filter((n) => nodeAvailable(n, e));
}
