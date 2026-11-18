/* Motion & Matter — the mark, in motion.

   The symbol is two ribbon forms folded through one another (the same outline, the second
   turned half a turn). Here it is the sound control for every film on the page, and it
   says what the sound is doing by how it holds itself:

     sound on, film running   the two forms slide along their shared diagonal, each to its
                              own slow rhythm, and the slot between them breathes
     sound on, film stopped   the mark at rest, exactly as drawn
     sound off                the forms fold shut: the slot closes and the mark draws in

   One system drives all of them. A control is any button carrying data-mm-sound="<selector
   of its video>" with an <svg class="mm"> inside; the mark only ever reads the video's own
   state (muted, paused, ended), so it cannot disagree with what is actually playing, and
   it never touches playback itself. Motion is a damped spring toward the state's pose plus
   a slow wander while sound is on, so every change of state is continuous. */
(() => {
  "use strict";

  const U = [0.8660254, -0.5];        // along the ribbons (30 degrees)
  const N = [0.5, 0.8660254];         // across the slot, from the upper form to the lower
  const HALF_SLOT = 40.44;            // half the slot's width, in the mark's own units
  const OPEN = { d: 0, o: 0 };                        // as drawn
  const SHUT = { d: 34, o: -(HALF_SLOT + 1.5) };      // slot closed, arms drawn in
  const STIFF = 170, DAMP = 22;       // spring: settles in about half a second, barely overshoots

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const marks = [];
  const moving = new Set();
  let raf = 0, then = 0;

  function draw(m) {
    const w = m.amp;
    // Two related but unequal rhythms, so the forms never quite repeat one another.
    const da = m.d + w * (26 * Math.sin(m.t * 1.75) + 11 * Math.sin(m.t * 2.9 + 1.3));
    const db = m.d + w * (26 * Math.sin(m.t * 1.75 + 0.9) + 11 * Math.sin(m.t * 2.4 + 2.1));
    const o = Math.min(0.6, m.o + w * (-7 - 7 * Math.sin(m.t * 1.2 + 0.5)));
    const ax = da * U[0] - o * N[0], ay = da * U[1] - o * N[1];
    const bx = -db * U[0] + o * N[0], by = -db * U[1] + o * N[1];
    m.a.setAttribute("transform", "translate(" + ax.toFixed(2) + " " + ay.toFixed(2) + ")");
    m.b.setAttribute("transform", "translate(" + bx.toFixed(2) + " " + by.toFixed(2) + ") rotate(180)");
  }

  function snap(m) {
    m.d = m.pose.d; m.o = m.pose.o; m.vd = m.vo = 0;
    m.amp = reduce.matches ? 0 : m.ampTo;
    draw(m);
  }

  function step(m, dt) {
    m.vd += (-STIFF * (m.d - m.pose.d) - DAMP * m.vd) * dt; m.d += m.vd * dt;
    m.vo += (-STIFF * (m.o - m.pose.o) - DAMP * m.vo) * dt; m.o += m.vo * dt;
    m.amp += (m.ampTo - m.amp) * (1 - Math.exp(-dt * 3.6));
    m.t += dt;
    draw(m);
    const still = Math.abs(m.d - m.pose.d) < 0.05 && Math.abs(m.o - m.pose.o) < 0.05 &&
      Math.abs(m.vd) < 0.05 && Math.abs(m.vo) < 0.05;
    return !(still && m.ampTo === 0 && m.amp < 0.003);
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - then) / 1000));
    then = now;
    moving.forEach((m) => {
      if (!m.seen) { snap(m); if (m.ampTo === 0) moving.delete(m); return; }
      if (!step(m, dt)) { snap(m); moving.delete(m); }
    });
    if (moving.size) raf = requestAnimationFrame(tick);
  }
  function wake(m) {
    moving.add(m);
    if (!raf) { then = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function sync(m) {
    const v = m.video;
    const muted = v.muted || v.volume === 0;
    const running = !v.paused && !v.ended;
    const state = muted ? "muted" : running ? "on" : "rest";
    if (state === m.state) return;
    m.state = state;
    m.svg.setAttribute("data-state", state);
    m.pose = muted ? SHUT : OPEN;
    m.ampTo = state === "on" ? 1 : 0;
    m.button.title = muted ? "Turn sound on" : "Turn sound off";
    if (reduce.matches || !m.seen || !m.ready) { snap(m); m.ready = true; if (m.ampTo && !reduce.matches) wake(m); return; }
    wake(m);
  }

  function bind(button) {
    const svg = button.querySelector("svg.mm");
    const video = document.querySelector(button.getAttribute("data-mm-sound"));
    if (!svg || !video) return;
    const m = {
      button, svg, video,
      a: svg.querySelector(".mm-a"), b: svg.querySelector(".mm-b"),
      d: SHUT.d, o: SHUT.o, vd: 0, vo: 0, amp: 0, ampTo: 0, t: marks.length * 1.7,
      pose: SHUT, state: "", seen: true, ready: false,
    };
    if (!m.a || !m.b) return;
    marks.push(m);
    ["volumechange", "play", "playing", "pause", "ended", "emptied"].forEach((e) => video.addEventListener(e, () => sync(m)));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([en]) => {
        m.seen = !!(en && en.isIntersecting);
        if (m.seen && m.ampTo && !reduce.matches) wake(m);
      }).observe(button);
    }
    sync(m);
  }

  Array.prototype.forEach.call(document.querySelectorAll("button[data-mm-sound]"), bind);
  const onPref = () => marks.forEach((m) => { snap(m); if (m.ampTo && !reduce.matches) wake(m); });
  if (reduce.addEventListener) reduce.addEventListener("change", onPref);
})();
