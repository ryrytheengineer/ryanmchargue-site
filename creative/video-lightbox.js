(() => {
  const lightbox = document.getElementById("video-lightbox");
  const player = document.getElementById("video-lightbox-player");
  const label = document.getElementById("video-lightbox-label");
  const closeBtn = document.getElementById("video-lightbox-close");
  if (!lightbox || !player || !closeBtn) return;

  let open = false;
  let lastFocus = null;
  let session = 0; // which opening the pending "start playing" belongs to

  // `at` (seconds) starts the film part-way in: plates, voices and contact-sheet frames
  // open it at the moment they show.
  function openVideo(src, title, poster, at) {
    if (!src) return;
    const startAt = Number.isFinite(at) && at > 0 ? at : 0;
    lastFocus = document.activeElement;
    if (label) label.textContent = title || "Film";
    player.pause();
    // Keep poster visible until playback actually starts (avoids a black flash while buffering).
    player.poster =
      poster ||
      player.getAttribute("data-poster") ||
      player.getAttribute("poster") ||
      "";
    player.removeAttribute("src");
    player.load();
    player.src = src;
    lightbox.hidden = false;
    lightbox.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    open = true;
    closeBtn.focus();
    lightbox.dispatchEvent(new CustomEvent("videolightbox:open", { bubbles: false }));
    const mine = ++session;
    let started = false;
    const play = () => {
      // Once per opening, and never for a film that has since been closed or replaced.
      if (started || mine !== session) return;
      started = true;
      try {
        player.currentTime = startAt;
      } catch (_) {}
      const p = player.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    if (player.readyState >= 2) play();
    else {
      player.addEventListener("loadeddata", play, { once: true });
      player.addEventListener("canplay", play, { once: true });
    }
  }

  function closeVideo() {
    if (!open) return;
    session++;
    player.pause();
    player.removeAttribute("src");
    player.load();
    lightbox.classList.remove("is-open");
    lightbox.hidden = true;
    document.documentElement.style.overflow = "";
    open = false;
    lightbox.dispatchEvent(new CustomEvent("videolightbox:close", { bubbles: false }));
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-open-video]");
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    openVideo(
      trigger.getAttribute("data-open-video"),
      trigger.getAttribute("data-video-title") || trigger.textContent.trim(),
      trigger.getAttribute("data-video-poster") || "",
      parseFloat(trigger.getAttribute("data-video-at"))
    );
  });

  closeBtn.addEventListener("click", closeVideo);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeVideo();
  });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeVideo();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && open) player.pause();
  });

  window.__videoLightboxOpen = () => open;
})();
