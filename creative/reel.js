/* Reels: a case-study film, its strip, and everything pinned to it.

   Each [data-reel] section has a muted preview that plays while the section is on
   screen, a strip you can drag to move through the film, and cues (plates, voices,
   contact-sheet frames) that are real seconds in it. Hovering a cue moves the preview
   there; choosing one opens the film with sound from that second (video-lightbox.js). */
(() => {
  "use strict";

  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  const reduced = mq("(prefers-reduced-motion: reduce)");
  const lightbox = document.getElementById("video-lightbox");
  const reels = [];
  let lightboxOpen = false;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // 83.4 -> "1:23"
  const stamp = (s) => {
    s = Math.max(0, Math.floor(s + 1e-6));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  // Digits go in fixed cells so a running clock doesn't shuffle sideways.
  const cells = (text) => text.replace(/\d/g, "<i>$&</i>");

  function setup(section) {
    const media = section.querySelector(".case-study-media");
    const video = media && media.querySelector(".case-study-preview");
    if (!media || !video) return;

    const dur = parseFloat(section.getAttribute("data-duration")) || 0;
    const startAt = parseFloat(video.getAttribute("data-preview-start")) || 0;
    const strip = section.querySelector("[data-strip]");
    const band = strip && strip.querySelector(".strip-band");
    const head = strip && strip.querySelector(".strip-head");
    const ghost = strip && strip.querySelector(".strip-ghost");
    const loupe = strip && strip.querySelector(".strip-loupe");
    const loupeFrame = loupe && loupe.querySelector(".strip-loupe-frame");
    const loupeTime = loupe && loupe.querySelector(".strip-loupe-time");
    const clocks = Array.from(section.querySelectorAll("[data-reel-clock]"));
    const plates = section.querySelector(".plates");
    const sheet = section.querySelector("[data-sheet]");
    const sheetHead = sheet && sheet.querySelector(".sheet-head");
    const frames = sheet ? Array.from(sheet.querySelectorAll(".frame")) : [];
    const frameTimes = frames.map((f) => parseFloat(f.getAttribute("data-cue")) || 0);

    // Cues: [data-cue="seconds"], live while the film is inside data-live="a-b,c-d".
    const cues = Array.from(section.querySelectorAll("[data-cue]")).map((el) => {
      const t = parseFloat(el.getAttribute("data-cue")) || 0;
      const live = (el.getAttribute("data-live") || "")
        .split(",")
        .map((r) => r.split("-").map(parseFloat))
        .filter((r) => r.length === 2 && r[1] > r[0]);
      return { el, t, live, host: el.closest(".plate") || el, on: false };
    });
    const pins = strip
      ? Array.from(strip.querySelectorAll(".strip-pins i")).map((i) => parseFloat(i.style.getPropertyValue("--t")) || 0)
      : [];

    const soundBtn = section.querySelector("[data-reel-sound]");
    let muted = true; // the preview starts silent; the visitor can turn its sound on
    let srcLoaded = false;
    let onScreen = false;
    let held = false; // dragging the strip
    let heldId = null;
    let touchStart = null;
    let peeking = false;
    let touched = false; // the visitor has moved the film themselves
    let want = startAt || null; // where the interface should show the film until it gets there
    let pending = null; // a seek waiting for metadata
    let queued = null; // a seek waiting for the previous one to land
    let headP = dur ? clamp((startAt || 0) / dur, 0, 1) : 0;
    let stripW = 0;
    let boxes = [];
    let cols = 1;
    let raf = 0;
    let lastSecond = -1;
    let lastFrame = -2;
    let loupeLoaded = false;
    let loadAsked = false;

    // ---------- the film ----------
    function ensureSrc(eager) {
      if (srcLoaded) return;
      const src = video.getAttribute("data-src");
      if (!src) return;
      if (eager) video.preload = "auto";
      video.src = src;
      srcLoaded = true;
    }

    video.addEventListener("loadedmetadata", () => {
      const t = pending != null ? pending : startAt;
      pending = null;
      loadAsked = false;
      if (t > 0 && t < video.duration) {
        try {
          video.currentTime = t;
        } catch (_) {}
      }
      kick();
    });
    video.addEventListener("seeked", () => {
      if (queued != null) {
        const t = queued;
        queued = null;
        try {
          video.currentTime = t;
        } catch (_) {}
        return;
      }
      if (!held) want = null;
      kick();
    });
    video.addEventListener("playing", () => kick());

    function setMuted(on) {
      muted = on;
      video.muted = on;
      if (!soundBtn) return;
      soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
      soundBtn.setAttribute("aria-label", on ? "Unmute" : "Mute");
      soundBtn.classList.toggle("is-on", !on);
    }
    // `asked` is true when the visitor did something that asks for the film to run (turned
    // the sound on, chose a moment), which starts it even where it would not start by itself.
    function play(asked) {
      if (lightboxOpen || held || document.hidden) return;
      if (!asked && (reduced.matches || !onScreen)) return;
      ensureSrc(asked);
      video.muted = muted;
      const started = video.play();
      if (started && typeof started.catch === "function") {
        started.catch(() => {
          // A browser may refuse to start sound it was not just asked for: carry on silent.
          if (muted) return;
          setMuted(true);
          const again = video.play();
          if (again && typeof again.catch === "function") again.catch(() => {});
        });
      }
      kick();
    }
    function pause() {
      if (!video.paused) video.pause();
    }
    // Choosing a moment moves this preview there. If the film is mostly off screen it is
    // brought back into view, so the moment that was asked for can be seen.
    function cue(t) {
      seek(t);
      if (!reduced.matches) play(true);
      const box = media.getBoundingClientRect();
      const seen = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
      if (seen < box.height * 0.6) {
        media.scrollIntoView({ block: "center", behavior: reduced.matches ? "auto" : "smooth" });
      }
    }

    // Where the film is, as far as the interface is concerned.
    function now() {
      if (want != null && (held || video.seeking || video.readyState < 1 || pending != null)) return want;
      if (video.readyState >= 1) return video.currentTime;
      return want != null ? want : 0;
    }

    function seek(t) {
      t = clamp(t, 0, Math.max(0, dur - 0.08));
      touched = true;
      want = t;
      ensureSrc(true);
      if (video.readyState >= 1) {
        if (video.seeking) queued = t;
        else {
          try {
            video.currentTime = t;
          } catch (_) {}
        }
      } else {
        pending = t;
        // A film that isn't playing has fetched nothing yet (preload="none"), so ask for
        // it once: the frame it lands on is what the visitor will see.
        if (video.paused && !loadAsked) {
          loadAsked = true;
          video.preload = "auto";
          video.load();
        }
      }
      kick();
    }

    // ---------- measuring ----------
    // The grotesk title runs the full width of the column. Its size comes from CSS for
    // Arial's widths; on a device with a different grotesk this trims it to fit.
    const title = section.querySelector(".reel-title--matter");
    function fitTitle() {
      if (!title) return;
      title.style.fontSize = "";
      if (getComputedStyle(title).whiteSpace !== "nowrap") return; // on a phone it breaks into two lines
      const box = title.parentElement.getBoundingClientRect().width;
      const range = document.createRange();
      range.selectNodeContents(title);
      for (let pass = 0; pass < 2; pass++) {
        const size = parseFloat(getComputedStyle(title).fontSize);
        const ink = range.getBoundingClientRect().width - size * 0.085; // side bearings
        if (!(ink > 0) || Math.abs(ink - box) / box < 0.004) break;
        title.style.fontSize = ((size * box) / ink).toFixed(2) + "px";
      }
    }

    function measure() {
      fitTitle();
      if (band) stripW = band.getBoundingClientRect().width;
      if (plates) {
        const grid = getComputedStyle(plates).display === "grid";
        const top = plates.getBoundingClientRect().top;
        plates.querySelectorAll(".plate").forEach((p) => {
          if (grid) p.style.setProperty("--drop", Math.max(0, p.getBoundingClientRect().top - top).toFixed(1) + "px");
          else p.style.removeProperty("--drop");
        });
      }
      if (sheet && frames.length) {
        const origin = sheet.getBoundingClientRect();
        boxes = frames.map((f) => {
          const r = (f.querySelector(".frame-img") || f).getBoundingClientRect();
          return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
        });
        cols = Math.max(1, boxes.filter((b) => Math.abs(b.y - boxes[0].y) < 2).length);
        sheet.style.setProperty("--fh", boxes[0].h.toFixed(1) + "px");
      }
      lastFrame = -2;
      kick();
    }

    // ---------- painting ----------
    function frameAt(t) {
      let i = -1;
      for (let k = 0; k < frameTimes.length; k++) {
        if (frameTimes[k] <= t + 1e-3) i = k;
        else break;
      }
      return i;
    }

    function paint(t) {
      if (strip && head) {
        head.style.transform = "translate3d(" + (headP * stripW).toFixed(1) + "px,0,0)";
        strip.style.setProperty("--p", headP.toFixed(4));
      }
      const second = Math.floor(t + 1e-6);
      if (second !== lastSecond) {
        lastSecond = second;
        const text = stamp(t);
        clocks.forEach((c) => (c.innerHTML = cells(text)));
        if (strip) {
          strip.setAttribute("aria-valuenow", String(second));
          strip.setAttribute("aria-valuetext", text + " of " + stamp(Math.round(dur)));
        }
      }
      for (const c of cues) {
        if (!c.live.length) continue;
        const on = c.live.some((r) => t >= r[0] && t < r[1]);
        if (on !== c.on) {
          c.on = on;
          c.el.classList.toggle("is-live", on);
          if (c.host !== c.el) c.host.classList.toggle("is-live", on);
        }
      }
      if (sheet && boxes.length) {
        const i = frameAt(t);
        if (i !== lastFrame) {
          lastFrame = i;
          frames.forEach((f, k) => {
            f.classList.toggle("is-ahead", k > i);
            f.classList.toggle("is-now", k === i);
          });
        }
        if (sheetHead) {
          const k = clamp(i, 0, frames.length - 1);
          const from = frameTimes[k];
          const to = k + 1 < frameTimes.length ? frameTimes[k + 1] : dur;
          const part = to > from ? clamp((t - from) / (to - from), 0, 1) : 0;
          const b = boxes[k];
          sheetHead.style.transform = "translate3d(" + (b.x + part * b.w).toFixed(1) + "px," + b.y.toFixed(1) + "px,0)";
        }
      }
    }

    function tick() {
      raf = 0;
      const t = now();
      const target = dur ? clamp(t / dur, 0, 1) : 0;
      // The head has a little weight: it eases to where the film is, and settles.
      headP += (target - headP) * (reduced.matches ? 1 : held ? 0.42 : 0.2);
      if (Math.abs(target - headP) < 0.0003) headP = target;
      paint(t);
      const moving = headP !== target;
      if (moving || held || (onScreen && !video.paused) || video.seeking) raf = requestAnimationFrame(tick);
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    // ---------- the strip ----------
    if (strip && band) {
      // The strip only becomes a control once this script is running.
      strip.setAttribute("role", "slider");
      strip.setAttribute("tabindex", "0");
      strip.setAttribute("aria-label", "Move through the film");
      strip.setAttribute("aria-orientation", "horizontal");
      strip.setAttribute("aria-valuemin", "0");
      strip.setAttribute("aria-valuemax", String(Math.round(dur)));
      section.classList.add("is-ready");

      const step = parseFloat(strip.getAttribute("data-step")) || 1;
      const loupeSrc = strip.getAttribute("data-loupe");
      const loupeStep = parseFloat(strip.getAttribute("data-loupe-step")) || 1;
      const loupeCols = parseInt(strip.getAttribute("data-loupe-cols"), 10) || 1;
      const loupeCount = Math.ceil(dur / loupeStep);
      const loupeRows = Math.ceil(loupeCount / loupeCols);

      const timeAt = (clientX) => {
        const r = band.getBoundingClientRect();
        const x = clamp(clientX - r.left, 0, r.width);
        let t = (x / r.width) * dur;
        // Detents: the strip catches on anything pinned to it.
        for (const p of pins) {
          if (Math.abs((p / dur) * r.width - x) <= 5) {
            t = p;
            break;
          }
        }
        return t;
      };

      const peek = (t) => {
        if (!peeking) {
          peeking = true;
          strip.classList.add("is-peeking");
          section.classList.add("is-peeking");
          if (!loupeLoaded && loupeSrc && loupeFrame) {
            loupeLoaded = true;
            loupeFrame.style.backgroundImage = 'url("' + loupeSrc + '")';
            loupeFrame.style.backgroundSize = loupeCols * 100 + "% " + loupeRows * 100 + "%";
          }
        }
        const x = (t / dur) * stripW;
        if (ghost) ghost.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
        if (loupe) {
          const w = loupe.offsetWidth || 168;
          loupe.style.setProperty("--lx", clamp(x - w / 2, 0, Math.max(0, stripW - w)).toFixed(1) + "px");
          if (loupeFrame) {
            const i = clamp(Math.floor(t / loupeStep), 0, loupeCount - 1);
            const col = i % loupeCols;
            const row = Math.floor(i / loupeCols);
            loupeFrame.style.backgroundPosition =
              (loupeCols > 1 ? (col / (loupeCols - 1)) * 100 : 0).toFixed(3) +
              "% " +
              (loupeRows > 1 ? (row / (loupeRows - 1)) * 100 : 0).toFixed(3) +
              "%";
          }
          if (loupeTime) loupeTime.innerHTML = cells(stamp(t));
        }
      };
      const unpeek = () => {
        peeking = false;
        strip.classList.remove("is-peeking");
        section.classList.remove("is-peeking");
      };

      const hold = (e) => {
        held = true;
        heldId = e.pointerId;
        touchStart = null;
        strip.classList.add("is-held");
        try {
          strip.setPointerCapture(e.pointerId);
        } catch (_) {}
        pause();
        drag(e);
      };
      const drag = (e) => {
        const t = timeAt(e.clientX);
        seek(t);
        peek(t);
      };
      const release = (e) => {
        if (touchStart && e.pointerId === touchStart.id) {
          // A tap: go to that second.
          const tap = touchStart;
          touchStart = null;
          if (e.type === "pointerup") {
            seek(timeAt(tap.x));
            play();
          }
          return;
        }
        if (!held || e.pointerId !== heldId) return;
        held = false;
        heldId = null;
        strip.classList.remove("is-held");
        try {
          strip.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (e.pointerType !== "mouse" || e.type === "pointercancel") unpeek();
        play();
        kick();
      };

      strip.addEventListener("pointerdown", (e) => {
        if (e.button) return;
        // A finger might be on its way down the page; wait to see which way it goes.
        if (e.pointerType === "touch") {
          touchStart = { id: e.pointerId, x: e.clientX };
          return;
        }
        e.preventDefault();
        hold(e);
      });
      strip.addEventListener("pointermove", (e) => {
        if (held) {
          if (e.pointerId === heldId) drag(e);
          return;
        }
        if (touchStart && e.pointerId === touchStart.id) {
          if (Math.abs(e.clientX - touchStart.x) > 6) hold(e);
          return;
        }
        if (e.pointerType === "mouse") peek(timeAt(e.clientX));
      });
      strip.addEventListener("pointerup", release);
      strip.addEventListener("pointercancel", release);
      strip.addEventListener("pointerleave", () => {
        if (!held) unpeek();
      });
      strip.addEventListener("keydown", (e) => {
        let t = now();
        if (e.key === "ArrowRight" || e.key === "ArrowUp") t += step;
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") t -= step;
        else if (e.key === "PageUp") t += step * 6;
        else if (e.key === "PageDown") t -= step * 6;
        else if (e.key === "Home") t = 0;
        else if (e.key === "End") t = dur - 0.5;
        else return;
        e.preventDefault();
        seek(t);
        play();
      });
    }

    // ---------- cues ----------
    cues.forEach((c) => {
      if (frames.indexOf(c.el) !== -1) return; // the sheet handles its own frames
      let timer = 0;
      const go = () => {
        seek(c.t);
        play();
      };
      c.el.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(timer);
        timer = setTimeout(go, 110);
      });
      c.el.addEventListener("pointerleave", () => clearTimeout(timer));
      c.el.addEventListener("focus", () => {
        if (c.el.matches(":focus-visible")) go();
      });
      // Clicking or tapping a still or a name moves the preview to it.
      c.el.addEventListener("click", (e) => {
        e.preventDefault();
        clearTimeout(timer);
        cue(c.t);
      });
    });

    // ---------- the contact sheet ----------
    if (sheet && frames.length) {
      let timer = 0;
      let hoverT = 0;
      let hoverFrame = null;
      sheet.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const f = e.target.closest ? e.target.closest(".frame") : null;
        const i = f ? frames.indexOf(f) : -1;
        if (i < 0) return;
        const r = (f.querySelector(".frame-img") || f).getBoundingClientRect();
        const part = clamp((e.clientX - r.left) / r.width, 0, 0.999);
        const to = i + 1 < frameTimes.length ? frameTimes[i + 1] : dur;
        hoverT = frameTimes[i] + part * (to - frameTimes[i]);
        hoverFrame = f;
        sheet.classList.add("is-held");
        if (!timer) {
          timer = setTimeout(() => {
            timer = 0;
            seek(hoverT);
            play();
          }, 70);
        }
      });
      sheet.addEventListener("pointerleave", () => {
        clearTimeout(timer);
        timer = 0;
        hoverFrame = null;
        sheet.classList.remove("is-held");
      });
      // Clicking or tapping a frame moves the preview to it: to the exact point under the
      // pointer if it is being examined, otherwise to the frame itself.
      frames.forEach((f, i) => {
        f.addEventListener("click", (e) => {
          e.preventDefault();
          cue(hoverFrame === f ? hoverT : frameTimes[i]);
        });
      });

      // One stop in the tab order; arrow keys move between frames.
      frames.forEach((f, i) => (f.tabIndex = i ? -1 : 0));
      sheet.addEventListener("keydown", (e) => {
        const i = frames.indexOf(document.activeElement);
        if (i < 0) return;
        let j = i;
        if (e.key === "ArrowRight") j = i + 1;
        else if (e.key === "ArrowLeft") j = i - 1;
        else if (e.key === "ArrowDown") j = i + cols;
        else if (e.key === "ArrowUp") j = i - cols;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = frames.length - 1;
        else return;
        if (j < 0 || j >= frames.length) return;
        e.preventDefault();
        frames[i].tabIndex = -1;
        frames[j].tabIndex = 0;
        frames[j].focus();
      });
      frames.forEach((f, i) => {
        f.addEventListener("focus", () => {
          if (!f.matches(":focus-visible")) return;
          seek(frameTimes[i]);
          play();
        });
      });

      // The sheet itself is one image; fetch it as the reel comes near.
      if ("IntersectionObserver" in window) {
        const near = new IntersectionObserver(
          (entries) => {
            if (!entries.some((en) => en.isIntersecting)) return;
            near.disconnect();
            sheet.classList.add("is-ready");
          },
          { rootMargin: "700px 0px" }
        );
        near.observe(sheet);
      } else sheet.classList.add("is-ready");
    }

    // If the visitor has moved the film, "watch with sound" carries on from where they left
    // it (opening on black rather than on the poster, which is a different moment).
    const poster = media.getAttribute("data-video-poster") || "";
    const BLACK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    media.addEventListener("click", () => {
      if (touched) {
        media.setAttribute("data-video-at", now().toFixed(2));
        media.setAttribute("data-video-poster", BLACK);
      } else {
        media.removeAttribute("data-video-at");
        media.setAttribute("data-video-poster", poster);
      }
    });
    media.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      media.click();
    });

    // ---------- sound ----------
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        if (muted) {
          // One preview speaks at a time.
          reels.forEach((r) => r.mute());
          setMuted(false);
          play(true);
        } else setMuted(true);
      });
    }

    // ---------- on and off screen ----------
    if ("IntersectionObserver" in window) {
      // Fetch the film a little before it is needed.
      const near = new IntersectionObserver(
        (entries) => {
          if (!entries.some((en) => en.isIntersecting)) return;
          near.disconnect();
          ensureSrc();
        },
        { rootMargin: "240px 0px" }
      );
      near.observe(media);
      // Play while the reel crosses the middle of the screen.
      new IntersectionObserver(
        ([entry]) => {
          onScreen = !!(entry && entry.isIntersecting);
          if (onScreen) {
            sheet && sheet.classList.add("is-live");
            play();
            kick();
          } else {
            sheet && sheet.classList.remove("is-live");
            pause();
          }
        },
        { rootMargin: "-18% 0px -18% 0px", threshold: 0 }
      ).observe(section);
    } else {
      onScreen = true;
      ensureSrc();
      sheet && sheet.classList.add("is-live");
      play();
    }

    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(section);
    else window.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener("load", measure);
    measure();

    reels.push({ play: () => play(false), pause, mute: () => setMuted(true) });
  }

  document.querySelectorAll("[data-reel]").forEach(setup);

  if (!reels.length) return;

  if (lightbox) {
    lightbox.addEventListener("videolightbox:open", () => {
      lightboxOpen = true;
      reels.forEach((r) => r.pause());
    });
    lightbox.addEventListener("videolightbox:close", () => {
      lightboxOpen = false;
      reels.forEach((r) => r.play());
    });
  }
  document.addEventListener("visibilitychange", () => {
    reels.forEach((r) => (document.hidden ? r.pause() : r.play()));
  });
})();
