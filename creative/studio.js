(() => {
  const root = document.getElementById("hwn-studio");
  if (!root) return;

  const compare = root.querySelector("[data-studio-compare]");
  // The wall is the comparison plus the title above it: one object, slid as one.
  const wall = root.querySelector("[data-studio-wall]") || compare;
  const title = root.querySelector(".studio-title");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const afterLayer = root.querySelector(".studio-layer-after");
  const handle = root.querySelector(".studio-handle");
  const expandBtn = root.querySelector("[data-studio-expand]");

  const lightbox = document.getElementById("studio-lightbox");
  const lbImg = document.getElementById("studio-lightbox-img");
  const lbLabel = document.getElementById("studio-lightbox-label");
  const lbIndex = document.getElementById("studio-lightbox-index");
  const lbClose = document.getElementById("studio-lightbox-close");
  const lbPrev = document.getElementById("studio-lightbox-prev");
  const lbNext = document.getElementById("studio-lightbox-next");

  const gallery = [
    {
      src: "assets/studio/before-build.webp", fallback: "assets/studio/before-build.jpg",
      label: "Before",
      alt: "HWN Studio before buildout",
    },
    {
      src: "assets/studio/before-setup.webp", fallback: "assets/studio/before-setup.jpg",
      label: "Before",
      alt: "HWN Studio during early setup",
    },
    {
      src: "assets/studio/after-set.webp", fallback: "assets/studio/after-set.jpg",
      label: "After",
      alt: "HWN Studio finished production set",
    },
    {
      src: "assets/studio/after-desk.webp", fallback: "assets/studio/after-desk.jpg",
      label: "After",
      alt: "HWN Studio desk detail",
    },
    {
      src: "assets/studio/after-angle.webp", fallback: "assets/studio/after-angle.jpg",
      label: "After",
      alt: "HWN Studio low angle",
    },
    {
      src: "assets/studio/after-wide.webp", fallback: "assets/studio/after-wide.jpg",
      label: "After",
      alt: "HWN Studio wide set",
    },
  ];

  let split = 52;
  let dragging = false;
  let gesture = null;
  // The wall has weight: let go while it is moving and it carries on a little.
  let glide = 0; // percent per second
  let glideRaf = 0;
  let glideLast = 0;
  let samples = [];
  let lbOpen = false;
  let lbIndexNum = 0;
  let lastFocus = null;

  function setSplit(pct) {
    split = Math.max(4, Math.min(96, pct));
    const value = Math.round(split * 100) / 100 + "%";
    if (compare) {
      compare.style.setProperty("--split", value);
      compare.setAttribute("aria-valuenow", String(Math.round(split)));
    }
    if (wall && wall !== compare) wall.style.setProperty("--split", value);
    if (afterLayer) afterLayer.style.setProperty("--split", value);
    if (handle) handle.style.left = value;
  }

  function splitFromEvent(e) {
    if (!compare) return;
    const rect = compare.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
    if (clientX == null) return;
    setSplit(((clientX - rect.left) / rect.width) * 100);
    samples.push({ t: e.timeStamp, v: split });
    if (samples.length > 6) samples.shift();
  }

  function stopGlide() {
    glide = 0;
    if (glideRaf) cancelAnimationFrame(glideRaf);
    glideRaf = 0;
  }
  function glideStep(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - glideLast) / 1000));
    glideLast = now;
    const before = split;
    setSplit(split + glide * dt);
    glide *= Math.exp(-5.2 * dt);
    // Stops at either end of the rail, or when it has run out of push.
    if (Math.abs(glide) < 1.2 || split === before) {
      stopGlide();
      return;
    }
    glideRaf = requestAnimationFrame(glideStep);
  }
  function release(e) {
    if (reduce.matches || samples.length < 2) return;
    const newest = samples[samples.length - 1];
    if (e && e.timeStamp - newest.t > 90) return; // it had already come to rest in the hand
    let oldest = newest;
    for (let i = samples.length - 2; i >= 0; i--) {
      if (newest.t - samples[i].t > 110) break;
      oldest = samples[i];
    }
    const span = newest.t - oldest.t;
    if (span <= 0) return;
    glide = Math.max(-160, Math.min(160, ((newest.v - oldest.v) / span) * 1000));
    if (Math.abs(glide) < 8) return;
    glideLast = performance.now();
    glideRaf = requestAnimationFrame(glideStep);
  }

  if (compare) {
    const startDrag = (e) => {
      dragging = true;
      stopGlide();
      samples = [];
      compare.classList.add("is-dragging");
      wall.classList.add("is-dragging");
      try {
        wall.setPointerCapture(e.pointerId);
      } catch (_) {}
      splitFromEvent(e);
    };

    const endDrag = (e) => {
      if (!gesture || (e && e.pointerId != null && gesture.id !== e.pointerId)) return;
      const wasDragging = gesture && gesture.mode === "drag";
      gesture = null;
      dragging = false;
      compare.classList.remove("is-dragging");
      wall.classList.remove("is-dragging");
      if (wasDragging) {
        try {
          wall.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (e && e.type === "pointerup") release(e);
      }
    };

    wall.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-studio-expand]")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const onHandle = !!e.target.closest(".studio-handle");
      // Mouse or direct handle grab scrub immediately; other touch waits so page can still scroll.
      gesture = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        mode: e.pointerType === "mouse" || onHandle ? "drag" : "pending",
      };
      if (gesture.mode === "drag") {
        startDrag(e);
        e.preventDefault();
      }
    });

    wall.addEventListener("pointermove", (e) => {
      if (!gesture || e.pointerId !== gesture.id) return;
      if (gesture.mode === "pending") {
        const dx = e.clientX - gesture.startX;
        const dy = e.clientY - gesture.startY;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          gesture.mode = "scroll";
          return;
        }
        gesture.mode = "drag";
        startDrag(e);
        e.preventDefault();
        return;
      }
      if (gesture.mode === "drag") {
        splitFromEvent(e);
        e.preventDefault();
      }
    });

    wall.addEventListener("pointerup", endDrag);
    wall.addEventListener("pointercancel", endDrag);
    wall.addEventListener("lostpointercapture", (e) => {
      // Only the wall losing the pointer ends the drag. A touch that began on something
      // inside it reports losing its own capture when the wall takes over; that is the
      // drag starting, not ending.
      if (gesture && e.pointerId === gesture.id && e.target === wall) endDrag(e);
    });

    compare.addEventListener("keydown", (e) => {
      if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") stopGlide();
      if (e.key === "ArrowLeft") {
        setSplit(split - 4);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowRight") {
        setSplit(split + 4);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Home") {
        setSplit(4);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "End") {
        setSplit(96);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Enter" || e.key === " ") {
        openLightbox(2);
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  setSplit(52);

  // The title is one line from one end of the wall to the other. The CSS size assumes
  // the site's grotesk; this trims it so the letters' ink meets both ends exactly.
  function fitTitle() {
    if (!title || !wall) return;
    title.style.fontSize = "";
    const text = title.firstChild;
    if (!text || text.nodeType !== 3) return;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (let pass = 0; pass < 2; pass++) {
      const size = parseFloat(getComputedStyle(title).fontSize);
      // Ink, not advance: less the H's side-bearing, plus the last letter's overhang.
      const ink = range.getBoundingClientRect().width - size * 0.064;
      const want = wall.clientWidth;
      if (!ink || !want || Math.abs(ink - want) / want < 0.004) break;
      title.style.fontSize = ((size * want) / ink).toFixed(2) + "px";
    }
  }
  fitTitle();
  window.addEventListener("resize", fitTitle);
  window.addEventListener("load", fitTitle);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  if ("ResizeObserver" in window && wall) new ResizeObserver(fitTitle).observe(wall);

  function openLightbox(index) {
    if (!lightbox || !lbImg) return;
    lbIndexNum = (index + gallery.length) % gallery.length;
    const item = gallery[lbIndexNum];
    lastFocus = document.activeElement;
    lbImg.onerror = () => {
      if (item.fallback && lbImg.src.indexOf(item.fallback) === -1) lbImg.src = item.fallback;
    };
    lbImg.src = item.src;
    lbImg.alt = item.alt;
    if (lbLabel) lbLabel.textContent = item.label;
    if (lbIndex)
      lbIndex.textContent =
        String(lbIndexNum + 1).padStart(2, "0") +
        " / " +
        String(gallery.length).padStart(2, "0");
    lightbox.hidden = false;
    lightbox.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    lbOpen = true;
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || !lbOpen) return;
    lightbox.classList.remove("is-open");
    lightbox.hidden = true;
    lbImg.removeAttribute("src");
    document.documentElement.style.overflow = "";
    lbOpen = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function stepLightbox(dir) {
    openLightbox(lbIndexNum + dir);
  }

  if (expandBtn) {
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(split < 50 ? 0 : 2);
    });
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-studio-open]");
    if (!btn) return;
    e.preventDefault();
    const src = btn.getAttribute("data-studio-open") || "";
    const base = src.replace(/\.(jpg|webp)$/i, "");
    const index = gallery.findIndex((g) => (g.src || "").replace(/\.(jpg|webp)$/i, "") === base || (g.fallback || "") === src);
    openLightbox(index >= 0 ? index : 0);
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbPrev) lbPrev.addEventListener("click", () => stepLightbox(-1));
  if (lbNext) lbNext.addEventListener("click", () => stepLightbox(1));
  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!lbOpen) return;
    if (e.key === "Escape") {
      closeLightbox();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      stepLightbox(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      stepLightbox(1);
      e.preventDefault();
    }
  });

  // Touch swipe in lightbox
  let touchX = null;
  if (lightbox) {
    lightbox.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    lightbox.addEventListener(
      "touchend",
      (e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) < 48) return;
        stepLightbox(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );
  }
})();
