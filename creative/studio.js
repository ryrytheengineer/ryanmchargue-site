(() => {
  const root = document.getElementById("hwn-studio");
  if (!root) return;

  const compare = root.querySelector("[data-studio-compare]");
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
  }

  if (compare) {
    const startDrag = (e) => {
      dragging = true;
      compare.classList.add("is-dragging");
      try {
        compare.setPointerCapture(e.pointerId);
      } catch (_) {}
      splitFromEvent(e);
    };

    const endDrag = (e) => {
      if (!gesture || (e && e.pointerId != null && gesture.id !== e.pointerId)) return;
      const wasDragging = gesture && gesture.mode === "drag";
      gesture = null;
      dragging = false;
      compare.classList.remove("is-dragging");
      if (wasDragging) {
        try {
          compare.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    compare.addEventListener("pointerdown", (e) => {
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

    compare.addEventListener("pointermove", (e) => {
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

    compare.addEventListener("pointerup", endDrag);
    compare.addEventListener("pointercancel", endDrag);
    compare.addEventListener("lostpointercapture", (e) => {
      if (gesture && e.pointerId === gesture.id) endDrag(e);
    });

    compare.addEventListener("keydown", (e) => {
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
