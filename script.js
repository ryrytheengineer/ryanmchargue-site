(() => {
  const clock = document.getElementById("clock");
  if (!clock) return;

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const tick = () => {
    const now = new Date();
    clock.textContent = fmt.format(now);
    clock.dateTime = now.toISOString();
  };

  tick();
  setInterval(tick, 30_000);
})();
