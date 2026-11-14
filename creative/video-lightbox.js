(() => {
  const lightbox = document.getElementById("video-lightbox");
  const player = document.getElementById("video-lightbox-player");
  const label = document.getElementById("video-lightbox-label");
  const closeBtn = document.getElementById("video-lightbox-close");
  if (!lightbox || !player || !closeBtn) return;

  let open = false;
  let lastFocus = null;

  function openVideo(src, title, poster) {
    if (!src) return;
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
    const play = () => {
      try {
        player.currentTime = 0;
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
      trigger.getAttribute("data-video-poster") || ""
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
