/* Project deck: cards with weight.

   One continuous position drives every card. An integer means that card is at rest in
   front; in between, a card is on its way from the deck to the pile beside it (or back).
   Cards that have been looked at are not thrown away: they slide over and come to rest in
   a loose pile, face up, in the order they were seen. Going back takes the top one off
   the pile. Past the last card, the whole pile is gathered back onto the deck.

   The card in the hand behaves like a card: it follows the pointer in both directions,
   swings from wherever it was picked up, and carries on swinging for a moment after it is
   let go. Dragging, buttons, arrow keys and swipes all feed the same springs. */
(() => {
  const deck = document.getElementById("deck");
  if (!deck) return;

  const cards = [...deck.querySelectorAll(".project-card")];
  const total = cards.length;
  const section = deck.closest(".deck-section") || deck.parentNode;
  const countNow = document.getElementById("count-now");
  const progress = document.getElementById("progress");
  const html = document.documentElement;
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrowMq = window.matchMedia("(max-width:600px)");

  // Resting poses of the four visible layers of the deck.
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
  // Where seen cards come to rest. On a phone the pile is off the edge of the table.
  const PILE_WIDE = { scale: 0.86, rot: -5.5, y: 24 };
  const PILE_NARROW = { scale: 0.92, rot: -7, y: 14 };

  // Each card lands a little differently, and the same way every time.
  const noise = (n) => {
    const v = Math.sin(n * 12.9898) * 43758.5453;
    return v - Math.floor(v) - 0.5;
  };
  const lay = cards.map((_, i) => ({ rot: noise(i + 1) * 8, x: noise(i + 7.3) * 26, y: noise(i + 3.1) * 16 }));

  // Springs (unit mass). SETTLE carries a trace of overshoot; SWING is a card on a
  // fingertip and is meant to overshoot; the others do not.
  const SETTLE = { k: 170, c: 20.5 };
  const GATHER = { k: 34, c: 11.4 }; // the long trip when the pile is gathered back
  const DEAL = { k: 46, c: 13.6 };
  const LIFT = { k: 300, c: 34 };
  const SWING = { k: 130, c: 11.5 };
  const FOLLOW = { k: 280, c: 31 };

  const SWIPE_PX = 56; // distance that commits a swipe
  const FLICK_PX_S = 380; // speed that commits a shorter one

  let rest = WIDE;
  let pile = PILE_WIDE;
  let throwX = 420; // from the middle of the deck to the middle of the pile

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
  // The card in the hand: how far it has swung, and how far it has been carried up or down.
  let swing = 0;
  let swingVel = 0;
  let swingTarget = 0;
  let carry = 0;
  let carryVel = 0;
  let carryTarget = 0;
  let inHand = -1;

  let index = -1;
  let lastRounded = 0;
  let raf = 0;
  let last = 0;
  let gesture = null;
  let suppressedClickUntil = 0;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n) => String(n).padStart(2, "0");
  // Pulling past either end meets resistance and never gets far.
  const give = (u) => 0.2 * (1 - 1 / (1 + u * 3));

  function measure() {
    const narrow = narrowMq.matches;
    const w = deck.offsetWidth;
    rest = narrow ? NARROW : WIDE;
    pile = narrow ? PILE_NARROW : PILE_WIDE;
    throwX = narrow ? Math.max(260, w * 1.34) : w * 0.5 + w * pile.scale * 0.5 + 36;
  }

  // Deeper layers fan out a beat after the ones in front of them.
  function layer(k) {
    const r = rest[k];
    const f = k < 1 ? 1 : clamp(fan * 1.6 - 0.2 * (k - 1), 0, 1);
    return { x: r.x * f, y: r.y * f, rot: r.rot * f, scale: 1 + (r.scale - 1) * f };
  }

  // depth: 0 is in front, 3 is the last visible layer of the deck, 4 and beyond are
  // hidden under it. Below 0 the card is on its way to the pile; at -1 it is the pile's
  // top card, and each whole number further is one card deeper.
  function pose(depth, i) {
    if (depth < 0) {
      const t = Math.min(1, -depth);
      const under = Math.max(0, -depth - 1);
      const e = t * t * (3 - 2 * t);
      const l = lay[i];
      return {
        x: (-throwX + l.x) * t, // straight under the pointer; the easing is in the spring
        y: (pile.y + l.y) * e + Math.min(under, 4) * 1.5,
        z: 44 * Math.sin(Math.PI * t), // lifts clear of both piles mid-flight
        ry: -9 * Math.sin(Math.PI * t), // turns away slightly as it goes
        rot: (pile.rot + l.rot) * e,
        scale: 1 + (pile.scale - 1) * e - 0.01 * Math.min(under, 4),
        // Only the top three of the pile are ever seen.
        o: under <= 2 ? 1 : Math.max(0, 1 - (under - 2)),
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
      const depth = i - pos;
      const p = pose(depth, i);
      const visible = p.o > 0.004;
      if (visible !== card._visible) {
        card._visible = visible;
        card.classList.toggle("is-visible", visible);
      }
      if (!visible) continue;
      const mine = i === inHand;
      const held = mine && liftTarget === 1;
      if (held !== card._held) {
        card._held = held;
        card.classList.toggle("is-held", held);
      }
      const resting = depth <= -1;
      if (resting !== card._resting) {
        card._resting = resting;
        card.classList.toggle("in-pile", resting);
      }
      const scale = p.scale + (mine ? 0.014 * lift : 0);
      const y = p.y + (mine ? carry : 0);
      const rot = p.rot + (mine ? swing : 0);
      card.style.transform =
        `translate3d(${p.x.toFixed(2)}px,${y.toFixed(2)}px,${p.z.toFixed(2)}px) ` +
        `rotateY(${p.ry.toFixed(3)}deg) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      // Opacity is recomputed every frame and cleared at rest, so no card is left translucent.
      card.style.opacity = p.o >= 0.999 ? "" : p.o.toFixed(3);
      // The deck stacks front to back; the pile stacks newest on top; a card in the air
      // or in the hand is above both.
      const z = depth >= 0 ? 30 - Math.round(depth) : depth > -1 || mine ? 60 : 20 + Math.round(depth);
      card.style.zIndex = String(Math.max(1, z));
    }
  }

  // The front card, the counter and the progress line follow the position as it passes
  // the halfway point between two cards.
  function sync() {
    const rounded = clamp(Math.round(pos), 0, total - 1);
    if (rounded === index) return;
    const dir = index < 0 ? 0 : Math.sign(rounded - lastRounded);
    lastRounded = rounded;
    index = rounded;
    cards.forEach((card, i) => {
      const front = i === rounded;
      card.dataset.depth = front ? "0" : i > rounded ? String(i - rounded) : "seen";
      card.classList.toggle("pile-top", i === rounded - 1);
      card.style.pointerEvents = front ? "auto" : "none";
      card.setAttribute("aria-hidden", front ? "false" : "true");
      card.inert = !front;
    });
    if (countNow) {
      countNow.textContent = pad(rounded + 1);
      countNow.classList.remove("tick-up", "tick-down");
      if (dir && !reduceMq.matches) {
        void countNow.offsetWidth; // restart the tick
        countNow.classList.add(dir > 0 ? "tick-up" : "tick-down");
      }
    }
    if (progress) progress.style.setProperty("--progress", ((rounded + 1) / total).toFixed(4));
  }

  function tick(now) {
    const dt = clamp((now - last) / 1000, 0.001, 0.034);
    last = now;
    const dragging = !!gesture && gesture.mode === "horizontal";
    // Gathering the pile is a long trip; everything else is one card's worth.
    const spring = Math.abs(target - pos) > 1.25 ? GATHER : SETTLE;
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      if (!dragging) {
        vel += (-spring.k * (pos - target) - spring.c * vel) * h;
        pos += vel * h;
      }
      fanVel += (-DEAL.k * (fan - fanTarget) - DEAL.c * fanVel) * h;
      fan += fanVel * h;
      liftVel += (-LIFT.k * (lift - liftTarget) - LIFT.c * liftVel) * h;
      lift += liftVel * h;
      swingVel += (-SWING.k * (swing - swingTarget) - SWING.c * swingVel) * h;
      swing += swingVel * h;
      carryVel += (-FOLLOW.k * (carry - carryTarget) - FOLLOW.c * carryVel) * h;
      carry += carryVel * h;
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
    if (Math.abs(swing - swingTarget) < 0.01 && Math.abs(swingVel) < 0.1) {
      swing = swingTarget;
      swingVel = 0;
    } else moving = true;
    if (Math.abs(carry - carryTarget) < 0.05 && Math.abs(carryVel) < 0.5) {
      carry = carryTarget;
      carryVel = 0;
    } else moving = true;
    if (!moving && !gesture) inHand = -1;
    sync();
    render();
    raf = moving ? requestAnimationFrame(tick) : 0;
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function arrive() {
    if (reduceMq.matches) {
      pos = target;
      vel = 0;
    }
    wake();
  }

  function go(step) {
    if (gesture && gesture.mode === "horizontal") return;
    const from = Math.round(target);
    const next = from + step;
    if (next > total - 1) {
      // Past the last card: gather the pile back onto the deck.
      if (Math.abs(pos - (total - 1)) > 0.6) return;
      target = 0;
      arrive();
      return;
    }
    if (next < 0) {
      // Nothing before the first card: the deck gives a little and comes back.
      if (!reduceMq.matches) vel = -1.5;
      wake();
      return;
    }
    if (Math.abs(next - pos) > 2.5) return; // a held key never spins the deck
    target = next;
    arrive();
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
    if (e.target && e.target.closest && e.target.closest('[data-studio-compare],[data-strip],[data-sheet],input,textarea,select,[contenteditable="true"]')) return;
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
      if (g.base === total - 1 && step === 1) target = 0; // last card pushed on: gather the pile
      else target = clamp(g.base + step, 0, total - 1);
      if (reduceMq.matches) {
        pos = target;
        vel = 0;
        swing = swingVel = carry = carryVel = 0;
      } else {
        vel = clamp(-speed / throwX, -9, 9);
        // Let go mid-swing and the card keeps the turn it had.
        swingVel += clamp(-speed * g.arm * 0.035, -160, 160);
      }
      liftTarget = 0;
      swingTarget = 0;
      carryTarget = 0;
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
    const front = cards[clamp(Math.round(pos), 0, total - 1)];
    if (!front.contains(e.target) || e.target.closest("button, .card-link, [data-open-shorts]") || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (gesture) return;
    // Where on the card it was picked up: -1 at the top edge, 1 at the bottom.
    const box = front.getBoundingClientRect();
    const arm = box.height ? clamp((e.clientY - (box.top + box.height / 2)) / (box.height / 2), -1, 1) : 0;
    gesture = { id: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, mode: "pending", samples: [], arm };
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
      g.base = clamp(Math.round(pos), 0, total - 1);
      g.origin = pos;
      g.grab = g.dx;
      g.lift = g.dy;
      target = pos;
      vel = 0;
      liftTarget = 1;
      deck.classList.add("is-dragging");
      wake();
    }
    if (g.mode !== "horizontal") return;
    let raw = clamp(g.origin - (g.dx - g.grab) / throwX, g.base - 1, g.base + 1);
    if (raw < 0) raw = -give(-raw);
    else if (raw > total - 1) raw = total - 1 + give(raw - (total - 1));
    pos = raw;
    // The card in the hand is the one leaving the deck, or the one coming back off the pile.
    inHand = pos >= g.base || g.base === 0 ? g.base : g.base - 1;
    g.samples.push({ t: e.timeStamp, x: e.clientX });
    if (g.samples.length > 8) g.samples.shift();
    if (!reduceMq.matches) {
      const pull = g.dx - g.grab;
      const speed = releaseSpeed(g, e.timeStamp);
      // Held below its middle and pulled left, the top trails behind; held above, the bottom does.
      swingTarget = clamp(-pull * g.arm * 0.1 - speed * g.arm * 0.011, -14, 14);
      carryTarget = clamp((g.dy - g.lift) * 0.6, -90, 90);
    }
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

  // The pile can be taken from: its top card goes back on the deck.
  function overPile(e) {
    if (index < 1 || gesture) return false;
    const top = cards[index - 1];
    const front = cards[index];
    if (!top || !top._visible) return false;
    const inside = (el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    return inside(top) && !inside(front);
  }
  if (section) {
    section.addEventListener("click", (e) => {
      if (Date.now() < suppressedClickUntil || e.target.closest("a, button")) return;
      if (overPile(e)) go(-1);
    });
    section.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const over = overPile(e);
      if (over !== section._overPile) {
        section._overPile = over;
        section.classList.toggle("is-over-pile", over);
      }
    });
    section.addEventListener("pointerleave", () => {
      section._overPile = false;
      section.classList.remove("is-over-pile");
    });
  }

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
