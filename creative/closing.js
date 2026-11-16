/* The last frame: the outlined name is made as the visitor reaches for the way in.
   With a pointer, it follows the pointer across the name and is made whole on the link.
   On touch, it is made once, when the frame is in view. Reduced motion: solid already. */
(function () {
  const root = document.documentElement;
  const section = document.querySelector("[data-closing]");
  if (!section || !root.classList.contains("js-motion")) return;
  const name = section.querySelector(".closing-name");
  const cta = section.querySelector(".closing-cta");
  if (!name || !cta) return;

  let now = 0;
  let target = 0;
  let raf = 0;
  let onLink = false;
  const step = () => {
    raf = 0;
    now += (target - now) * 0.12;
    if (Math.abs(target - now) < 0.002) now = target;
    section.style.setProperty("--made", now.toFixed(4));
    if (now !== target) raf = requestAnimationFrame(step);
  };
  const aim = (t) => {
    target = Math.max(0, Math.min(1, t));
    if (!raf) raf = requestAnimationFrame(step);
  };

  const fine = window.matchMedia("(hover:hover) and (pointer:fine)");
  if (fine.matches) {
    section.addEventListener("pointermove", (e) => {
      if (onLink) return;
      const r = name.getBoundingClientRect();
      aim((e.clientX - r.left) / r.width);
    });
    section.addEventListener("pointerleave", () => {
      onLink = false;
      aim(0);
    });
    cta.addEventListener("pointerenter", () => {
      onLink = true;
      aim(1);
    });
    cta.addEventListener("pointerleave", () => {
      onLink = false;
    });
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          io.disconnect();
          setTimeout(() => aim(1), 500);
        }
      },
      { threshold: 0.6 }
    );
    io.observe(name);
  }
  cta.addEventListener("focus", () => {
    onLink = true;
    aim(1);
  });
  cta.addEventListener("blur", () => {
    onLink = false;
    if (fine.matches) aim(0);
  });
})();
