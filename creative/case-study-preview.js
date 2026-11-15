/* Each case study's film plays as a muted preview while it is on screen; clicking opens it with sound. */
(() => {
  const lightbox = document.getElementById("video-lightbox");
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lightboxOpen = false;
  const previews = [];

  document.querySelectorAll(".case-study-media").forEach((media) => {
    const video = media.querySelector(".case-study-preview");
    if (!video) return;

    let srcLoaded = false;
    let inView = false;

    function ensureSrc() {
      if (srcLoaded) return;
      const src = video.getAttribute("data-src");
      if (!src) return;
      video.src = src;
      srcLoaded = true;
    }

    function play() {
      if (reduced || lightboxOpen || !inView) return;
      ensureSrc();
      video.muted = true;
      const started = video.play();
      if (started && typeof started.catch === "function") started.catch(() => {});
    }

    function pause() {
      if (!video.paused) video.pause();
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        ([entry]) => {
          inView = !!(entry && entry.isIntersecting);
          if (inView) {
            ensureSrc();
            play();
          } else {
            pause();
          }
        },
        { threshold: 0.28, rootMargin: "160px 0px" }
      );
      io.observe(media);
    } else if (!reduced) {
      ensureSrc();
      inView = true;
      play();
    }

    media.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      media.click();
    });

    previews.push({ play, pause });
  });

  if (!previews.length) return;

  if (lightbox) {
    lightbox.addEventListener("videolightbox:open", () => {
      lightboxOpen = true;
      previews.forEach((p) => p.pause());
    });
    lightbox.addEventListener("videolightbox:close", () => {
      lightboxOpen = false;
      previews.forEach((p) => p.play());
    });
  }

  document.addEventListener("visibilitychange", () => {
    previews.forEach((p) => (document.hidden ? p.pause() : p.play()));
  });
})();
