/* Project deck.
   One continuous position drives every card: an integer means a card is at rest in front,
   anything in between is a card on its way out to the left (or on its way back). Dragging
   moves that position with the pointer; letting go hands it to a spring. Buttons, arrow
   keys and swipes all feed the same spring, so every transition settles the same way. */
(() => {
  const deck = document.getElementById("deck");
  if (!deck) return;

  const cards = [...deck.querySelectorAll(".project-card")];
  const total = cards.length;
  const countNow = document.getElementById("count-now");
  const progress = document.getElementById("progress");
  const html = document.documentElement;
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrowMq = window.matchMedia("(max-width:600px)");

  // Resting poses of the four visible layers.
  const WIDE = [
    { x: 0, y: 0, rot: 0, scale: 1 },
    { x: 37, y: 10, rot: 4.2, scale: 0.986 },
    { x: -39, y: 20, rot: -5.8, scale: 0.969 },
    { x: 57, y: 29, rot: 7.2, scale: 0.953 },
  ];
  const NARROW = [
    { x: 0, y: 0, rot: 0, scale: 1 },
    { x: 18, y: 8, rot: 3.2, scale: 0.986 },
    { x: -18, y: 16, rot: -4.2, scale: 0.969 },
    { x: 26, y: 24, rot: 5.2, scale: 0.953 },
  ];

  // Springs (unit mass). SETTLE carries a trace of overshoot; the others do not.
  const SETTLE = { k: 170, c: 20.5 };
  const DEAL = { k: 46, c: 13.6 };
  const LIFT = { k: 300, c: 34 };

  const SWIPE_PX = 56; // distance that commits a swipe
  const FLICK_PX_S = 380; // speed that commits a shorter one

  let rest = WIDE;
  let throwX = 380; // how far a card travels when it leaves the stack

  let pos = 0;
  let vel = 0;
  let target = 0;
  // 0 = cards squared up in one pile, 1 = fanned out. Starts squared only when the
  // scroll reveal is going to deal them.
  let fan = html.classList.contains("js-motion") ? 0 : 1;
  let fanVel = 0;
  let fanTarget = fan;
  let lift = 0;
  let liftVel = 0;
  let liftTarget = 0;

  let index = -1;
  let lastRounded = 0;
  let raf = 0;
  let last = 0;
  let gesture = null;
  let suppressedClickUntil = 0;

  const wrap = (n) => ((n % total) + total) % total;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n) => String(n).padStart(2, "0");

  function measure() {
    rest = narrowMq.matches ? NARROW : WIDE;
    // Slightly more than a card's width, so a card that has left is clear of the pile.
    throwX = Math.max(240, deck.offsetWidth * 1.06);
  }

  // Deeper layers fan out a beat after the ones in front of them.
  function layer(k) {
    const r = rest[k];
    const f = k < 1 ? 1 : clamp(fan * 1.6 - 0.2 * (k - 1), 0, 1);
    return { x: r.x * f, y: r.y * f, rot: r.rot * f, scale: 1 + (r.scale - 1) * f };
  }

  // depth: -1 has left the stack, 0 is in front, 3 is the last visible layer, 4 is hidden.
  function pose(depth) {
    if (depth < 0) {
      const t = -depth;
      return {
        x: -throwX * t,
        y: 12 * t,
        z: 36 * Math.sin(Math.PI * t), // lifts clear of the pile mid-flight
        ry: -14 * t, // turns away slightly as it goes
        rot: -9 * t,
        scale: 1,
        // Stays solid while it still overlaps the pile; only thins out once it is nearly clear.
        o: t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38),
      };
    }
    if (depth >= 3) {
      const t = Math.min(1, depth - 3);
      const b = layer(3);
      return { x: b.x, y: b.y + 8 * t, z: 0, ry: 0, rot: b.rot, scale: b.scale - 0.016 * t, o: 1 - t };
    }
    const k = Math.floor(depth);
    const f = depth - k;
    const a = layer(k);
    const b = layer(k + 1);
    return {
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      z: 0,
      ry: 0,
      rot: lerp(a.rot, b.rot, f),
      scale: lerp(a.scale, b.scale, f),
      o: 1,
    };
  }

  function render() {
    for (let i = 0; i < total; i++) {
      const card = cards[i];
      const r = wrap(i - pos);
      const depth = r > total - 1 ? r - total : r;
      const p = pose(depth);
      const visible = p.o > 0.004;
      if (visible !== card._visible) {
        card._visible = visible;
        card.classList.toggle("is-visible", visible);
      }
      if (!visible) continue;
      const top = depth <= 0;
      const held = top && liftTarget === 1;
      if (held !== card._held) {
        card._held = held;
        card.classList.toggle("is-held", held);
      }
      const scale = p.scale + (top ? 0.014 * lift : 0);
      card.style.transform =
        `translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,${p.z.toFixed(2)}px) ` +
        `rotateY(${p.ry.toFixed(3)}deg) rotate(${p.rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      // Opacity is recomputed every frame and cleared at rest, so no card is left translucent.
      card.style.opacity = p.o >= 0.999 ? "" : p.o.toFixed(3);
      card.style.zIndex = String(20 - Math.round(depth));
    }
  }

  // The front card, the counter and the progress line follow the position as it passes
  // the halfway point between two cards.
  function sync() {
    const rounded = Math.round(pos);
    const next = wrap(rounded);
    if (next === index) return;
    const dir = index < 0 ? 0 : Math.sign(rounded - lastRounded);
    lastRounded = rounded;
    index = next;
    cards.forEach((card, i) => {
      const front = i === next;
      card.dataset.depth = String(front ? 0 : wrap(i - next));
      card.style.pointerEvents = front ? "auto" : "none";
      card.setAttribute("aria-hidden", front ? "false" : "true");
      card.inert = !front;
    });
    if (countNow) {
      countNow.textContent = pad(next + 1);
      countNow.classList.remove("tick-up", "tick-down");
      if (dir && !reduceMq.matches) {
        void countNow.offsetWidth; // restart the tick
        countNow.classList.add(dir > 0 ? "tick-up" : "tick-down");
      }
    }
    if (progress) progress.style.setProperty("--progress", ((next + 1) / total).toFixed(4));
  }

  function tick(now) {
    const dt = clamp((now - last) / 1000, 0.001, 0.034);
    last = now;
    const dragging = !!gesture && gesture.mode === "horizontal";
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      if (!dragging) {
        vel += (-SETTLE.k * (pos - target) - SETTLE.c * vel) * h;
        pos += vel * h;
      }
      fanVel += (-DEAL.k * (fan - fanTarget) - DEAL.c * fanVel) * h;
      fan += fanVel * h;
      liftVel += (-LIFT.k * (lift - liftTarget) - LIFT.c * liftVel) * h;
      lift += liftVel * h;
    }
    let moving = dragging;
    if (!dragging) {
      if (Math.abs(pos - target) < 0.0005 && Math.abs(vel) < 0.005) {
        pos = target;
        vel = 0;
      } else moving = true;
    }
    if (Math.abs(fan - fanTarget) < 0.0005 && Math.abs(fanVel) < 0.005) {
      fan = fanTarget;
      fanVel = 0;
    } else moving = true;
    if (Math.abs(lift - liftTarget) < 0.002 && Math.abs(liftVel) < 0.02) {
      lift = liftTarget;
      liftVel = 0;
    } else moving = true;
    sync();
    render();
    raf = moving ? requestAnimationFrame(tick) : 0;
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function go(step) {
    if (gesture && gesture.mode === "horizontal") return;
    const next = Math.round(target) + step;
    if (Math.abs(next - pos) > 2.5) return; // a held key never spins the deck
    target = next;
    if (reduceMq.matches) {
      pos = target;
      vel = 0;
    }
    wake();
  }

  function dealOut() {
    if (fanTarget === 1) return;
    fanTarget = 1;
    if (reduceMq.matches) fan = 1;
    wake();
  }

  document.getElementById("next").addEventListener("click", () => go(1));
  document.getElementById("prev").addEventListener("click", () => go(-1));
  document.addEventListener("keydown", (e) => {
    if (window.__videoLightboxOpen && window.__videoLightboxOpen()) return;
    if (window.__shortsViewerOpen && window.__shortsViewerOpen()) return;
    // Don't steal arrows from the studio compare slider or other focused controls.
    if (e.target && e.target.closest && e.target.closest('[data-studio-compare],input,textarea,select,[contenteditable="true"]')) return;
    if (e.key === "ArrowRight") {
      go(1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      go(-1);
      e.preventDefault();
    }
  });

  // Pointer speed over the last ~100ms, in px/s. Zero if the pointer had already stopped.
  function releaseSpeed(g, now) {
    const s = g.samples;
    if (s.length < 2) return 0;
    const newest = s[s.length - 1];
    if (now - newest.t > 80) return 0;
    let oldest = newest;
    for (let i = s.length - 2; i >= 0; i--) {
      if (newest.t - s[i].t > 100) break;
      oldest = s[i];
    }
    const span = newest.t - oldest.t;
    return span > 0 ? ((newest.x - oldest.x) / span) * 1000 : 0;
  }

  function endGesture(e, cancelled) {
    const g = gesture;
    if (!g || (e && e.pointerId != null && e.pointerId !== g.id)) return;
    gesture = null;
    if (g.mode === "horizontal") {
      const moved = pos - g.base; // in cards; positive is toward the next project
      let step = 0;
      let speed = 0;
      if (!cancelled) {
        speed = releaseSpeed(g, e.timeStamp);
        const flick = Math.abs(speed) > FLICK_PX_S;
        if (Math.abs(moved) > SWIPE_PX / throwX || (flick && Math.abs(moved) > 14 / throwX)) {
          step = moved > 0 ? 1 : -1;
        }
        // A firm flick back toward where the card started cancels the swipe.
        if (step && flick && Math.sign(-speed) !== step && Math.abs(moved) < 0.5) step = 0;
        if (Math.abs(g.dx) > 12) suppressedClickUntil = Date.now() + 450;
      }
      target = g.base + step;
      if (reduceMq.matches) {
        pos = target;
        vel = 0;
      } else {
        vel = clamp(-speed / throwX, -9, 9);
      }
      liftTarget = 0;
      deck.classList.remove("is-dragging");
      wake();
    }
    if (deck.hasPointerCapture(g.id)) {
      try {
        deck.releasePointerCapture(g.id);
      } catch (_) {}
    }
  }

  deck.addEventListener("pointerdown", (e) => {
    const front = cards[wrap(Math.round(pos))];
    if (!front.contains(e.target) || e.target.closest("button, .card-link, [data-open-shorts]") || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (gesture) return;
    gesture = { id: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, mode: "pending", samples: [] };
    try {
      deck.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  deck.addEventListener("pointermove", (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.startX;
    g.dy = e.clientY - g.startY;
    if (g.mode === "pending") {
      if (Math.hypot(g.dx, g.dy) < 9) return;
      if (Math.abs(g.dy) > Math.abs(g.dx) * 1.15) {
        g.mode = "vertical";
        return;
      }
      if (Math.abs(g.dx) <= Math.abs(g.dy) * 1.12) return;
      // Pick the card up exactly where it is, even mid-settle, with no jump.
      g.mode = "horizontal";
      g.base = Math.round(pos);
      g.origin = pos;
      g.grab = g.dx;
      target = pos;
      vel = 0;
      liftTarget = 1;
      deck.classList.add("is-dragging");
      wake();
    }
    if (g.mode !== "horizontal") return;
    pos = clamp(g.origin - (g.dx - g.grab) / throwX, g.base - 1, g.base + 1);
    g.samples.push({ t: e.timeStamp, x: e.clientX });
    if (g.samples.length > 8) g.samples.shift();
  });

  deck.addEventListener("pointerup", (e) => endGesture(e, false));
  deck.addEventListener("pointercancel", (e) => endGesture(e, true));
  deck.addEventListener("lostpointercapture", (e) => endGesture(e, true));
  deck.addEventListener("dragstart", (e) => e.preventDefault());
  deck.addEventListener(
    "click",
    (e) => {
      if (Date.now() < suppressedClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
  window.addEventListener("blur", () => endGesture(null, true));

  // Dealt out once, when the deck scrolls into view (see motion.js).
  deck.addEventListener("reveal", () => setTimeout(dealOut, 140));
  document.addEventListener("motion:off", () => {
    fan = fanTarget = 1;
    render();
  });

  const remeasure = () => {
    measure();
    render();
  };
  window.addEventListener("resize", remeasure);
  if (narrowMq.addEventListener) narrowMq.addEventListener("change", remeasure);

  measure();
  sync();
  render();
})();
