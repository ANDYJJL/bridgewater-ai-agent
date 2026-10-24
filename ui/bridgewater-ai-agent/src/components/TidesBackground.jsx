'use client';

import { useEffect, useRef } from 'react';

const VERT_SRC = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`.trim();

const FRAG_SRC = `
precision highp float;

uniform vec2  u_res;
uniform vec2  u_mouseS;
uniform float u_time;
uniform float u_aspect;
uniform vec4  u_pulses[4];

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1,0));
  float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec2 aspectUV(vec2 uv){ uv -= 0.5; uv.x *= u_aspect; return uv; }

vec3 paperBase(vec2 uv){
  vec3 a = vec3(0.985, 0.982, 0.972);
  vec3 b = vec3(0.955, 0.948, 0.930);
  float g = smoothstep(0.0, 1.55, length((uv - vec2(0.35, 0.65)) * vec2(1.0, 0.9)));
  vec3 base = mix(a, b, g * 0.35);
  float fiber = fbm(uv * 3.2);
  base *= 0.985 + fiber * 0.025;
  return base;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 auv = aspectUV(uv);
  vec2 amouse = aspectUV(u_mouseS);
  vec3 base = paperBase(uv);

  float t = u_time * 0.06;
  float y = uv.y;

  float band = 0.0;
  band += sin(y * 12.0  + t * 0.85 + fbm(vec2(uv.x * 1.6, t * 0.30)) * 2.2) * 0.55;
  band += sin(y * 28.0  + t * 1.20 + fbm(vec2(uv.x * 2.7, t * 0.45)) * 2.6) * 0.32;
  band += sin(y * 62.0  - t * 0.55 + fbm(vec2(uv.x * 4.8, t * 0.40)) * 3.2) * 0.16;

  float dM = length(auv - amouse);
  float well = exp(-dM * dM * 7.0);
  band += well * 0.85;

  float dy = (auv.y - amouse.y);
  float wake = exp(-pow(dy * 9.0, 2.0)) * exp(-pow((auv.x - amouse.x) * 1.6, 2.0));
  band += wake * 0.38;

  float dark = clamp(band * 0.040 + 0.022, 0.0, 0.095);
  base -= vec3(dark) * vec3(1.0, 1.03, 1.08);

  for (int i = 0; i < 4; i++){
    vec4 P = u_pulses[i];
    if (P.w < 0.5) continue;
    float age = u_time - P.z;
    if (age < 0.0 || age > 0.9) continue;
    vec2 ppos = aspectUV(P.xy);
    float d = length(auv - ppos);
    float life = 1.0 - smoothstep(0.0, 0.9, age);
    float dot = exp(-pow(d * 26.0, 2.0)) * life;
    base -= vec3(0.045, 0.048, 0.055) * dot;
  }

  float grain = (hash(uv * u_res + u_time) - 0.5) * 0.006;
  base += grain;
  float vig = smoothstep(1.22, 0.45, length((uv - 0.5) * vec2(1.0, 1.2)));
  base *= mix(0.985, 1.0, vig);

  base = clamp(base, 0.0, 1.0);
  gl_FragColor = vec4(base, 1.0);
}
`.trim();

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(gl, vert, frag) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

const UI_SELECTOR = 'button, a, input, textarea, select, label, header, footer, [role="button"], [data-ui], [data-no-bg-pulse]';

export default function TidesBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect prefers-reduced-motion
    const prefersReduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) return;

    // Compile shaders
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) return;

    const prog = linkProgram(gl, vert, frag);
    if (!prog) return;

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uMouseS = gl.getUniformLocation(prog, 'u_mouseS');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uAspect = gl.getUniformLocation(prog, 'u_aspect');
    const uPulses = gl.getUniformLocation(prog, 'u_pulses[0]');

    // State
    let rafId = null;
    let startTime = performance.now();

    // Smooth mouse tracking
    let targetMouse = [0.5, 0.5];
    let smoothMouse = [0.5, 0.5];

    // Pulse ring: [x, y, startTime, active(0/1)] × 4
    const pulses = new Float32Array(16); // 4 × vec4

    let pulseHead = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    function render() {
      if (prefersReduced) {
        // Static render — just one frame, no animation
        const t = 0;
        const w = canvas.width;
        const h = canvas.height;
        const aspect = w / h;

        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(uRes, w, h);
        gl.uniform2f(uMouseS, 0.5, 0.5);
        gl.uniform1f(uTime, t);
        gl.uniform1f(uAspect, aspect);
        gl.uniform4fv(uPulses, new Float32Array(16));

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return;
      }

      rafId = requestAnimationFrame(loop);
    }

    function loop() {
      const now = performance.now();
      const t = (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      const aspect = w / h;

      // Smooth mouse
      const lerpFactor = 0.08;
      smoothMouse[0] += (targetMouse[0] - smoothMouse[0]) * lerpFactor;
      smoothMouse[1] += (targetMouse[1] - smoothMouse[1]) * lerpFactor;

      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uMouseS, smoothMouse[0], smoothMouse[1]);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAspect, aspect);
      gl.uniform4fv(uPulses, pulses);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafId = requestAnimationFrame(loop);
    }

    render();

    function onPointerMove(e) {
      targetMouse[0] = e.clientX / window.innerWidth;
      targetMouse[1] = 1.0 - e.clientY / window.innerHeight;
    }

    function onPointerDown(e) {
      // Skip if clicking on UI elements
      if (e.target.closest(UI_SELECTOR)) return;
      const now = performance.now();
      const t = (now - startTime) / 1000;
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - e.clientY / window.innerHeight;
      const base = pulseHead * 4;
      pulses[base + 0] = x;
      pulses[base + 1] = y;
      pulses[base + 2] = t;
      pulses[base + 3] = 1.0;
      pulseHead = (pulseHead + 1) % 4;
    }

    function onResize() { resize(); }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      gl.deleteBuffer(buf);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
}
