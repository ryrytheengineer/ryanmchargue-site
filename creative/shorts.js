(() => {
  const SHORTS = [
    {
      company: "Zipline",
      src: "assets/shorts/zipline.mp4",
      role: "Creative Director",
      description: "Rapid Fire short-form",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-toured-ziplines-hq-last-week-and-saw-the-activity-7425256192236519424-O4MA",
    },
    {
      company: "Terra Kaffe",
      src: "assets/shorts/terra-kaffe.mp4",
      role: "Creative Director",
      description: "Coffee hardware",
    },
    {
      company: "Infinite Machine",
      src: "assets/shorts/infinite-machine.mp4",
      role: "Creative Director",
      description: "Rapid Fire founder cut",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-did-a-rapid-fire-with-joseph-cohen-co-founder-activity-7424930340533633024-48Im",
    },
    {
      company: "Light Phone",
      src: "assets/shorts/light-phone.mp4",
      role: "Creative Director",
      description: "Minimal phone",
    },
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.getElementById("shorts-viewer");
  const picker = document.getElementById("sv-picker");
  if (!root) return;

  const stage = root.querySelector(".sv-stage");
  const video = root.querySelector(".sv-video");
  const preload = root.querySelector(".sv-preload");
  const segments = root.querySelector(".sv-segments");
  const companyEl = root.querySelector(".sv-company");
  const roleEl = root.querySelector(".sv-role");
  const descEl = root.querySelector(".sv-desc");
  const linkEl = root.querySelector(".sv-link");
  const muteBtn = root.querySelector(".sv-mute");
  const closeBtn = root.querySelector(".sv-close");
  const pauseHint = root.querySelector(".sv-pause-hint");

  let index = 0;
  let active = true;
  let closed = false;
  let paused = false;
  let muted = true;
  let raf = 0;
  let swipe = null;
  let suppressTapUntil = 0;
  let focused = false;

  function buildPicker() {
    if (!picker) return;
    picker.innerHTML = "";
    SHORTS.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-pick";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
      btn.textContent = item.company;
      btn.addEventListener("click", () => {
        jumpTo(i);
        openPlayer();
      });
      picker.appendChild(btn);
    });
  }

  function syncPicker() {
    if (!picker) return;
    [...picker.querySelectorAll(".sv-pick")].forEach((btn, i) => {
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
    });
  }

  function buildSegments() {
    segments.innerHTML = "";
    SHORTS.forEach((item, i) => {
      const seg = document.createElement("button");
      seg.type = "button";
      seg.className = "sv-seg";
      seg.setAttribute("aria-label", `Play ${item.company}`);
      const fill = document.createElement("span");
      fill.className = "sv-seg-fill";
      seg.appendChild(fill);
      seg.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpTo(i);
        openPlayer();
      });
      segments.appendChild(seg);
    });
  }

  function fills() {
    return [...segments.querySelectorAll(".sv-seg-fill")];
  }

  function setMeta(item) {
    companyEl.textContent = item.company;
    if (roleEl) {
      roleEl.hidden = true;
      roleEl.textContent = "";
    }
    if (descEl) {
      descEl.hidden = true;
      descEl.textContent = "";
    }
    if (item.url) {
      linkEl.hidden = false;
      linkEl.href = item.url;
      linkEl.textContent = "View project ↗";
    } else {
      linkEl.hidden = true;
      linkEl.removeAttribute("href");
    }
  }

  function preloadNext() {
    const next = SHORTS[(index + 1) % SHORTS.length];
    if (!next || preload.dataset.src === next.src) return;
    preload.dataset.src = next.src;
    preload.src = next.src;
    preload.load();
  }

  function updateSegments(progress) {
    fills().forEach((fill, i) => {
      if (i < index) fill.style.transform = "scaleX(1)";
      else if (i > index) fill.style.transform = "scaleX(0)";
      else fill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
    });
  }

  function tick() {
    if (active && !closed && !paused && video.duration) {
      updateSegments(video.currentTime / video.duration);
    }
    raf = requestAnimationFrame(tick);
  }

  function playCurrent({ restart = true } = {}) {
    const item = SHORTS[index];
    if (!item) return;
    setMeta(item);
    syncPicker();
    if (restart || video.dataset.src !== item.src) {
      video.dataset.src = item.src;
      video.src = item.src;
      video.load();
    }
    video.muted = muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    if (closed) return;
    paused = false;
    pauseHint.hidden = true;
    stage.classList.remove("is-paused");
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        muted = true;
        video.muted = true;
        muteBtn.setAttribute("aria-pressed", "true");
        muteBtn.setAttribute("aria-label", "Unmute");
        video.play().catch(() => {});
      });
    }
    updateSegments(0);
    preloadNext();
    if (!reduceMotion) {
      stage.classList.remove("sv-enter");
      void stage.offsetWidth;
      stage.classList.add("sv-enter");
    }
  }

  function jumpTo(i) {
    if (!SHORTS.length) return;
    index = ((i % SHORTS.length) + SHORTS.length) % SHORTS.length;
    playCurrent({ restart: true });
  }

  function go(delta) {
    jumpTo(index + delta);
  }

  function togglePause() {
    if (closed) {
      openPlayer();
      return;
    }
    if (video.paused) {
      paused = false;
      pauseHint.hidden = true;
      stage.classList.remove("is-paused");
      video.play().catch(() => {});
    } else {
      paused = true;
      video.pause();
      pauseHint.hidden = false;
      stage.classList.add("is-paused");
    }
  }

  function closePlayer() {
    closed = true;
    active = false;
    paused = true;
    video.pause();
    pauseHint.hidden = false;
    stage.classList.add("is-paused");
    root.classList.add("is-closed");
    stage.blur();
  }

  function openPlayer() {
    closed = false;
    active = true;
    root.classList.remove("is-closed");
    paused = false;
    pauseHint.hidden = true;
    stage.classList.remove("is-paused");
    video.play().catch(() => {});
    stage.focus({ preventScroll: true });
  }

  function setActive(on) {
    if (closed) return;
    active = on;
    if (!on) {
      video.pause();
      paused = true;
      pauseHint.hidden = false;
      stage.classList.add("is-paused");
      return;
    }
    if (paused) {
      paused = false;
      pauseHint.hidden = true;
      stage.classList.remove("is-paused");
    }
    video.play().catch(() => {});
  }

  window.__shortsViewerOpen = () => focused && !closed;
  window.openShortsViewer = () => openPlayer();
  window.closeShortsViewer = () => closePlayer();

  buildPicker();
  buildSegments();
  playCurrent({ restart: true });
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.35);
        setActive(visible);
        if (visible && !closed && video.paused && !paused) playCurrent({ restart: false });
      },
      { threshold: [0, 0.35, 0.6] }
    );
    io.observe(root);
  }

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    muted = !muted;
    video.muted = muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePlayer();
    });
  }

  linkEl.addEventListener("click", (e) => e.stopPropagation());

  video.addEventListener("ended", () => {
    if (!closed) go(1);
  });

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
    if (e.target.closest("button, a")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, mode: "pending" };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (_) {}
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
      paused = true;
      pauseHint.hidden = false;
      stage.classList.add("is-paused");
    }
  });
})();
