(() => {
  const lightbox = document.getElementById("video-lightbox");
  const player = document.getElementById("video-lightbox-player");
  const label = document.getElementById("video-lightbox-label");
  const closeBtn = document.getElementById("video-lightbox-close");
  if (!lightbox || !player || !closeBtn) return;

  let open = false;
  let lastFocus = null;
  let session = 0; // which opening the pending "start playing" belongs to
  let origin = null; // the still this film was opened from, if it has one
  let leaving = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // A film opened from a still grows out of that still, and goes back into it.
  function originFor(trigger) {
    const card = trigger.closest(".project-card");
    if (card) return card.querySelector(".photo");
    if (trigger.matches(".case-study-media")) return trigger;
    return trigger.querySelector("img, .frame-img");
  }
  function offset(el) {
    if (!el || !el.isConnected) return null;
    const from = el.getBoundingClientRect();
    const to = player.getBoundingClientRect();
    if (!from.width || !to.width || from.bottom < 0 || from.top > window.innerHeight) return null;
    const scale = Math.max(from.width / to.width, from.height / to.height);
    const x = from.left + from.width / 2 - (to.left + to.width / 2);
    const y = from.top + from.height / 2 - (to.top + to.height / 2);
    return "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) scale(" + scale.toFixed(4) + ")";
  }
  function arrive() {
    player.style.transition = "none";
    player.style.transform = "";
    const start = reduce.matches ? null : offset(origin);
    if (!start) return;
    player.style.transform = start;
    void player.offsetWidth;
    player.style.transition = "transform .58s var(--ease, cubic-bezier(.16,.79,.22,1))";
    player.style.transform = "";
  }

  // `at` (seconds) starts the film part-way in: plates, voices and contact-sheet frames
  // open it at the moment they show.
  // "yt:<id>" plays the film from YouTube in the same overlay, at full resolution.
  let frame = null;
  function clearYouTube() {
    if (frame) { frame.remove(); frame = null; }
    player.hidden = false;
  }
  function openYouTube(id, title, at) {
    clearTimeout(leaving);
    lightbox.classList.remove("is-leaving");
    origin = null;
    session++;
    lastFocus = document.activeElement;
    if (label) label.textContent = title || "Film";
    player.pause();
    player.removeAttribute("src");
    player.load();
    player.hidden = true;
    clearYouTube();
    player.hidden = true;
    frame = document.createElement("iframe");
    frame.className = "video-lightbox-yt";
    frame.title = title || "Film";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
      "?autoplay=1&rel=0&modestbranding=1&playsinline=1&color=white" + (at > 0 ? "&start=" + Math.floor(at) : "");
    player.insertAdjacentElement("afterend", frame);
    lightbox.hidden = false;
    lightbox.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    open = true;
    closeBtn.focus();
    lightbox.dispatchEvent(new CustomEvent("videolightbox:open", { bubbles: false }));
  }

  function openVideo(src, title, poster, at, from) {
    if (!src) return;
    if (src.indexOf("yt:") === 0) return openYouTube(src.slice(3), title, at);
    clearYouTube();
    clearTimeout(leaving);
    lightbox.classList.remove("is-leaving");
    origin = from || null;
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
    arrive();
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
    open = false;
    document.documentElement.style.overflow = "";
    const finish = () => {
      clearYouTube();
      player.removeAttribute("src");
      player.load();
      player.style.transition = "none";
      player.style.transform = "";
      lightbox.classList.remove("is-open", "is-leaving");
      lightbox.hidden = true;
    };
    // Back into the still it came from, when that still is there to go back into.
    const back = reduce.matches ? null : offset(origin);
    if (back) {
      lightbox.classList.add("is-leaving");
      player.style.transition = "transform .3s var(--ease-inout, cubic-bezier(.6,0,.2,1))";
      player.style.transform = back;
      leaving = setTimeout(finish, 300);
    } else finish();
    origin = null;
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
      parseFloat(trigger.getAttribute("data-video-at")),
      originFor(trigger)
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
  window.__videoLightboxPlay = (src, title, poster, from) => openVideo(src, title, poster, 0, from || null);
})();
