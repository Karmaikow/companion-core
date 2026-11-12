import type { WeatherKind } from '@rules';

/** Clima em vigor agora (a cena escreve, a interface lê). Sem three nem r3f: a interface não puxa o 3D por causa dele. */
export const weatherNow = { kind: 'limpo' as WeatherKind, k: 0, flash: 0 };
