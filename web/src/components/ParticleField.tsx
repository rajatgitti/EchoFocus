"use client";

/**
 * Full-screen WebGL backdrop: a particle-cloud bust whose "voice rings" ripple
 * outward from the mouth. The whole figure is generated procedurally from a
 * signed distance field, so no 3D model has to be downloaded.
 *
 * The `mode` prop drives the animation:
 *   idle    – slow ambient rings
 *   running – fast rings and particles lifting off the surface (separation)
 *   done    – a single burst from the mouth, then settle
 *   error   – rings shift to a warm red
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type FieldMode = "idle" | "running" | "done" | "error";

/* ------------------------------------------------------------------ */
/* Procedural bust (signed distance field)                             */
/* ------------------------------------------------------------------ */

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function ell(
  x: number, y: number, z: number,
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number,
): number {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function capsule(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): number {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Head + neck + shoulders, face toward +z, up +y. Units ≈ head height 2. */
function bust(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.38, -0.12, 0.8, 0.92, 0.95);                    // cranium
  d = smin(d, ell(x, y, z, 0, -0.22, 0.16, 0.6, 0.66, 0.66), 0.3);           // face mass
  d = smin(d, ell(x, y, z, 0, -0.74, 0.36, 0.3, 0.2, 0.24), 0.18);           // chin
  d = smin(d, ell(ax, y, z, 0.42, -0.52, 0.12, 0.22, 0.2, 0.36), 0.2);       // jaw angle
  d = smin(d, ell(x, y, z, 0, 0.24, 0.6, 0.56, 0.13, 0.22), 0.14);           // brow ridge
  d = smin(d, ell(ax, y, z, 0.38, -0.08, 0.5, 0.2, 0.16, 0.2), 0.14);        // cheekbones
  d = smin(d, ell(x, y, z, 0, -0.02, 0.82, 0.1, 0.25, 0.16), 0.08);          // nose bridge
  d = smin(d, ell(x, y, z, 0, -0.2, 0.88, 0.13, 0.08, 0.1), 0.06);           // nose tip
  d = smin(d, ell(x, y, z, 0, -0.43, 0.72, 0.21, 0.06, 0.1), 0.05);          // upper lip
  d = smin(d, ell(x, y, z, 0, -0.53, 0.7, 0.18, 0.06, 0.1), 0.05);           // lower lip
  d = smax(d, -ell(ax, y, z, 0.26, 0.06, 0.76, 0.14, 0.09, 0.12), 0.08);     // eye sockets
  d = smin(d, ell(ax, y, z, 0.26, 0.05, 0.68, 0.09, 0.06, 0.07), 0.03);      // eyes
  d = smin(d, ell(ax, y, z, 0.8, 0.0, -0.06, 0.08, 0.26, 0.17), 0.08);       // ears
  d = smin(d, capsule(x, y, z, 0, -0.55, -0.2, 0, -1.9, -0.1, 0.43), 0.35);  // neck
  d = smin(d, ell(x, y, z, 0, -2.15, -0.15, 1.95, 0.5, 0.78), 0.45);         // shoulders
  d = smin(d, ell(x, y, z, 0, -2.75, 0.05, 1.75, 0.75, 0.85), 0.3);          // chest
  return Math.max(d, -3.0 - y);                                              // flat base
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleBust(count: number) {
  const rnd = mulberry32(7);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  const BAND = 0.035;
  const e = 0.004;
  let n = 0;
  let tries = 0;
  const maxTries = count * 160;

  while (n < count && tries < maxTries) {
    tries++;
    const x = -2.1 + rnd() * 4.2;
    const y = -3.0 + rnd() * 4.35;
    const z = -1.15 + rnd() * 2.4;
    const d = bust(x, y, z);
    if (Math.abs(d) > BAND) continue;
    // Thin out the shoulders so the head carries the visual weight.
    if (y < -1.3 && rnd() > 0.42) continue;

    let nx = bust(x + e, y, z) - bust(x - e, y, z);
    let ny = bust(x, y + e, z) - bust(x, y - e, z);
    let nz = bust(x, y, z + e) - bust(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;

    const py = y - ny * d;
    if (py < -2.95) continue; // skip the flat base plane

    pos[n * 3] = x - nx * d;
    pos[n * 3 + 1] = py;
    pos[n * 3 + 2] = z - nz * d;
    nor[n * 3] = nx;
    nor[n * 3 + 1] = ny;
    nor[n * 3 + 2] = nz;
    rand[n * 4] = rnd();
    rand[n * 4 + 1] = rnd();
    rand[n * 4 + 2] = rnd();
    rand[n * 4 + 3] = rnd();
    n++;
  }
  return { pos, nor, rand, count: n };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const BUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRingT;
  uniform float uRingStrength;
  uniform float uScatter;
  uniform float uPulse;
  uniform float uIntro;
  uniform float uDim;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uOrigin;

  attribute vec3 aNormal;
  attribute vec4 aRand;

  varying float vBand;
  varying float vAlpha;
  varying float vRim;

  float rings(float d) {
    float b = 0.0;
    for (int i = 0; i < 3; i++) {
      float ph = fract(uRingT + float(i) / 3.0);
      float r = ph * 4.4;
      float w = 0.14 + ph * 0.28;
      float band = 1.0 - smoothstep(0.0, w, abs(d - r));
      b += band * (1.0 - ph) * smoothstep(0.0, 0.08, ph);
    }
    return b;
  }

  void main() {
    vec3 p = position;
    vec3 drift = aRand.xyz - 0.5;
    float d = distance(p, uOrigin);
    float band = rings(d) * uRingStrength;

    // gentle surface shimmer
    float shimmer = sin(uTime * 0.8 + aRand.x * 6.2831 + p.y * 1.5) * 0.5 + 0.5;
    p += aNormal * (band * 0.14 + shimmer * 0.008);
    p += drift * band * 0.22;

    // separation: particles lift off the surface and swirl
    float s = uScatter * (0.35 + aRand.w);
    float sw = uTime * 0.6 + aRand.w * 6.2831;
    p += aNormal * s * 0.9 + drift * s * 1.4 + vec3(sin(sw), cos(sw * 1.3), sin(sw * 0.7)) * s * 0.18;

    // completion burst from the mouth
    p += normalize(p - uOrigin + 1e-4) * uPulse * (0.6 + aRand.w * 0.8) * exp(-d * 0.45);

    // intro: particles converge from a scattered cloud
    float intro = 1.0 - uIntro;
    p += drift * 9.0 * intro * intro;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vec3 vn = normalize(normalMatrix * aNormal);
    vec3 vd = normalize(-mv.xyz);
    float facing = dot(vn, vd);
    vRim = pow(1.0 - abs(facing), 2.0);
    vBand = band;

    float size = uSize * (0.55 + aRand.y * 0.9) * (1.0 + band * 0.9);
    gl_PointSize = size * uPixelRatio / -mv.z;

    vAlpha = (0.3 + 0.7 * smoothstep(-0.3, 0.6, facing)) * (0.55 + aRand.z * 0.45) * uDim;
    vAlpha *= (1.0 - uScatter * 0.3) * uIntro;
  }
`;

const BUST_FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColRing;
  varying float vBand;
  varying float vAlpha;
  varying float vRim;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    vec3 col = mix(uColA, uColB, clamp(vRim * 1.1, 0.0, 1.0));
    col = mix(col, uColRing, clamp(vBand, 0.0, 1.0));
    col += vec3(1.0) * pow(soft, 6.0) * 0.25 * (1.0 + vBand);
    gl_FragColor = vec4(col, soft * vAlpha * (0.8 + vBand * 0.6));
  }
`;

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec4 aRand;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += mod(uTime * (0.05 + aRand.x * 0.08) + aRand.y * 12.0, 12.0) - 6.0;
    p.x += sin(uTime * 0.2 + aRand.z * 6.28) * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (8.0 + aRand.w * 14.0) * uPixelRatio / -mv.z;
    vAlpha = 0.15 + aRand.w * 0.35;
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(0.62, 0.66, 1.0, smoothstep(0.5, 0.0, r) * vAlpha);
  }
`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const MODE_TARGETS: Record<FieldMode, { speed: number; strength: number; scatter: number; ring: [number, number, number] }> = {
  idle: { speed: 0.16, strength: 0.9, scatter: 0, ring: [0.95, 0.72, 1.0] },
  running: { speed: 0.55, strength: 1.6, scatter: 0.28, ring: [0.95, 0.72, 1.0] },
  done: { speed: 0.2, strength: 1.0, scatter: 0, ring: [0.62, 1.0, 0.86] },
  error: { speed: 0.12, strength: 1.1, scatter: 0, ring: [1.0, 0.45, 0.52] },
};

export function ParticleField({ mode }: { mode: FieldMode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<FieldMode>(mode);
  const pulseRef = useRef(0);

  useEffect(() => {
    if (mode === "done" && modeRef.current !== "done") pulseRef.current = 1;
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL: the CSS backdrop still renders
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, -0.3, 9);

    /* --- bust --- */
    const isSmall = window.innerWidth < 768;
    const sample = sampleBust(isSmall ? 22000 : 48000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(sample.pos, 3));
    geo.setAttribute("aNormal", new THREE.BufferAttribute(sample.nor, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(sample.rand, 4));
    geo.setDrawRange(0, sample.count);

    const uniforms = {
      uTime: { value: 0 },
      uRingT: { value: 0 },
      uRingStrength: { value: 0.9 },
      uScatter: { value: 0 },
      uPulse: { value: 0 },
      uIntro: { value: reduceMotion ? 1 : 0 },
      uDim: { value: 1 },
      uSize: { value: 24 },
      uPixelRatio: { value: pixelRatio },
      uOrigin: { value: new THREE.Vector3(0, -0.48, 0.8) },
      uColA: { value: new THREE.Color("#3a3fd6") },
      uColB: { value: new THREE.Color("#a9b4ff") },
      uColRing: { value: new THREE.Color(0.95, 0.72, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: BUST_VERT,
      fragmentShader: BUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bustPoints = new THREE.Points(geo, mat);

    const group = new THREE.Group();
    group.rotation.order = "YXZ";
    group.add(bustPoints);
    scene.add(group);

    /* --- dust --- */
    const DUST = isSmall ? 500 : 1200;
    const dPos = new Float32Array(DUST * 3);
    const dRand = new Float32Array(DUST * 4);
    const r2 = mulberry32(11);
    for (let i = 0; i < DUST; i++) {
      dPos[i * 3] = (r2() - 0.5) * 16;
      dPos[i * 3 + 1] = (r2() - 0.5) * 10;
      dPos[i * 3 + 2] = (r2() - 0.5) * 8 - 1;
      for (let k = 0; k < 4; k++) dRand[i * 4 + k] = r2();
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute("aRand", new THREE.BufferAttribute(dRand, 4));
    const dUniforms = { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } };
    const dMat = new THREE.ShaderMaterial({
      uniforms: dUniforms,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(dGeo, dMat));

    /* --- layout --- */
    let baseX = 1.4;
    let baseY = 0.55;
    let baseScale = 1;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (w < 768) { baseX = 0.15; baseY = 0.1; baseScale = 0.72; }
      else if (w < 1200) { baseX = 1.0; baseY = 0.45; baseScale = 0.9; }
      else { baseX = 1.4; baseY = 0.55; baseScale = 1; }
    };
    resize();
    window.addEventListener("resize", resize);

    /* --- input --- */
    const pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });

    /* --- loop --- */
    const clock = new THREE.Clock();
    const ringColor = new THREE.Color();
    let ringSpeed = 0.16;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const k = Math.min(1, dt * 2.5);
      const t = MODE_TARGETS[modeRef.current];
      const motion = reduceMotion ? 0.25 : 1;

      uniforms.uTime.value += dt * motion;
      ringSpeed += (t.speed - ringSpeed) * k;
      uniforms.uRingT.value += dt * ringSpeed * motion;
      uniforms.uRingStrength.value += (t.strength - uniforms.uRingStrength.value) * k;
      const scatterTarget = t.scatter * (modeRef.current === "running" ? 0.8 + 0.2 * Math.sin(uniforms.uTime.value * 2) : 1);
      uniforms.uScatter.value += (scatterTarget - uniforms.uScatter.value) * k;
      ringColor.setRGB(t.ring[0], t.ring[1], t.ring[2]);
      uniforms.uColRing.value.lerp(ringColor, k);

      // completion burst decays on its own
      pulseRef.current *= Math.exp(-dt * 2.2);
      uniforms.uPulse.value = pulseRef.current * 0.9;

      if (uniforms.uIntro.value < 1) uniforms.uIntro.value = Math.min(1, uniforms.uIntro.value + dt * 0.45);

      // scroll: drift the bust aside and dim it behind the studio panels
      const scroll = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
      uniforms.uDim.value += (1 - scroll * 0.55 - uniforms.uDim.value) * k;
      dUniforms.uTime.value = uniforms.uTime.value;

      const targetX = baseX + scroll * (window.innerWidth < 768 ? 0 : 0.5);
      group.position.x += (targetX - group.position.x) * k;
      group.position.y += (baseY + scroll * 0.4 - group.position.y) * k;
      const s = baseScale * (1 - scroll * 0.06);
      group.scale.setScalar(group.scale.x + (s - group.scale.x) * k);

      const idleSway = Math.sin(uniforms.uTime.value * 0.25) * 0.05;
      group.rotation.y += (0.8 + pointer.x * 0.18 + idleSway - group.rotation.y) * k;
      group.rotation.x += (-0.36 + pointer.y * 0.08 - group.rotation.x) * k;

      renderer.render(scene, camera);
    };
    group.position.set(baseX, baseY, 0);
    group.scale.setScalar(baseScale);
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      geo.dispose();
      mat.dispose();
      dGeo.dispose();
      dMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className="fixed inset-0 z-0 pointer-events-none" />;
}
