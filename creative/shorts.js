/* Short-Form — lean.
   Four vertical films, played in order. The name of the one that is playing leans as hard
   as its picture is moving; the running time counts beside it.

   `pace` is measured from each film, not chosen: for every fifteenth of a second, how much
   the picture changed from one frame to the next, on one scale shared by all four (0 is a
   still picture, 9 is a hard cut or a whip of the camera). */
(() => {
  const SHORTS = [
    {
      company: "Zipline",
      lines: ["Zipline"],
      src: "assets/shorts/zipline.mp4",
      poster: "assets/shorts/zipline-poster.jpg",
      role: "Creative Director",
      description: "Rapid Fire short-form",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-toured-ziplines-hq-last-week-and-saw-the-activity-7425256192236519424-O4MA",
      dur: 59.033,
      pace: "2233423293322222345392222356691122222321189332223334349111111322122119445555555555666666555555555955445555585543946643322422913333333333334439333333922111111111111111119334454223222222222222233444444944444443332222293333222223322323332333944744444444444444444544444444444433344444443333333333433334449553445554445566766554444923233344335643344444334455544933333232222292222223333333333392333333323222222222221112192222211222223565332391011001012221000101193111111345423449921121111111212232233222921111111222334221711111111113222222222291111111311111193333233222244391121234542112222291122122822223732922465222399221225723333554333213283333333343433433349455543444449466567655686592221222223311111111111111221710010010001010011000210984444655767666565565544549011100344313322222221021011110000000965666555666544443454435344444444433433823444444332229444433344483234443234332223393332222",
    },
    {
      company: "Terra Kaffe",
      lines: ["Terra", "Kaffe"],
      src: "assets/shorts/terra-kaffe.mp4",
      poster: "assets/shorts/terra-kaffe-poster.jpg",
      role: "Creative Director",
      description: "Coffee hardware",
      dur: 27.7,
      pace: "11121111111221111101111000111000201008111111111111111111194344344465333233393233233232233222222222229111211110111012022111111111111111111112111111194444444444444445444444555559444322211111110000111000000000000000000000000011000000109111111111110005011111111211110111161112111221111111111111112181111111111111119222111119111110011111111011111111211010001110111111111111111113221111111012000011211111111111111111100000",
    },
    {
      company: "Infinite Machine",
      lines: ["Infinite", "Machine"],
      src: "assets/shorts/infinite-machine.mp4",
      poster: "assets/shorts/infinite-machine-poster.jpg",
      role: "Creative Director",
      description: "Rapid Fire founder cut",
      url: "https://www.linkedin.com/posts/ritwikpavan_i-did-a-rapid-fire-with-joseph-cohen-co-founder-activity-7424930340533633024-48Im",
      dur: 25.2,
      pace: "578888799985566555567899999888875333223222222211222229222233433464151121121219644443343444444396874333343344789999987787666656778871111911211111954434977677565455968877676654432213356887677655765445788889997665443334445678988678655593333339121112229222344323333322334443234344456656656666668866655577775455553322244569455544564439433333333397766654465559565554444553454334443553",
    },
    {
      company: "Light Phone",
      lines: ["Light", "Phone"],
      src: "assets/shorts/light-phone.mp4",
      poster: "assets/shorts/light-phone-poster.jpg",
      role: "Creative Director",
      description: "Minimal phone",
      dur: 24.667,
      pace: "1232222111111131111222332222311222242222223349333333333332333333333343333333332222229232434333393333333333333223445444332339333333222222234332222292222222112221232222222343293333322122932223333344444322222222333932223912223333439444433343339333333334333333444444324333332333344344444333334343343343333332222223223223433329334444444444444444443332343332222222273332222322",
    },
  ];
  const PACE_HZ = 15;
  const MAX_LEAN = 14; // degrees, about the slant of the site's italic
  const SPRING = { k: 150, c: 17 }; // quick to kick forward, a touch of sway coming back

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.getElementById("shorts-viewer");
  const picker = document.getElementById("sv-picker");
  if (!root) return;

  const stage = root.querySelector(".sv-stage");
  const video = root.querySelector(".sv-video");
  const ghost = root.querySelector(".sv-ghost");
  const preload = root.querySelector(".sv-preload");
  const nameEl = root.querySelector(".sf-name");
  const nameSet = root.querySelector(".sf-name-set");
  const clock = root.querySelector("[data-sf-clock]");
  const linkEl = root.querySelector(".sv-link");
  const muteBtn = root.querySelector(".sv-mute");
  const muteLabel = root.querySelector(".sv-mute-label");
  const pauseHint = root.querySelector(".sv-pause-hint");
  if (!stage || !video || !muteBtn) return;

  let index = 0;
  let active = true; // on screen
  let closed = false;
  let paused = false;
  let muted = true;
  let raf = 0;
  let last = 0;
  let swipe = null;
  let suppressTapUntil = 0;
  let focused = false;
  let lean = 0;
  let leanVel = 0;
  let lastStamp = "";
  let tabs = [];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stamp = (s) => {
    s = Math.max(0, Math.floor(s + 1e-6));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  const cells = (text) => text.replace(/\d/g, "<i>$&</i>"); // fixed-width digits, so the clock does not shiver

  /* ---------- The index: four rows, in the order they play ---------- */
  function buildPicker() {
    if (!picker) return;
    picker.innerHTML = "";
    tabs = SHORTS.map((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-pick";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
      btn.setAttribute("aria-label", item.company + ", " + stamp(item.dur));
      btn.innerHTML =
        '<span class="sf-num" aria-hidden="true">' + (i + 1) + "</span>" +
        '<span class="sf-pick-name" aria-hidden="true">' + esc(item.company) + "</span>" +
        '<span class="tc" aria-hidden="true">' + stamp(item.dur) + "</span>";
      btn.addEventListener("click", () => {
        jumpTo(i);
        openPlayer();
      });
      picker.appendChild(btn);
      return btn;
    });
  }
  function syncPicker() {
    tabs.forEach((btn, i) => {
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
      if (i !== index) btn.style.removeProperty("--p");
    });
  }

  /* ---------- The name: rolls out and in like a counter ---------- */
  function setName(item, animate) {
    if (!nameSet) return;
    if (animate && !reduce.matches) {
      const old = nameSet.cloneNode(true);
      old.classList.remove("is-entering");
      old.classList.add("is-leaving");
      nameEl.appendChild(old);
      setTimeout(() => old.remove(), 460);
    }
    nameSet.innerHTML = item.lines
      .map((l, i) => '<span class="sf-line"><span class="sf-roll" style="--i:' + i + '"><span class="sf-word">' + esc(l) + "</span></span></span>")
      .join("");
    nameSet.classList.remove("is-entering");
    if (animate && !reduce.matches) {
      void nameSet.offsetWidth;
      nameSet.classList.add("is-entering");
    }
  }

  function setMeta(item) {
    stage.setAttribute("aria-label", item.company + ", short-form film. Arrow keys change film, space pauses, M mutes.");
    if (item.url) {
      linkEl.hidden = false;
      linkEl.href = item.url;
      linkEl.textContent = "View project ↗";
    } else {
      linkEl.hidden = true;
      linkEl.removeAttribute("href");
    }
  }

  function setMuted(on) {
    muted = on;
    video.muted = on;
    muteBtn.setAttribute("aria-pressed", on ? "true" : "false");
    muteBtn.setAttribute("aria-label", on ? "Unmute" : "Mute");
    if (muteLabel) muteLabel.textContent = on ? "Sound off" : "Sound on";
  }

  function preloadNext() {
    const next = SHORTS[(index + 1) % SHORTS.length];
    if (!next || !preload || preload.dataset.src === next.src) return;
    preload.dataset.src = next.src;
    preload.src = next.src;
    preload.load();
  }

  /* ---------- The film: the old one slides out as the new one slides in ---------- */
  function slide(dir) {
    if (reduce.matches || !ghost || !stage.animate) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    ghost.width = Math.round(w * dpr);
    ghost.height = Math.round(h * dpr);
    try {
      // The last frame that was showing stands in for the film that is leaving.
      ghost.getContext("2d").drawImage(video, 0, 0, ghost.width, ghost.height);
    } catch (_) {
      return;
    }
    ghost.hidden = false;
    const timing = { duration: 460, easing: "cubic-bezier(.16,.79,.22,1)" };
    const gap = 10; // a frame line between the two
    video.animate([{ transform: "translate3d(" + dir * (w + gap) + "px,0,0)" }, { transform: "translate3d(0,0,0)" }], timing);
    const out = ghost.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(" + -dir * (w + gap) + "px,0,0)" }], timing);
    out.onfinish = out.oncancel = () => {
      ghost.hidden = true;
    };
  }

  function paintClock(force) {
    const t = stamp(video.currentTime || 0);
    if (!force && t === lastStamp) return;
    lastStamp = t;
    if (clock) clock.innerHTML = cells(t);
  }

  // How hard the picture is moving right now: the strongest change over the last fifth of a second.
  function paceNow() {
    const s = SHORTS[index].pace;
    const i = Math.min(s.length - 1, Math.max(0, Math.floor((video.currentTime || 0) * PACE_HZ)));
    let v = 0;
    for (let k = Math.max(0, i - 2); k <= i; k++) v = Math.max(v, s.charCodeAt(k) - 48);
    // 1 is the grain of a picture that is not moving; the name stands upright for it.
    return Math.max(0, v - 1) / 8;
  }

  function tick(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const playing = active && !closed && !paused && !video.paused;
    if (playing && video.duration) {
      paintClock(false);
      const tab = tabs[index];
      if (tab) tab.style.setProperty("--p", Math.min(1, video.currentTime / video.duration).toFixed(4));
    }
    const target = playing && !reduce.matches ? paceNow() : 0;
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      leanVel += (-SPRING.k * (lean - target) - SPRING.c * leanVel) * h;
      lean += leanVel * h;
    }
    root.style.setProperty("--lean", (Math.max(-0.08, lean) * MAX_LEAN).toFixed(2));
    const settled = !playing && Math.abs(lean) < 0.002 && Math.abs(leanVel) < 0.02;
    if (settled) {
      lean = leanVel = 0;
      root.style.setProperty("--lean", "0");
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function showPaused(on) {
    paused = on;
    pauseHint.hidden = !on;
    stage.classList.toggle("is-paused", on);
  }

  function playCurrent({ restart = true } = {}) {
    const item = SHORTS[index];
    if (!item) return;
    setMeta(item);
    syncPicker();
    if (restart || video.dataset.src !== item.src) {
      video.dataset.src = item.src;
      video.poster = item.poster;
      video.src = item.src;
      video.load();
      lastStamp = "";
      if (clock) clock.innerHTML = cells("0:00");
    }
    setMuted(muted);
    if (closed) return;
    showPaused(false);
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        setMuted(true);
        video.play().catch(() => {});
      });
    }
    preloadNext();
    wake();
  }

  function jumpTo(i, dir) {
    if (!SHORTS.length) return;
    const next = ((i % SHORTS.length) + SHORTS.length) % SHORTS.length;
    const changed = next !== index;
    if (dir == null) dir = next >= index ? 1 : -1;
    root.style.setProperty("--dir", String(dir));
    if (changed) slide(dir);
    index = next;
    setName(SHORTS[index], changed);
    playCurrent({ restart: true });
  }

  function go(delta) {
    jumpTo(index + delta, delta > 0 ? 1 : -1);
  }

  function togglePause() {
    if (closed) {
      openPlayer();
      return;
    }
    if (video.paused) {
      showPaused(false);
      video.play().catch(() => {});
      wake();
    } else {
      video.pause();
      showPaused(true);
    }
  }

  function closePlayer() {
    closed = true;
    active = false;
    video.pause();
    showPaused(true);
    root.classList.add("is-closed");
    stage.blur();
  }

  function openPlayer() {
    closed = false;
    active = true;
    root.classList.remove("is-closed");
    showPaused(false);
    video.play().catch(() => {});
    stage.focus({ preventScroll: true });
    wake();
  }

  function setActive(on) {
    if (closed) return;
    active = on;
    if (!on) {
      video.pause();
      showPaused(true);
      return;
    }
    if (paused) showPaused(false);
    video.play().catch(() => {});
    wake();
  }

  window.__shortsViewerOpen = () => focused && !closed;
  window.openShortsViewer = () => openPlayer();
  window.closeShortsViewer = () => closePlayer();

  buildPicker();
  setName(SHORTS[index], false);
  playCurrent({ restart: true });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.35);
        setActive(visible);
        if (visible && !closed && video.paused && !paused) playCurrent({ restart: false });
      },
      { threshold: [0, 0.35, 0.6] }
    );
    io.observe(stage);
  }

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMuted(!muted);
  });
  linkEl.addEventListener("click", (e) => e.stopPropagation());

  video.addEventListener("ended", () => {
    if (!closed) go(1);
  });
  video.addEventListener("playing", wake);

  root.querySelector(".sv-hit-left").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    go(-1);
    openPlayer();
  });
  root.querySelector(".sv-hit-right").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    go(1);
    openPlayer();
  });
  root.querySelector(".sv-hit-center").addEventListener("click", (e) => {
    e.stopPropagation();
    if (Date.now() < suppressTapUntil) return;
    togglePause();
  });

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, mode: "pending" };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    swipe.dx = e.clientX - swipe.x;
    swipe.dy = e.clientY - swipe.y;
    if (swipe.mode === "pending" && Math.hypot(swipe.dx, swipe.dy) > 10) {
      swipe.mode = Math.abs(swipe.dx) > Math.abs(swipe.dy) ? "h" : "v";
    }
  });
  function endSwipe(e) {
    if (!swipe || (e && e.pointerId !== swipe.id)) return;
    const s = swipe;
    swipe = null;
    if (s.mode === "h" && Math.abs(s.dx) > 48) {
      suppressTapUntil = Date.now() + 350;
      go(s.dx < 0 ? 1 : -1);
      openPlayer();
    }
  }
  stage.addEventListener("pointerup", endSwipe);
  stage.addEventListener("pointercancel", endSwipe);

  stage.addEventListener("focus", () => {
    focused = true;
  });
  stage.addEventListener("blur", () => {
    focused = false;
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (!focused && document.activeElement !== stage) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        go(1);
        openPlayer();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        go(-1);
        openPlayer();
      } else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "m") {
        e.preventDefault();
        muteBtn.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePlayer();
      }
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      video.pause();
      showPaused(true);
    }
  });
})();
