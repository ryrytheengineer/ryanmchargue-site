/* The opening spread: set each large phrase to the exact width of its line.
   The stylesheet already sizes them for the page's own fonts; this makes it true for
   whatever font the device actually draws them in, and at every width. */
(function () {
  const opening = document.querySelector(".opening");
  if (!opening) return;
  opening.classList.add("is-live");
  const lines = Array.prototype.slice.call(opening.querySelectorAll("[data-fit]"));
  if (!lines.length) return;

  function fit(el) {
    const ink = el.querySelector(".fit-ink");
    const avail = el.parentElement.clientWidth;
    if (!ink || !avail) return;
    el.style.fontSize = "100px";
    const perPx = ink.getBoundingClientRect().width / 100; // width of the widest line, per px of size
    // Upright: the first and last letters' side bearings sit outside the ink, so the box
    // may run that much past the line. Italic: leave a little room for the lean.
    const trim = el.classList.contains("say-matter") ? -0.085 : 0.03;
    const size = perPx > 0 ? avail / (perPx + trim) : 0;
    el.style.fontSize = size ? (Math.round(size * 4) / 4).toFixed(2) + "px" : "";
  }
  const run = () => lines.forEach(fit);

  run();
  window.addEventListener("load", run);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  if ("ResizeObserver" in window) {
    let w = 0;
    new ResizeObserver((entries) => {
      const now = entries[0].contentRect.width;
      if (Math.abs(now - w) > 0.5) {
        w = now;
        run();
      }
    }).observe(opening);
  } else {
    window.addEventListener("resize", run);
  }
})();
