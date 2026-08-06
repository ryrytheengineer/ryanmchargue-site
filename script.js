(function () {
  var el = document.getElementById('clock');
  if (el) {
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
  }

  // Smooth ventures accordion (details open/close is otherwise instant)
  var details = document.getElementById('ventures');
  if (!details) return;

  var panel = details.querySelector('.ventures-panel');
  if (!panel) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setOpen(open) {
    details.classList.toggle('is-open', open);
    details.open = open;
  }

  // Start closed visually even if browser restores open state mid-animation
  if (details.open) {
    details.classList.add('is-open');
  }

  details.addEventListener('click', function (e) {
    var summary = e.target.closest('summary');
    if (!summary || !details.contains(summary)) return;
    e.preventDefault();

    var willOpen = !details.classList.contains('is-open');

    if (reduce) {
      setOpen(willOpen);
      return;
    }

    if (willOpen) {
      details.open = true;
      // Force a frame so 0fr → 1fr transitions
      requestAnimationFrame(function () {
        details.classList.add('is-open');
      });
    } else {
      details.classList.remove('is-open');
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        details.open = false;
        panel.removeEventListener('transitionend', onEnd);
      }
      function onEnd(ev) {
        if (ev.target === panel && ev.propertyName === 'grid-template-rows') finish();
      }
      panel.addEventListener('transitionend', onEnd);
      setTimeout(finish, 500);
    }
  });
})();
