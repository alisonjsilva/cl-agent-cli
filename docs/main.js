// ============================================================
// cl-agent landing page — hero 3D scene, terminal typer, copy
// ============================================================

import * as THREE from "three";

/* ------------------------------------------------------------
   Year in footer
------------------------------------------------------------ */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ------------------------------------------------------------
   Copy buttons
------------------------------------------------------------ */
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(text);
      const labelEl = btn.querySelector("span");
      const original = labelEl ? labelEl.textContent : btn.textContent;
      btn.classList.add("copied");
      if (labelEl) labelEl.textContent = "Copied";
      else btn.textContent = "Copied";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (labelEl) labelEl.textContent = original;
        else btn.textContent = original;
      }, 1400);
    } catch {
      // ignore
    }
  });
});

/* ------------------------------------------------------------
   Hero 3D scene — Three.js
   A floating, glowing wireframe icosahedron + orbiting solid
   inner sphere, surrounded by drifting particle field. Slowly
   rotates, reacts to pointer movement, parallax-feel.
------------------------------------------------------------ */
(function initHeroScene() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  // Respect reduced-motion users.
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, 0.06);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  // -----------------------------------------
  // Group containing the main object cluster
  // -----------------------------------------
  const group = new THREE.Group();
  scene.add(group);

  // --- Glowing wireframe icosahedron (outer shell) ---
  const icoGeo = new THREE.IcosahedronGeometry(2.4, 1);
  const icoEdges = new THREE.EdgesGeometry(icoGeo);
  const icoMat = new THREE.LineBasicMaterial({
    color: 0xb794ff,
    transparent: true,
    opacity: 0.85,
  });
  const icoWire = new THREE.LineSegments(icoEdges, icoMat);
  group.add(icoWire);

  // Vertex points on the icosahedron — small glowing dots.
  const pointsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.07,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const icoPoints = new THREE.Points(icoGeo, pointsMat);
  group.add(icoPoints);

  // --- Inner soft sphere (gradient look via simple shader) ---
  const innerGeo = new THREE.SphereGeometry(1.2, 64, 64);
  const innerMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x6ee7ff) },
      uColorB: { value: new THREE.Color(0xb794ff) },
      uColorC: { value: new THREE.Color(0xff8bd1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;

      void main() {
        // Fresnel-style edge glow.
        vec3 viewDir = normalize(cameraPosition);
        float fres = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);

        // Mix colors based on position + time for slow shifting.
        float t = 0.5 + 0.5 * sin(uTime * 0.4 + vPos.y * 1.5);
        vec3 col = mix(uColorA, uColorB, t);
        col = mix(col, uColorC, 0.5 + 0.5 * sin(uTime * 0.3 + vPos.x));

        float alpha = fres * 0.85;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const innerSphere = new THREE.Mesh(innerGeo, innerMat);
  group.add(innerSphere);

  // --- Orbiting smaller geometry (torus knot) for visual interest ---
  const knotGeo = new THREE.TorusKnotGeometry(0.45, 0.05, 96, 12, 2, 3);
  const knotEdges = new THREE.EdgesGeometry(knotGeo);
  const knotMat = new THREE.LineBasicMaterial({
    color: 0x6ee7ff,
    transparent: true,
    opacity: 0.7,
  });
  const knot = new THREE.LineSegments(knotEdges, knotMat);
  knot.position.set(3.4, 0.5, -0.5);
  group.add(knot);

  // --- Background drifting particle field ---
  const particleCount = 900;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 4;
    speeds[i] = 0.2 + Math.random() * 0.8;
  }
  particleGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  const particleMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.025,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // --- Soft ambient + directional light (used by line shading subtly) ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // -----------------------------------------
  // Pointer parallax
  // -----------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointerMove(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.tx = x;
    pointer.ty = y;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // -----------------------------------------
  // Resize
  // -----------------------------------------
  function resize() {
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // -----------------------------------------
  // Pause render when off-screen
  // -----------------------------------------
  let isVisible = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) isVisible = entry.isIntersecting;
    },
    { threshold: 0.01 }
  );
  io.observe(canvas);

  // -----------------------------------------
  // Animate
  // -----------------------------------------
  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();

    if (isVisible) {
      // Smooth parallax follow.
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      group.rotation.y = t * 0.18 + pointer.x * 0.5;
      group.rotation.x = Math.sin(t * 0.25) * 0.15 + pointer.y * 0.25;

      // Counter-rotate the inner wireframe a touch.
      icoWire.rotation.y = -t * 0.12;
      icoPoints.rotation.y = -t * 0.12;

      // Orbit the knot.
      knot.position.x = Math.cos(t * 0.6) * 3.2;
      knot.position.z = Math.sin(t * 0.6) * 3.2 - 0.5;
      knot.rotation.x = t * 0.7;
      knot.rotation.y = t * 0.9;

      // Inner sphere subtle pulse.
      const s = 1 + Math.sin(t * 0.9) * 0.04;
      innerSphere.scale.setScalar(s);
      innerMat.uniforms.uTime.value = t;

      // Drift the particles upward, wrap back.
      const pos = particleGeo.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        pos[i * 3 + 1] += 0.0035 * speeds[i];
        if (pos[i * 3 + 1] > 7) pos[i * 3 + 1] = -7;
      }
      particleGeo.attributes.position.needsUpdate = true;
      particles.rotation.y = t * 0.02;

      renderer.render(scene, camera);
    }

    requestAnimationFrame(tick);
  }
  tick();
})();

/* ------------------------------------------------------------
   Animated terminal demo
------------------------------------------------------------ */
(function initTerminal() {
  const pre = document.getElementById("terminal-pre");
  const cursor = document.querySelector(".terminal-cursor");
  if (!pre) return;

  // Scripted “session”. Each step is either typed input or
  // streamed/instant output with optional class for coloring.
  const steps = [
    { type: "line", cls: "t-info", text: "cl-agent v0.1.0  ·  active account: production  ·  model: claude-sonnet-4.5" },
    { type: "line", cls: "t-info", text: "Type a question, /help for commands.\n" },
    { type: "prompt" },
    { type: "type",   text: "Show the latest 3 orders for the active account", speed: 22 },
    { type: "newline" },
    { type: "line", cls: "t-tool", text: "↳ tool  cl_list_orders  { page_size: 3, sort: \"-created_at\" }" },
    { type: "delay", ms: 350 },
    { type: "line", cls: "t-dim", text: "  → 200 OK  ·  3 results" },
    { type: "line", cls: "t-bold", text: "" },
    { type: "line", cls: "",      text: "  #  number       status      total      placed_at" },
    { type: "line", cls: "t-dim", text: "  ─  ───────      ──────      ─────      ──────────" },
    { type: "line", cls: "",      text: "  1  10239        placed      €128.40    2026-04-28 21:14" },
    { type: "line", cls: "",      text: "  2  10238        approved    €74.00     2026-04-28 19:02" },
    { type: "line", cls: "",      text: "  3  10237        placed      €312.90    2026-04-28 16:48" },
    { type: "newline" },
    { type: "prompt" },
    { type: "type",   text: "Cancel order 10239 — it’s a duplicate", speed: 22 },
    { type: "newline" },
    { type: "line", cls: "t-tool", text: "↳ tool  cl_cancel_order  { id: \"10239\" }" },
    { type: "delay", ms: 250 },
    { type: "line", cls: "t-warn", text: "  ⚠  confirmation required" },
    { type: "line", cls: "",      text: "  ┌─ cancel order ──────────────────────────────────┐" },
    { type: "line", cls: "",      text: "  │  number  10239                                  │" },
    { type: "line", cls: "",      text: "  │  total   €128.40                                │" },
    { type: "line", cls: "",      text: "  │  status  placed                                 │" },
    { type: "line", cls: "",      text: "  │                                                 │" },
    { type: "line", cls: "",      text: "  │  Proceed?   [ y ]es   [ n ]o                    │" },
    { type: "line", cls: "",      text: "  └─────────────────────────────────────────────────┘" },
    { type: "delay", ms: 700 },
    { type: "line", cls: "t-ok",  text: "  ✓  confirmed by user — executing" },
    { type: "delay", ms: 300 },
    { type: "line", cls: "t-ok",  text: "  ✓  order 10239 cancelled" },
    { type: "newline" },
    { type: "prompt" },
    { type: "type",  text: "▍", speed: 0, ghost: true },
    { type: "delay", ms: 1800 },
    { type: "restart" },
  ];

  const escapeHtml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  function appendSpan(text, cls) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.innerHTML = escapeHtml(text);
    pre.appendChild(span);
    return span;
  }

  function appendLine(text, cls) {
    appendSpan(text, cls);
    pre.appendChild(document.createTextNode("\n"));
  }

  function appendPrompt() {
    appendSpan("› ", "t-prompt");
  }

  function clear() {
    while (pre.firstChild) pre.removeChild(pre.firstChild);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typeInto(text, speed) {
    const span = appendSpan("", "t-user");
    for (const ch of text) {
      span.textContent += ch;
      // small jitter for human feel
      const jitter = speed > 0 ? speed + (Math.random() * 14 - 7) : 0;
      if (jitter > 0) await sleep(jitter);
    }
  }

  async function run() {
    while (true) {
      for (const step of steps) {
        switch (step.type) {
          case "line":
            appendLine(step.text, step.cls);
            await sleep(40);
            break;
          case "prompt":
            appendPrompt();
            break;
          case "type":
            if (step.ghost) break;
            await typeInto(step.text, step.speed);
            break;
          case "newline":
            pre.appendChild(document.createTextNode("\n"));
            break;
          case "delay":
            await sleep(step.ms);
            break;
          case "restart":
            clear();
            break;
        }
        // Keep cursor near the end while content grows.
        if (cursor) cursor.scrollIntoView({ block: "end" });
      }
    }
  }

  // Only animate when the terminal is in view, to keep the
  // animation perceived as "live" when users get there.
  let started = false;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !started) {
          started = true;
          run();
        }
      }
    },
    { threshold: 0.2 }
  );
  io.observe(pre);
})();
