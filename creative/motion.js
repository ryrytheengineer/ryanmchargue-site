/* Scroll-driven entrances for Motion & Matter.
   Loaded last, so the deck and the studio comparison are already listening for "reveal". */
(() => {
  const html = document.documentElement;
  const hero = document.getElementById("film-stage");

  // Scroll cue: steps aside once the page has moved about 72px.
  if (hero && "IntersectionObserver" in window) {
    const sentinel = document.createElement("span");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:72px;pointer-events:none";
    hero.prepend(sentinel);
    new IntersectionObserver(([entry]) => {
      hero.classList.toggle("is-scrolled", !entry.isIntersecting);
    }).observe(sentinel);
  }

  // Film settles into a frame. --settle (0→1) drives the CSS; values are lerped so sparse
  // mobile scroll events still produce a continuous motion instead of stepped jumps.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width:600px)");
  if (hero) {
    let span = 1;
    let current = 0;
    let target = 0;
    let raf = 0;
    const measure = () => {
      // Longer travel on phones so the frame closes more gradually.
      span = Math.max(1, hero.offsetHeight * (narrow.matches ? 0.72 : 0.5));
    };
    const write = (v) => {
      hero.style.setProperty("--settle", v.toFixed(4));
    };
    const tick = () => {
      raf = 0;
      if (reduce.matches) {
        current = target = 0;
        write(0);
        return;
      }
      // Heavier smoothing on touch-sized viewports; desktop stays snappy.
      const k = narrow.matches ? 0.14 : 0.28;
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.0008) current = target;
      write(current);
      if (current !== target) raf = requestAnimationFrame(tick);
    };
    const sample = () => {
      const p = reduce.matches ? 0 : Math.min(1, Math.max(0, window.scrollY / span));
      // Ease into the settle so the last part of the close is gentle.
      target = 1 - (1 - p) * (1 - p);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", sample, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      sample();
    });
    if (narrow.addEventListener) narrow.addEventListener("change", () => { measure(); sample(); });
    measure();
    sample();
  }

  window.__motionReady = true;
  if (!html.classList.contains("js-motion")) return;

  // Longest delay + duration among an element's transitions, in ms.
  function settleTime(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    const ms = (v) => v.split(",").map((s) => (s.trim().endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000) || 0);
    const durations = ms(cs.transitionDuration);
    const delays = ms(cs.transitionDelay);
    return Math.max(...durations.map((d, i) => d + delays[i % delays.length]));
  }

  function show(el) {
    el.classList.add("is-in");
    el.dispatchEvent(new CustomEvent("reveal"));
    // Once the entrance has played, hand the element back to its normal styles.
    const wait = Math.max(settleTime(el), settleTime(el.querySelector("img"))) + 120;
    setTimeout(() => {
      el.removeAttribute("data-reveal");
      el.classList.remove("is-in");
    }, wait);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // Anything already scrolled past (a restored scroll position, an anchor link) is shown too.
        const passed = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) continue;
        io.unobserve(entry.target);
        show(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0 }
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
})();
