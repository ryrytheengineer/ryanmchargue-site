(function () {
  var clock = document.getElementById('clock');
  var windowsRoot = document.getElementById('windows');
  var zTop = 30;

  var clockFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  function tickClock() {
    if (!clock) return;
    var now = new Date();
    clock.dateTime = now.toISOString();
    // "Sun Aug 9 8:30 AM"
    clock.textContent = clockFmt.format(now).replace(',', '');
  }

  tickClock();
  setInterval(tickClock, 30000);

  function winEl(id) {
    return document.getElementById('win-' + id);
  }

  function setRunning(app, on) {
    document.querySelectorAll('[data-open="' + app + '"]').forEach(function (el) {
      if (el.classList.contains('dock-item')) {
        el.classList.toggle('is-running', on);
      }
    });
  }

  function focusWindow(win) {
    if (!win) return;
    zTop += 1;
    win.style.zIndex = String(zTop);
    document.querySelectorAll('.window').forEach(function (w) {
      w.classList.toggle('is-active', w === win);
    });
  }

  function openApp(app, fromDock) {
    var win = winEl(app);
    if (!win) return;

    var wasHidden = win.hasAttribute('hidden');
    win.removeAttribute('hidden');
    win.classList.remove('is-minimized');
    focusWindow(win);
    setRunning(app, true);

    if (wasHidden) {
      win.classList.remove('is-opening');
      void win.offsetWidth;
      win.classList.add('is-opening');
      win.addEventListener(
        'animationend',
        function () {
          win.classList.remove('is-opening');
        },
        { once: true }
      );
    }

    if (fromDock) {
      var dockBtn = document.querySelector('.dock-item[data-open="' + app + '"]');
      if (dockBtn) {
        dockBtn.classList.remove('is-bounce');
        void dockBtn.offsetWidth;
        dockBtn.classList.add('is-bounce');
        setTimeout(function () {
          dockBtn.classList.remove('is-bounce');
        }, 600);
      }
    }
  }

  function closeApp(app) {
    var win = winEl(app);
    if (!win) return;
    win.setAttribute('hidden', '');
    win.classList.remove('is-minimized', 'is-active', 'is-opening');
    setRunning(app, false);
  }

  function minimizeApp(app) {
    var win = winEl(app);
    if (!win) return;
    win.classList.add('is-minimized');
  }

  document.addEventListener('click', function (e) {
    var openBtn = e.target.closest('[data-open]');
    if (openBtn) {
      e.preventDefault();
      var app = openBtn.getAttribute('data-open');
      openApp(app, openBtn.classList.contains('dock-item'));
      if (openBtn.classList.contains('desk-icon')) {
        document.querySelectorAll('.desk-icon').forEach(function (i) {
          i.classList.remove('is-selected');
        });
        openBtn.classList.add('is-selected');
      }
      return;
    }

    var win = e.target.closest('.window');
    if (!win) return;

    focusWindow(win);
    var app = win.getAttribute('data-app');

    if (e.target.closest('[data-close]')) {
      closeApp(app);
      return;
    }
    if (e.target.closest('[data-min]')) {
      minimizeApp(app);
      return;
    }
    if (e.target.closest('[data-zoom]')) {
      if (win.dataset.zoomed === '1') {
        win.style.top = win.dataset.prevTop || '8%';
        win.style.left = win.dataset.prevLeft || '12%';
        win.style.width = win.dataset.prevWidth || '';
        win.style.height = win.dataset.prevHeight || '';
        win.dataset.zoomed = '0';
      } else {
        win.dataset.prevTop = win.style.top || '8%';
        win.dataset.prevLeft = win.style.left || '12%';
        win.dataset.prevWidth = win.style.width || '';
        win.dataset.prevHeight = win.style.height || '';
        win.style.top = '12px';
        win.style.left = '12px';
        win.style.width = 'calc(100% - 24px)';
        win.style.height = 'calc(100% - 24px)';
        win.dataset.zoomed = '1';
      }
    }
  });

  // Re-open minimized from dock
  document.querySelectorAll('.dock-item[data-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var app = btn.getAttribute('data-open');
      var win = winEl(app);
      if (win && win.classList.contains('is-minimized')) {
        win.classList.remove('is-minimized');
        focusWindow(win);
      }
    });
  });

  // Drag windows by titlebar
  var drag = null;

  windowsRoot.addEventListener('pointerdown', function (e) {
    var bar = e.target.closest('[data-drag]');
    if (!bar || e.target.closest('.tl')) return;
    var win = bar.closest('.window');
    if (!win || win.dataset.zoomed === '1') return;

    focusWindow(win);
    var rect = win.getBoundingClientRect();
    drag = {
      win: win,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
    };
    win.setPointerCapture(e.pointerId);
  });

  windowsRoot.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var parent = windowsRoot.getBoundingClientRect();
    var x = e.clientX - parent.left - drag.ox;
    var y = e.clientY - parent.top - drag.oy;
    x = Math.max(-40, Math.min(parent.width - 80, x));
    y = Math.max(0, Math.min(parent.height - 60, y));
    drag.win.style.left = x + 'px';
    drag.win.style.top = y + 'px';
    drag.win.style.transform = 'none';
  });

  function endDrag() {
    drag = null;
  }

  windowsRoot.addEventListener('pointerup', endDrag);
  windowsRoot.addEventListener('pointercancel', endDrag);

  // Open About on first visit so the desktop isn't empty
  openApp('about', false);
})();
