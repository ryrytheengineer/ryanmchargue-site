/* Motion & Matter opens on a dark film frame, so the page dims before handing over. */
(function () {
  var gate = document.querySelector("[data-gate]");
  if (!gate) return;

  var root = document.documentElement;
  var theme = document.querySelector('meta[name="theme-color"]');
  var restTheme = theme ? theme.getAttribute("content") : null;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var warmed = false;

  /* Fetch the portfolio page on first sign of intent so the hand-off is immediate. */
  function warm() {
    if (warmed) return;
    warmed = true;
    var link = document.createElement("link");
    link.rel = "prefetch";
    link.href = gate.href;
    document.head.appendChild(link);
  }

  gate.addEventListener("pointerenter", warm);
  gate.addEventListener("focus", warm);
  gate.addEventListener("touchstart", warm, { passive: true });

  gate.addEventListener("click", function (event) {
    var modified =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (event.defaultPrevented || modified || reduced.matches) return;

    event.preventDefault();
    root.classList.add("is-leaving");
    if (theme) theme.setAttribute("content", "#0c0c0b");
    window.setTimeout(function () {
      window.location.href = gate.href;
    }, 420);
  });

  /* Coming back (including from the back/forward cache) brings the lights up again. */
  window.addEventListener("pageshow", function () {
    root.classList.remove("is-leaving");
    if (theme && restTheme) theme.setAttribute("content", restTheme);
  });
})();
