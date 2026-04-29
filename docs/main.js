// ============================================================
// cl-agent landing page — hero grid canvas, terminal typer, copy
// ============================================================

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
   Hero background — lightweight 2D canvas dot-grid with a
   subtle "pulse" wave that radiates from the center, evoking
   a terminal cursor / data-flowing feel. No Three.js needed.
------------------------------------------------------------ */
(function initHeroGrid() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w, h, cols, rows;
  const gap = 36;          // spacing between dots (wider = fewer dots)

  function resize() {
    const parent = canvas.parentElement;
    w = parent ? parent.clientWidth : window.innerWidth;
    h = parent ? parent.clientHeight : window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / gap) + 1;
    rows = Math.ceil(h / gap) + 1;
  }
  resize();
  window.addEventListener("resize", resize);

  // Pointer position for local highlight.
  const pointer = { x: w / 2, y: h / 2, tx: w / 2, ty: h / 2 };
  window.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = e.clientX - rect.left;
    pointer.ty = e.clientY - rect.top;
  }, { passive: true });

  // Pause render when off-screen.
  let isVisible = true;
  const io = new IntersectionObserver(
    (entries) => { for (const e of entries) isVisible = e.isIntersecting; },
    { threshold: 0.01 }
  );
  io.observe(canvas);

  // Colors.
  const baseColor = [183, 148, 255];  // --accent lavender
  const cyanColor = [110, 231, 255];  // --accent-2

  let t0 = performance.now();
  let lastFrame = 0;
  const frameBudget = 50;  // ~20fps — slow wave doesn't need more

  function draw(now) {
    requestAnimationFrame(draw);
    if (!isVisible) return;
    if (now - lastFrame < frameBudget) return;
    lastFrame = now;

    const t = (now - t0) / 1000;

    // Smooth pointer follow.
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.hypot(cx, cy);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * gap;
        const y = r * gap;

        // Distance from center of canvas.
        const dist = Math.hypot(x - cx, y - cy);
        // Radial wave: a ring that slowly expands outward.
        const wave = Math.sin(dist * 0.04 - t * 1.8) * 0.5 + 0.5;

        // Distance from pointer → local glow.
        const pDist = Math.hypot(x - pointer.x, y - pointer.y);
        const pGlow = Math.max(0, 1 - pDist / 160);

        // Base opacity: fades toward edges.
        const edgeFade = 1 - (dist / maxDist) * 0.7;
        const alpha = (0.08 + wave * 0.18 + pGlow * 0.35) * edgeFade;

        // Lerp from lavender → cyan based on wave.
        const mix = wave * 0.6 + pGlow * 0.4;
        const cr = baseColor[0] + (cyanColor[0] - baseColor[0]) * mix;
        const cg = baseColor[1] + (cyanColor[1] - baseColor[1]) * mix;
        const cb = baseColor[2] + (cyanColor[2] - baseColor[2]) * mix;

        const radius = 1 + wave * 0.6 + pGlow * 1.2;

        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha.toFixed(3)})`;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }
  requestAnimationFrame(draw);
})();

/* ------------------------------------------------------------
   Animated terminal demo
------------------------------------------------------------ */
(function initTerminal() {
  const pre = document.getElementById("terminal-pre");
  const cursor = document.querySelector(".terminal-cursor");
  const terminalBody = document.getElementById("terminal-body");
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
    if (terminalBody) terminalBody.scrollTop = 0;
  }

  function scrollTerminalToBottom() {
    if (!terminalBody) return;
    terminalBody.scrollTop = terminalBody.scrollHeight;
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

  // Track visibility so we can pause the typing when off-screen.
  let termVisible = false;
  const termIO = new IntersectionObserver(
    (entries) => { for (const e of entries) termVisible = e.isIntersecting; },
    { threshold: 0.1 }
  );
  termIO.observe(pre);

  // Wait helper that also pauses while the terminal is off-screen.
  async function waitVisible(ms) {
    await sleep(ms);
    while (!termVisible) await sleep(200);
  }

  async function run() {
    for (const step of steps) {
      if (step.type === "restart") break; // single play — skip restart
      switch (step.type) {
        case "line":
          appendLine(step.text, step.cls);
          await waitVisible(40);
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
          await waitVisible(step.ms);
          break;
      }
      scrollTerminalToBottom();
    }
    // Animation done — show a blinking cursor at the end.
    if (cursor) cursor.style.display = "inline-block";
  }

  // Start the animation once the terminal scrolls into view.
  let started = false;
  const startIO = new IntersectionObserver(
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
  startIO.observe(pre);
})();
