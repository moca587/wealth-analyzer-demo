/* ═══════════════════════════════════════════════════════════════════════════
   INTERACTIVE GLOW — fluid, cursor-tracking light effect
   ─────────────────────────────────────────────────────────────────────────────
   A high-fidelity "wow" layer, drop-in for any page (zero dependencies):

     1. SPOTLIGHT  — a soft radial light that chases the cursor across a hero
                     element on a real spring integrator (stiffness/damping,
                     semi-implicit Euler), so it overshoots and settles like a
                     physical object instead of gliding linearly.
     2. CARD RING  — hovered cards get a luminous border ring + inner sheen
                     that track the cursor position inside the card (the
                     "Linear card glow"), implemented with CSS custom
                     properties and a mask-composite ring so only the 1.5px
                     border ever repaints.

   PERFORMANCE CONTRACT
     • pointermove handlers only RECORD coordinates — all reads/writes happen
       once per frame inside a single requestAnimationFrame loop.
     • The spotlight moves exclusively via transform: translate3d() and
       opacity — compositor-only, never touching layout or paint.
     • The rAF loop self-suspends when the light has faded out and nothing is
       hovered: idle cost is exactly zero.
     • Listeners are passive; will-change is limited to the one spotlight node.

   MICRO-INTERACTIONS
     • Spring physics for the spotlight (k=140, c=16 → gentle overshoot).
     • Bouncy cubic-bezier(.34,1.56,.64,1) on card ring/sheen fade-ins.

   ACCESSIBILITY
     • prefers-reduced-motion: reduce → effect hard-disabled, toggle greyed.
     • User toggle (auto-injected into a settings drawer if one exists, and
       always available programmatically via window.FXGlow.enable()/.disable()).
       Choice persists in localStorage ("wa_fx_glow").

   CONFIGURE the selectors in CONFIG below for your own project, then load the
   file with a plain script tag (src="interactive-glow.js") — no build needed.
   (Comment deliberately avoids a literal closing script tag so this file can
   also be inlined verbatim inside an HTML page.)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Configuration ─────────────────────────────────────────────────────── */
  const CONFIG = {
    heroSelector: ".wealth-hero",                       // dark hero that gets the spotlight
    cardSelector: ".wh-stat, .mc, .ob-step, .rn-card",  // cards that get the cursor ring
    darkCardSelector: ".wealth-hero .wh-stat",          // cards on dark ground → brighter ring
    spotlightSize: 560,                                 // px diameter of the hero light
    ringRadius: 220,                                    // px radius of the card border glow
    spring: { k: 140, c: 16 },                          // stiffness / damping
    storageKey: "wa_fx_glow"
  };

  /* ── Feature gating: reduced motion + persisted user choice ───────────── */
  const mqReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener: function(){} };
  function storedChoice() {
    try { return localStorage.getItem(CONFIG.storageKey); } catch (_) { return null; }
  }
  function persistChoice(on) {
    try { localStorage.setItem(CONFIG.storageKey, on ? "1" : "0"); } catch (_) {}
  }
  // Reduced motion always wins. Otherwise: explicit choice, else ON by default.
  function computeEnabled() {
    if (mqReduce.matches) return false;
    const s = storedChoice();
    return s === null ? true : s === "1";
  }
  let enabled = computeEnabled();

  /* ── Style injection (scoped, removable) ───────────────────────────────── */
  const style = document.createElement("style");
  style.id = "fxGlowStyle";
  style.textContent =
    /* Spotlight node: compositor-only movement (translate3d + opacity). */
    ".fx-spotlight{position:absolute;left:0;top:0;width:" + CONFIG.spotlightSize + "px;height:" + CONFIG.spotlightSize + "px;" +
      "margin-left:-" + (CONFIG.spotlightSize / 2) + "px;margin-top:-" + (CONFIG.spotlightSize / 2) + "px;" +
      "border-radius:50%;pointer-events:none;z-index:0!important;opacity:0;" +
      "background:radial-gradient(circle," +
        "rgba(120,190,255,.28) 0%," +
        "rgba(90,150,255,.16) 30%," +
        "rgba(212,175,95,.06) 55%," +
        "transparent 72%);" +
      "mix-blend-mode:screen}" +

    /* Card ring: a 1.5px luminous border drawn on ::before and revealed at the
       cursor position via CSS vars. mask-composite cuts out the interior, so
       the browser only ever repaints the thin ring — not the card. */
    ".fx-glow{position:relative}" +
    ".fx-glow::before{content:\"\";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;" +
      "background:radial-gradient(" + CONFIG.ringRadius + "px circle at var(--fx-mx,50%) var(--fx-my,50%)," +
        "rgba(64,140,255,.85),rgba(64,140,255,.25) 45%,transparent 70%);" +
      "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
      "-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;" +
      "opacity:0;transition:opacity .35s cubic-bezier(.34,1.56,.64,1)}" +      /* bouncy in */
    ".fx-glow:hover::before{opacity:1}" +

    /* Inner sheen: a faint wash inside the card, also cursor-anchored. */
    ".fx-glow::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;" +
      "background:radial-gradient(" + Math.round(CONFIG.ringRadius * 1.3) + "px circle at var(--fx-mx,50%) var(--fx-my,50%)," +
        "rgba(120,180,255,.10),transparent 65%);" +
      "opacity:0;transition:opacity .35s cubic-bezier(.34,1.56,.64,1)}" +
    ".fx-glow:hover::after{opacity:1}" +

    /* Brighter ring for glass cards on the dark hero. */
    ".fx-glow.fx-dark::before{background:radial-gradient(" + CONFIG.ringRadius + "px circle at var(--fx-mx,50%) var(--fx-my,50%)," +
      "rgba(160,210,255,.95),rgba(140,190,255,.30) 45%,transparent 70%)}" +

    /* Kill switch: one class on <html> disables every visual in this file. */
    "html.fx-glow-off .fx-spotlight,html.fx-glow-off .fx-glow::before,html.fx-glow-off .fx-glow::after{display:none!important}" +

    /* Reduced-motion fallback at the CSS level too (belt and braces). */
    "@media (prefers-reduced-motion: reduce){.fx-spotlight,.fx-glow::before,.fx-glow::after{display:none!important}}";
  document.head.appendChild(style);

  /* ── Spotlight: spring-physics light inside the hero ───────────────────── */
  const hero = document.querySelector(CONFIG.heroSelector);
  let spot = null;
  // Physics + pointer state. Handlers only write to this object.
  const S = {
    x: 0, y: 0,        // current spring position (hero-local px)
    vx: 0, vy: 0,      // velocity
    tx: 0, ty: 0,      // target (last pointer position)
    o: 0, to: 0,       // opacity current / target
    inside: false,
    raf: 0, last: 0,
    hovered: null,     // card currently holding the ring glow
    cx: 0, cy: 0       // last client coords for the card vars
  };

  if (hero) {
    spot = document.createElement("div");
    spot.className = "fx-spotlight";
    spot.setAttribute("aria-hidden", "true");
    hero.appendChild(spot);

    hero.addEventListener("pointerenter", function (e) {
      if (!enabled) return;
      const r = hero.getBoundingClientRect();          // one read on entry
      S.tx = S.x = e.clientX - r.left;                 // start AT the cursor —
      S.ty = S.y = e.clientY - r.top;                  // no fly-in from a corner
      S.to = 1; S.inside = true;
      spot.style.willChange = "transform,opacity";     // promote layer only while active
      wake();
    }, { passive: true });

    hero.addEventListener("pointermove", function (e) {
      if (!enabled || !S.inside) return;
      // RECORD ONLY. The rAF tick does the (single) rect read + write.
      S.cx = e.clientX; S.cy = e.clientY;
      S.dirty = true;
      wake();
    }, { passive: true });

    hero.addEventListener("pointerleave", function () {
      S.inside = false; S.to = 0;                      // fade out, keep settling
      wake();
    }, { passive: true });
  }

  /* ── Card ring: lazy tagging via event delegation ──────────────────────── */
  // Delegation means dynamically re-rendered cards work with zero observers.
  document.addEventListener("pointerover", function (e) {
    if (!enabled || !e.target || !e.target.closest) return;
    const card = e.target.closest(CONFIG.cardSelector);
    if (!card) { S.hovered = null; return; }
    if (!card.classList.contains("fx-glow")) {
      card.classList.add("fx-glow");
      if (card.matches(CONFIG.darkCardSelector)) card.classList.add("fx-dark");
    }
    S.hovered = card;
    wake();
  }, { passive: true });

  document.addEventListener("pointermove", function (e) {
    if (!enabled || !S.hovered) return;
    S.cx = e.clientX; S.cy = e.clientY;                // record only
    S.cardDirty = true;
    wake();
  }, { passive: true });

  document.addEventListener("pointerout", function (e) {
    if (S.hovered && e.target && e.target.closest &&
        e.target.closest(CONFIG.cardSelector) === S.hovered &&
        !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(CONFIG.cardSelector) === S.hovered)) {
      S.hovered = null;                                // ring fades via CSS transition
    }
  }, { passive: true });

  /* ── The one rAF loop (self-suspending) ────────────────────────────────── */
  function wake() { if (!S.raf) { S.last = performance.now(); S.raf = requestAnimationFrame(tick); } }

  function tick(now) {
    S.raf = 0;
    const dt = Math.min(0.032, (now - S.last) / 1000) || 0.016;  // clamp: tab-switch safety
    S.last = now;
    let busy = false;

    if (spot && hero) {
      // Refresh the spring target from the recorded pointer coords (one rect read/frame).
      if (S.dirty) {
        const r = hero.getBoundingClientRect();
        S.tx = S.cx - r.left; S.ty = S.cy - r.top;
        S.dirty = false;
      }
      // Semi-implicit Euler spring: v += (k·Δ − c·v)·dt ; x += v·dt
      S.vx += (CONFIG.spring.k * (S.tx - S.x) - CONFIG.spring.c * S.vx) * dt;
      S.vy += (CONFIG.spring.k * (S.ty - S.y) - CONFIG.spring.c * S.vy) * dt;
      S.x += S.vx * dt;  S.y += S.vy * dt;
      S.o += (S.to - S.o) * Math.min(1, dt * 8);       // opacity: critically-damped lerp

      spot.style.transform = "translate3d(" + S.x.toFixed(1) + "px," + S.y.toFixed(1) + "px,0)";
      spot.style.opacity = S.o.toFixed(3);

      // Keep integrating while visibly moving or fading.
      busy = S.o > 0.005 && (S.inside || S.o > 0.01 ||
             Math.abs(S.vx) > 2 || Math.abs(S.vy) > 2 ||
             Math.abs(S.tx - S.x) > 0.5 || Math.abs(S.ty - S.y) > 0.5);
    }

    if (S.hovered && S.cardDirty) {
      const r = S.hovered.getBoundingClientRect();     // one small read/frame
      S.hovered.style.setProperty("--fx-mx", (S.cx - r.left) + "px");
      S.hovered.style.setProperty("--fx-my", (S.cy - r.top) + "px");
      S.cardDirty = false;
    }

    if (busy) { S.raf = requestAnimationFrame(tick); } // else: loop sleeps, 0 idle cost
    else if (spot) { spot.style.willChange = ""; }     // release the GPU layer when idle
  }

  /* ── Public API + kill switch ───────────────────────────────────────────── */
  function applyState() {
    document.documentElement.classList.toggle("fx-glow-off", !enabled);
    if (!enabled) { S.to = 0; S.o = 0; S.inside = false; S.hovered = null;
      if (spot) { spot.style.opacity = "0"; } }
  }
  window.FXGlow = {
    get enabled() { return enabled; },
    enable:  function () { if (mqReduce.matches) return false; enabled = true;  persistChoice(true);  applyState(); syncToggle(); return true; },
    disable: function () { enabled = false; persistChoice(false); applyState(); syncToggle(); return true; }
  };
  mqReduce.addEventListener && mqReduce.addEventListener("change", function () {
    enabled = computeEnabled(); applyState(); syncToggle();
  });

  /* ── Settings toggle (injected into an existing drawer when present) ───── */
  let toggleInput = null;
  function syncToggle() {
    if (!toggleInput) return;
    toggleInput.checked = enabled;
    toggleInput.disabled = mqReduce.matches;
  }
  (function injectToggle() {
    const body = document.querySelector("#settingsPanel .set-body");
    if (!body) return;                                  // no drawer → API-only control
    const sec = document.createElement("div");
    sec.className = "set-sec";
    sec.innerHTML =
      '<div class="set-sec-h">Visual Effects</div>' +
      '<div class="set-row">' +
        '<span class="set-row-lbl">Interactive glow' +
          "<small>Cursor-tracking light on the overview and cards. Automatically off when your system prefers reduced motion.</small></span>" +
        '<label class="set-switch"><input type="checkbox" id="fxGlowToggle" aria-label="Enable interactive glow effect"><span></span></label>' +
      "</div>";
    body.appendChild(sec);
    toggleInput = sec.querySelector("#fxGlowToggle");
    toggleInput.addEventListener("change", function () {
      this.checked ? window.FXGlow.enable() : window.FXGlow.disable();
    });
    syncToggle();
  })();

  applyState();
})();
