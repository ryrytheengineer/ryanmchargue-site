(() => {
  const media = document.querySelector(".case-study-media");
  const video = document.getElementById("terra-preview");
  const lightbox = document.getElementById("video-lightbox");
  if (!media || !video) return;

  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let srcLoaded = false;
  let inView = false;
  let lightboxOpen = false;

  function ensureSrc() {
    if (srcLoaded) return;
    const src = video.getAttribute("data-src");
    if (!src) return;
    video.src = src;
    srcLoaded = true;
  }

  function playPreview() {
    if (reduced || lightboxOpen || !inView) return;
    ensureSrc();
    video.muted = true;
    const play = video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  }

  function pausePreview() {
    if (!video.paused) video.pause();
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = !!(entry && entry.isIntersecting);
        if (inView) {
          ensureSrc();
          playPreview();
        } else {
          pausePreview();
        }
      },
      { threshold: 0.28, rootMargin: "160px 0px" }
    );
    io.observe(media);
  } else if (!reduced) {
    ensureSrc();
    inView = true;
    playPreview();
  }

  if (lightbox) {
    lightbox.addEventListener("videolightbox:open", () => {
      lightboxOpen = true;
      pausePreview();
    });
    lightbox.addEventListener("videolightbox:close", () => {
      lightboxOpen = false;
      playPreview();
    });
  }

  media.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    media.click();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pausePreview();
    else playPreview();
  });
})();
