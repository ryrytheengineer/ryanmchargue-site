/* The Light: the preview plays muted while on screen. The title is the film's own light laid
   left to right, and it fills as the film plays; it is also the timeline, so pressing or
   dragging on it moves the film. The marks under it are the editor's notes: the one the film
   has reached shows beside it. */
(function () {
  Array.prototype.forEach.call(document.querySelectorAll("[data-light]"), setup);
  function setup(root) {
  const video = root.querySelector("video");
  const notes = Array.prototype.slice.call(root.querySelectorAll(".light-note"));
  const lit = root.querySelector("[data-light-lit]");
  const rail = root.querySelector("[data-light-rail]");
  const head = root.querySelector(".light-head");
  const now = root.querySelector("[data-light-now]");
  const sound = root.querySelector("[data-light-sound]");
  if (!video || !lit || !head) return;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const starts = notes.map((n) => +n.dataset.start);
  let dur = +root.dataset.duration || 84.09;
  // Without motion the film waits to be asked, so the word stays fully lit until then.
  let started = !reduced;
  let shown = -1;
  let raf = 0;
  root.classList.add("is-live");

  const clock = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

  const pins = notes.map((n, i) => {
    const b = document.createElement("button");
    const tc = n.querySelector(".tc").textContent;
    b.type = "button";
    b.className = "light-pin";
    b.style.setProperty("--at", (starts[i] / dur).toFixed(4));
    b.setAttribute("aria-label", tc + ". " + n.querySelector(".light-note-text").textContent);
    b.innerHTML = '<i></i><span class="tc">' + tc + "</span>";
    b.addEventListener("click", () => go(starts[i], true));
    rail.appendChild(b);
    n.addEventListener("click", () => go(starts[i], true));
    return b;
  });

  const scrub = document.createElement("div");
  scrub.className = "light-scrub";
  scrub.tabIndex = 0;
  scrub.setAttribute("role", "slider");
  scrub.setAttribute("aria-label", "Position in the film");
  scrub.setAttribute("aria-valuemin", "0");
  scrub.setAttribute("aria-valuemax", String(Math.round(dur)));
  head.insertBefore(scrub, rail || null);

  function paint() {
    const t = video.currentTime || 0;
    const f = started ? Math.min(1, Math.max(0, t / dur)) : 1;
    lit.setAttribute("width", (4 + 1000 * f).toFixed(1));
    if (now) now.style.setProperty("--p", (started ? f : 0).toFixed(4));
    let i = 0;
    for (let n = 0; n < starts.length; n++) if (t >= starts[n] - 0.01) i = n;
    if (notes.length && i !== shown) {
      shown = i;
      notes.forEach((n, k) => n.parentNode.classList.toggle("is-current", k === i));
      pins.forEach((p, k) => p.classList.toggle("is-current", k === i));
    }
    scrub.setAttribute("aria-valuenow", String(Math.round(t)));
    scrub.setAttribute("aria-valuetext", clock(t));
  }
  function loop() {
    paint();
    raf = video.paused ? 0 : requestAnimationFrame(loop);
  }
  function go(t, show) {
    started = true;
    video.currentTime = Math.min(dur - 0.1, Math.max(0, t)) + 0.02;
    if (!reduced || !video.paused) video.play().catch(() => {});
    paint();
    if (!show) return;
    const r = video.getBoundingClientRect();
    const seen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (seen < r.height * 0.6) video.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }

  video.addEventListener("loadedmetadata", () => {
    if (isFinite(video.duration) && video.duration > 1) dur = video.duration;
  });
  video.addEventListener("play", () => { started = true; if (!raf) loop(); });
  ["pause", "seeked", "timeupdate"].forEach((e) => video.addEventListener(e, paint));

  // Press or drag on the word to move through the film.
  let dragging = false;
  const at = (e) => {
    const r = scrub.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * dur;
  };
  scrub.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    dragging = true;
    try { scrub.setPointerCapture(e.pointerId); } catch (_) {}
    go(at(e), false);
  });
  scrub.addEventListener("pointermove", (e) => { if (dragging) go(at(e), false); });
  ["pointerup", "pointercancel"].forEach((n) => scrub.addEventListener(n, () => { dragging = false; }));
  scrub.addEventListener("keydown", (e) => {
    const t = video.currentTime || 0;
    const step = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 }[e.key];
    if (step) go(t + step, false);
    else if (e.key === "Home") go(0, false);
    else if (e.key === "End") go(dur - 1, false);
    else return;
    e.preventDefault();
  });

  // The film itself stops and starts on a press.
  video.addEventListener("click", () => { if (video.paused) { started = true; video.play().catch(() => {}); } else video.pause(); });

  function setSound(on) {
    video.muted = !on;
    if (!sound) return;
    sound.classList.toggle("is-on", on);
    sound.setAttribute("aria-pressed", on ? "false" : "true");
    sound.setAttribute("aria-label", on ? "Mute" : "Unmute");
  }
  if (sound) sound.addEventListener("click", () => {
    if (!video.muted) { setSound(false); return; }
    // One film speaks at a time.
    Array.prototype.forEach.call(document.querySelectorAll(".reel-sound.is-on"), (b) => { if (b !== sound) b.click(); });
    setSound(true);
    started = true;
    video.play().catch(() => {});
  });
  // If another film on the page starts speaking, this one goes quiet.
  ["volumechange", "play"].forEach((n) => document.addEventListener(n, (e) => {
    const v = e.target;
    if (v !== video && v && v.tagName === "VIDEO" && !v.muted && !v.paused && !video.muted) setSound(false);
  }, true));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !reduced) video.play().catch(() => {});
      else if (!en.isIntersecting) { video.pause(); setSound(false); }
    }, { threshold: 0.35 }).observe(video);
  }
  paint();
  }
})();
