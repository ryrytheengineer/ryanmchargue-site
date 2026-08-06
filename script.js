(function () {
  var el = document.getElementById('clock');
  if (!el) return;

  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  function tick() {
    var now = new Date();
    el.dateTime = now.toISOString();
    el.textContent = 'San Francisco · ' + fmt.format(now);
  }

  tick();
  setInterval(tick, 30000);
})();
