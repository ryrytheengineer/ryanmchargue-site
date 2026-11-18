/* Hero film and its wordmark switch.
   "Motion" runs the film, "Matter" holds the frame. The word that is true is pressed
   (solid); the other is only drawn. A frame the visitor chose to hold is set down as a
   print (--hold eases 0 to 1 and the CSS closes a paper border round it) and stays held
   until they run the film again. */
(() => {
  const stage = document.getElementById("film-stage");
  const video = document.getElementById("film-video");
  const playBtn = document.getElementById("film-play");
  const mute = document.getElementById("film-mute");
  const run = document.getElementById("film-run");
  const hold = document.getElementById("film-hold");
  if (!stage || !video || !playBtn || !mute || !run || !hold) return;

  const runState = document.getElementById("film-run-state");
  const holdState = document.getElementById("film-hold-state");
  const mark = stage.querySelector(".hero-mark");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  const START_AT = parseFloat(video.getAttribute("data-start")) || 0; // where the film opens
  let introSeeked = false;
  let held = false; // the visitor asked for this frame; nothing restarts the film for them
  let lastStamp = "";

  const stamp = (s) => {
    s = Math.max(0, Math.floor(s + 1e-6));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  /* ---------- Sound ---------- */
  function syncMute() {
    const muted = video.muted;
    stage.classList.toggle("is-muted", muted);
    mute.setAttribute("aria-pressed", muted ? "true" : "false");
    mute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    mute.classList.toggle("film-mute-pulse", muted && !video.paused);
  }

  /* ---------- The switch ---------- */
  function paintState(force) {
    const playing = stage.classList.contains("is-playing");
    const t = stamp(video.currentTime || 0);
    if (!force && t === lastStamp) return;
    lastStamp = t;
    const time = '<span class="tc">' + t + "</span>";
    if (runState) {
      runState.innerHTML = playing ? "Running " + time : "Run the film";
      runState.classList.toggle("is-now", playing);
    }
    if (holdState) {
      holdState.innerHTML = playing ? "Hold the frame" : "Held at " + time;
      holdState.classList.toggle("is-now", !playing);
    }
  }

  function setPlaying(on) {
    stage.classList.toggle("is-playing", on);
    // The centre button only ever appears for a film that did not start by itself.
    playBtn.hidden = on || held;
    run.setAttribute("aria-pressed", on ? "true" : "false");
    hold.setAttribute("aria-pressed", on ? "false" : "true");
    run.setAttribute("aria-label", on ? "Motion: the film is running" : "Motion: run the film");
    hold.setAttribute("aria-label", on ? "Matter: hold the frame" : "Matter: the frame is held");
    syncMute();
    paintState(true);
  }

  // --hold: eased, so the border of a held print closes rather than snaps.
  let holdNow = 0;
  let holdRaf = 0;
  function easeHold() {
    holdRaf = 0;
    const target = held ? 1 : 0;
    holdNow = reduce.matches ? target : holdNow + (target - holdNow) * 0.17;
    if (Math.abs(target - holdNow) < 0.002) holdNow = target;
    stage.style.setProperty("--hold", holdNow.toFixed(4));
    if (holdNow !== target) holdRaf = requestAnimationFrame(easeHold);
  }
  function setHeld(on) {
    held = on;
    stage.classList.toggle("is-held", on);
    if (!holdRaf) holdRaf = requestAnimationFrame(easeHold);
  }

  function canSeekIntro() {
    try {
      if (!video.seekable || !video.seekable.length) return video.readyState >= 1;
      return video.seekable.end(video.seekable.length - 1) >= START_AT;
    } catch (_) {
      return video.readyState >= 2;
    }
  }
  function seekIntro() {
    if (!canSeekIntro()) return false;
    try {
      if (Math.abs((video.currentTime || 0) - START_AT) > 0.2) video.currentTime = START_AT;
      introSeeked = true;
      return true;
    } catch (_) {
      return false;
    }
  }
  function start(opts) {
    const withSound = !(opts && opts.muted);
    video.muted = !withSound;
    if (video.ended || video.currentTime < START_AT - 0.05) seekIntro();
    const p = video.play();
    if (p && p.catch)
      p.catch(() => {
        video.muted = true;
        seekIntro();
        video.play().catch(() => {});
        setPlaying(true);
      });
    setPlaying(true);
  }

  function runFilm() {
    setHeld(false);
    if (video.paused) start({ muted: video.muted });
  }
  function holdFrame() {
    setHeld(true);
    if (!video.paused) video.pause();
    setPlaying(false);
  }

  run.addEventListener("click", runFilm);
  hold.addEventListener("click", holdFrame);
  if (runState) runState.addEventListener("click", runFilm);
  if (holdState) holdState.addEventListener("click", holdFrame);
  playBtn.addEventListener("click", () => {
    setHeld(false);
    start({ muted: false });
  });
  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    if (!video.muted && video.paused) runFilm();
    syncMute();
  });

  video.addEventListener("ended", () => {
    setPlaying(false);
    seekIntro();
  });
  video.addEventListener("pause", () => {
    if (!video.ended) setPlaying(false);
  });
  video.addEventListener("play", () => setPlaying(true));
  video.addEventListener("timeupdate", () => paintState(false));
  video.addEventListener("seeked", () => paintState(true));

  // Seek only once the intro timestamp is actually available (avoids stalled start on large files).
  const onReady = () => {
    if (!introSeeked) seekIntro();
  };
  video.addEventListener("loadedmetadata", onReady);
  video.addEventListener("canplay", onReady);
  video.addEventListener("progress", onReady);

  // Pause when scrolled off-hero so shorts aren't fighting audio/CPU. A frame the visitor
  // is holding stays held when they come back.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          if (video.paused && !video.ended && !held) {
            if (video.currentTime < START_AT - 0.05) seekIntro();
            video.play().catch(() => {});
          }
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(stage);
  }


  /* ---------- Ambient: the bars around the film take its light ---------- */
  const ambient = stage.querySelector(".hero-ambient");
  const actx = ambient && ambient.getContext ? ambient.getContext("2d", { alpha: false }) : null;
  let ambientTimer = 0;
  function paintAmbient() {
    if (!actx || video.readyState < 2) return;
    try { actx.drawImage(video, 0, 0, ambient.width, ambient.height); } catch (_) {}
  }
  function ambientLoop() {
    clearTimeout(ambientTimer);
    paintAmbient();
    if (!video.paused && !video.ended) ambientTimer = setTimeout(ambientLoop, reduce.matches ? 1000 : 120);
  }
  video.addEventListener("play", ambientLoop);
  video.addEventListener("seeked", paintAmbient);
  video.addEventListener("loadeddata", paintAmbient);

  /* ---------- Fit: the wordmark is one line, edge to edge ----------
     The CSS size assumes the site's two faces. If a fallback sets wider, trim to fit. */
  function fit() {
    if (!mark) return;
    mark.style.fontSize = "";
    const words = mark.querySelectorAll(".hero-word");
    if (words.length < 2) return;
    const avail = mark.clientWidth;
    const used = words[0].offsetWidth + words[1].offsetWidth;
    const size = parseFloat(getComputedStyle(mark).fontSize);
    const need = used + size * 0.16; // the two words and a breath between them
    if (need > avail && avail > 0) mark.style.fontSize = ((size * avail) / need).toFixed(2) + "px";
  }
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("load", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  stage.classList.add("is-live");
  video.muted = true;
  seekIntro();
  const auto = video.play();
  if (auto && auto.catch) auto.catch(() => setPlaying(false));
  else setPlaying(true);
  paintState(true);
})();
