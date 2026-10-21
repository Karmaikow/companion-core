/**
 * Aparência no shader (matiz, saturação, luz, contraste, tinta, brilho próprio) para materiais dos .GLB.
 * Encadeia com o vento (withWind): os dois mexem no mesmo onBeforeCompile.
 * Os valores ficam em uniforms: mexer nos controles do Estúdio não recompila o shader.
 */
import * as THREE from 'three';
import type { ModelLook } from '@rules';

export interface LookUniforms {
  uHue: { value: number }; uSat: { value: number }; uLight: { value: number }; uContrast: { value: number };
  uTint: { value: THREE.Color }; uTintAmt: { value: number }; uGlow: { value: number };
}

export function lookUniforms(): LookUniforms {
  return { uHue: { value: 0 }, uSat: { value: 1 }, uLight: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Color('#ffffff') }, uTintAmt: { value: 0 }, uGlow: { value: 0 } };
}

export function setLook(u: LookUniforms, l?: ModelLook) {
  u.uHue.value = ((l?.hue ?? 0) * Math.PI) / 180;
  u.uSat.value = l?.sat ?? 1;
  u.uLight.value = l?.light ?? 1;
  u.uContrast.value = l?.contrast ?? 1;
  u.uTint.value.set(l?.tint ?? '#ffffff');
  u.uTintAmt.value = l?.tintAmount ?? 0;
  u.uGlow.value = l?.glow ?? 0;
}

const HEADER = `
uniform float uHue; uniform float uSat; uniform float uLight; uniform float uContrast;
uniform vec3 uTint; uniform float uTintAmt; uniform float uGlow;
vec3 lookHue(vec3 c, float a) {
  // giro de matiz no espaço YIQ (barato e estável)
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c; float ca = cos(a), sa = sin(a);
  yiq.yz = vec2(yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}
`;

const BODY = `
  {
    vec3 lc = diffuseColor.rgb;
    if (uHue != 0.0) lc = lookHue(lc, uHue);
    float lum = dot(lc, vec3(0.299, 0.587, 0.114));
    lc = mix(vec3(lum), lc, uSat);
    lc = (lc - 0.5) * uContrast + 0.5;
    lc *= uLight;
    lc = mix(lc, lc * uTint * 1.6 + uTint * 0.12, uTintAmt);
    diffuseColor.rgb = clamp(lc, 0.0, 4.0);
  }
`;

/** Liga a aparência a um material (antes ou depois do vento, tanto faz). */
export function withLook<T extends THREE.Material>(m: T, u: LookUniforms): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    Object.assign(s.uniforms, u);
    s.fragmentShader = HEADER + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uTint * uGlow * (0.35 + diffuseColor.rgb);');
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '+look';
  return m;
}
