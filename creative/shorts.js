/* Short-Form.
   Four vertical films, played in order. The name of the one that is playing stands beside
   it, and its running time counts on the other side. */
(() => {
  const SHORTS = [
    {
      company: "Zipline",
      lines: ["Zipline"],
      src: "assets/shorts/zipline.mp4",
      poster: "assets/shorts/zipline-poster.jpg",
      role: "Creative Director",
      description: "Rapid Fire short-form",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-toured-ziplines-hq-last-week-and-saw-the-activity-7425256192236519424-O4MA",
      dur: 59.033,
    },
    {
      company: "Terra Kaffe",
      lines: ["Terra", "Kaffe"],
      src: "assets/shorts/terra-kaffe.mp4",
      poster: "assets/shorts/terra-kaffe-poster.jpg",
      role: "Creative Director",
      description: "Coffee hardware",
      dur: 27.7,
    },
    {
      company: "Infinite Machine",
      lines: ["Infinite", "Machine"],
      src: "assets/shorts/infinite-machine.mp4",
      poster: "assets/shorts/infinite-machine-poster.jpg",
      role: "Creative Director",
      description: "Rapid Fire founder cut",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-did-a-rapid-fire-with-joseph-cohen-co-founder-activity-7424930340533633024-48Im",
      dur: 25.2,
    },
    {
      company: "Light Phone",
      lines: ["Light", "Phone"],
      src: "assets/shorts/light-phone.mp4",
      poster: "assets/shorts/light-phone-poster.jpg",
      role: "Creative Director",
      description: "Minimal phone",
      dur: 24.667,
    },
  ];

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.getElementById("shorts-viewer");
  const picker = document.getElementById("sv-picker");
  if (!root) return;

  const stage = root.querySelector(".sv-stage");
  const video = root.querySelector(".sv-video");
  const ghost = root.querySelector(".sv-ghost");
  const preload = root.querySelector(".sv-preload");
  const nameEl = root.querySelector(".sf-name");
  const nameSet = root.querySelector(".sf-name-set");
  const clock = root.querySelector("[data-sf-clock]");
  const linkEl = root.querySelector(".sv-link");
  const muteBtn = root.querySelector(".sv-mute");
  const muteLabel = root.querySelector(".sv-mute-label");
  const pauseHint = root.querySelector(".sv-pause-hint");
  if (!stage || !video || !muteBtn) return;

  let index = 0;
  let active = true; // on screen
  let closed = false;
  let paused = false;
  let muted = true;
  let raf = 0;
  let swipe = null;
  let suppressTapUntil = 0;
  let focused = false;
  let lastStamp = "";
  let tabs = [];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stamp = (s) => {
    s = Math.max(0, Math.floor(s + 1e-6));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  const cells = (text) => text.replace(/\d/g, "<i>$&</i>"); // fixed-width digits, so the clock does not shiver

  /* ---------- The index: four rows, in the order they play ---------- */
  function buildPicker() {
    if (!picker) return;
    picker.innerHTML = "";
    tabs = SHORTS.map((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-pick";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
      btn.setAttribute("aria-label", item.company + ", " + stamp(item.dur));
      btn.innerHTML =
        '<span class="sf-num" aria-hidden="true">' + (i + 1) + "</span>" +
        '<span class="sf-pick-name" aria-hidden="true">' + esc(item.company) + "</span>" +
        '<span class="tc" aria-hidden="true">' + stamp(item.dur) + "</span>";
      btn.addEventListener("click", () => {
        jumpTo(i);
        openPlayer();
      });
      picker.appendChild(btn);
      return btn;
    });
  }
  function syncPicker() {
    tabs.forEach((btn, i) => {
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
      if (i !== index) btn.style.removeProperty("--p");
    });
  }

  /* ---------- The name: rolls out and in like a counter ---------- */
  function setName(item, animate) {
    if (!nameSet) return;
    if (animate && !reduce.matches) {
      const old = nameSet.cloneNode(true);
      old.classList.remove("is-entering");
      old.classList.add("is-leaving");
      nameEl.appendChild(old);
      setTimeout(() => old.remove(), 460);
    }
    nameSet.innerHTML = item.lines
      .map((l, i) => '<span class="sf-line"><span class="sf-roll" style="--i:' + i + '"><span class="sf-word">' + esc(l) + "</span></span></span>")
      .join("");
    nameSet.classList.remove("is-entering");
    if (animate && !reduce.matches) {
      void nameSet.offsetWidth;
      nameSet.classList.add("is-entering");
    }
  }

  function setMeta(item) {
    stage.setAttribute("aria-label", item.company + ", short-form film. Arrow keys change film, space pauses, M mutes.");
    if (item.url) {
      linkEl.hidden = false;
      linkEl.href = item.url;
      linkEl.textContent = "View project ↗";
    } else {
      linkEl.hidden = true;
      linkEl.removeAttribute("href");
    }
  }

  function setMuted(on) {
    muted = on;
    video.muted = on;
    muteBtn.setAttribute("aria-pressed", on ? "true" : "false");
    muteBtn.setAttribute("aria-label", on ? "Unmute" : "Mute");
    if (muteLabel) muteLabel.textContent = on ? "Sound off" : "Sound on";
  }

  function preloadNext() {
    const next = SHORTS[(index + 1) % SHORTS.length];
    if (!next || !preload || preload.dataset.src === next.src) return;
    preload.dataset.src = next.src;
    preload.src = next.src;
    preload.load();
  }

  /* ---------- The film: the old one slides out as the new one slides in ---------- */
  function slide(dir) {
    if (reduce.matches || !ghost || !stage.animate) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    ghost.width = Math.round(w * dpr);
    ghost.height = Math.round(h * dpr);
    try {
      // The last frame that was showing stands in for the film that is leaving.
      ghost.getContext("2d").drawImage(video, 0, 0, ghost.width, ghost.height);
    } catch (_) {
      return;
    }
    ghost.hidden = false;
    const timing = { duration: 460, easing: "cubic-bezier(.16,.79,.22,1)" };
    const gap = 10; // a frame line between the two
    video.animate([{ transform: "translate3d(" + dir * (w + gap) + "px,0,0)" }, { transform: "translate3d(0,0,0)" }], timing);
    const out = ghost.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(" + -dir * (w + gap) + "px,0,0)" }], timing);
    out.onfinish = out.oncancel = () => {
      ghost.hidden = true;
    };
  }

  function paintClock(force) {
    const t = stamp(video.currentTime || 0);
    if (!force && t === lastStamp) return;
    lastStamp = t;
    if (clock) clock.innerHTML = cells(t);
  }

  // While a film plays: its running time, and how far through it is on its row of the index.
  function tick() {
    const playing = active && !closed && !paused && !video.paused;
    if (!playing) {
      raf = 0;
      return;
    }
    if (video.duration) {
      paintClock(false);
      const tab = tabs[index];
      if (tab) tab.style.setProperty("--p", Math.min(1, video.currentTime / video.duration).toFixed(4));
    }
    raf = requestAnimationFrame(tick);
  }
  function wake() {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  }

  function showPaused(on) {
    paused = on;
    pauseHint.hidden = !on;
    stage.classList.toggle("is-paused", on);
  }

  function playCurrent({ restart = true } = {}) {
    const item = SHORTS[index];
    if (!item) return;
    setMeta(item);
    syncPicker();
    if (restart || video.dataset.src !== item.src) {
      video.dataset.src = item.src;
      video.poster = item.poster;
      video.src = item.src;
      video.load();
      lastStamp = "";
      if (clock) clock.innerHTML = cells("0:00");
    }
    setMuted(muted);
    if (closed) return;
    showPaused(false);
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        setMuted(true);
        video.play().catch(() => {});
      });
    }
    preloadNext();
    wake();
  }

  function jumpTo(i, dir) {
    if (!SHORTS.length) return;
    const next = ((i % SHORTS.length) + SHORTS.length) % SHORTS.length;
    const changed = next !== index;
    if (dir == null) dir = next >= index ? 1 : -1;
    root.style.setProperty("--dir", String(dir));
    if (changed) slide(dir);
    index = next;
    setName(SHORTS[index], changed);
    playCurrent({ restart: true });
  }

  function go(delta) {
    jumpTo(index + delta, delta > 0 ? 1 : -1);
  }

  function togglePause() {
    if (closed) {
      openPlayer();
      return;
    }
    if (video.paused) {
      showPaused(false);
      video.play().catch(() => {});
      wake();
    } else {
      video.pause();
      showPaused(true);
    }
  }

  function closePlayer() {
    closed = true;
    active = false;
    video.pause();
    showPaused(true);
    root.classList.add("is-closed");
    stage.blur();
  }

  function openPlayer() {
    closed = false;
    active = true;
    root.classList.remove("is-closed");
    showPaused(false);
    video.play().catch(() => {});
    stage.focus({ preventScroll: true });
    wake();
  }

  function setActive(on) {
    if (closed) return;
    active = on;
    if (!on) {
      video.pause();
      showPaused(true);
      return;
    }
    if (paused) showPaused(false);
    video.play().catch(() => {});
    wake();
  }

  window.__shortsViewerOpen = () => focused && !closed;
  window.openShortsViewer = () => openPlayer();
  window.closeShortsViewer = () => closePlayer();

  buildPicker();
  setName(SHORTS[index], false);
  playCurrent({ restart: true });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.35);
        setActive(visible);
        if (visible && !closed && video.paused && !paused) playCurrent({ restart: false });
      },
      { threshold: [0, 0.35, 0.6] }
    );
    io.observe(stage);
  }

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMuted(!muted);
  });
  linkEl.addEventListener("click", (e) => e.stopPropagation());

  video.addEventListener("ended", () => {
    if (!closed) go(1);
  });
  video.addEventListener("playing", wake);

  root.querySelector(".sv-hit-left").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    go(-1);
    openPlayer();
  });
  root.querySelector(".sv-hit-right").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    go(1);
    openPlayer();
  });
  root.querySelector(".sv-hit-center").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    togglePause();
  });

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, mode: "pending" };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    swipe.dx = e.clientX - swipe.x;
    swipe.dy = e.clientY - swipe.y;
    if (swipe.mode === "pending" && Math.hypot(swipe.dx, swipe.dy) > 10) {
      swipe.mode = Math.abs(swipe.dx) > Math.abs(swipe.dy) ? "h" : "v";
    }
  });
  function endSwipe(e) {
    if (!swipe || (e && e.pointerId !== swipe.id)) return;
    const s = swipe;
    swipe = null;
    if (s.mode === "h" && Math.abs(s.dx) > 48) {
      suppressTapUntil = Date.now() + 350;
      go(s.dx < 0 ? 1 : -1);
      openPlayer();
    }
  }
  stage.addEventListener("pointerup", endSwipe);
  stage.addEventListener("pointercancel", endSwipe);

  stage.addEventListener("focus", () => {
    focused = true;
  });
  stage.addEventListener("blur", () => {
    focused = false;
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (!focused && document.activeElement !== stage) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        go(1);
        openPlayer();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        go(-1);
        openPlayer();
      } else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "m") {
        e.preventDefault();
        muteBtn.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePlayer();
      }
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      video.pause();
      showPaused(true);
    }
  });
})();
