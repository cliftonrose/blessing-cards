/* ============================================================
   The Good News view — revealed as you come to it.
   Shares the page with the blessing card; the deck decides which
   one is on screen, and calls activate()/deactivate() here.
   ============================================================ */
(function () {
  'use strict';

  var view = document.getElementById('view-gospel');
  if (!view) return;

  var hasAnime = typeof window.anime === 'function';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var blocks = Array.prototype.slice.call(view.querySelectorAll('.reveal'));
  var toastEl = document.getElementById('toast');

  var frameLoopReady = false;  /* the rAF probe has come back positive */
  var onScreen = false;        /* the deck has this view showing */
  var started = false;
  var player = null;

  /* This view is mostly words. If anything at all goes wrong with the motion,
     the words must still be on the page. */
  function showAll() {
    blocks.forEach(function (b) {
      b.style.opacity = 1;
      b.style.transform = 'none';
    });
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2600);
  }

  function initShare() {
    var btn = document.getElementById('gospel-share');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var url = new URL(window.location.href);
      url.searchParams.delete('b');
      url.searchParams.set('gospel', 'true');

      var payload = {
        title: 'The Good News',
        text: 'Jesus loves you. Grace is available, forgiveness is possible. Hope is alive.',
        url: url.toString()
      };

      if (navigator.share) {
        navigator.share(payload).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          copy(payload);
        });
        return;
      }
      copy(payload);
    });

    function copy(payload) {
      var text = payload.text + '\n' + payload.url;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { toast('Link copied'); })
          .catch(function () { toast('Copy not available'); });
      } else {
        toast('Copy not available');
      }
    }
  }

  /* One narration for the whole view, hidden unless it has been recorded. */
  function initListen() {
    var button = document.getElementById('gospel-listen');
    var block = document.getElementById('gospel-listen-block');
    var audio = window.BLESSING_AUDIO;
    if (!button || !block || !audio || !audio.gospel || !window.createListenPlayer) return;

    player = window.createListenPlayer({
      button: button,
      bar: document.getElementById('gospel-listen-bar'),
      toast: toast,
      playLabel: 'Listen to this page',
      pauseLabel: 'Pause'
    });
    if (!player) return;

    block.hidden = false;
    button.addEventListener('click', function () {
      player.toggle(audio.dir + 'gospel' + audio.ext, 'gospel');
    });
  }

  function reveal(el, delay) {
    window.anime({
      targets: el,
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 900,
      delay: delay || 0,
      easing: 'easeOutExpo'
    });
  }

  function start() {
    if (started) return;
    started = true;

    var anime = window.anime;
    anime.set(blocks, { opacity: 0, translateY: 18 });

    if (!('IntersectionObserver' in window)) {
      /* No observer: stagger everything in once and let the reader scroll. */
      blocks.forEach(function (b, i) { reveal(b, i * 90); });
      return;
    }

    var seen = 0;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        /* A small stagger only for whatever arrives together on first paint. */
        reveal(entry.target, seen < 4 ? seen * 110 : 0);
        seen++;
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });

    blocks.forEach(function (b) { io.observe(b); });

    /* Backstop: anything still hidden a few seconds after this view opened gets
       shown outright, so a missed observer callback can never leave it blank. */
    setTimeout(function () {
      blocks.forEach(function (b) {
        if (parseFloat(getComputedStyle(b).opacity) < 0.05) {
          io.unobserve(b);
          b.style.opacity = 1;
          b.style.transform = 'none';
        }
      });
    }, 6000);
  }

  /* The reveal waits for both a working frame loop and the view actually being
     on screen — otherwise it would play to an empty room while the reader is
     still looking at the blessing card. */
  function maybeStart() {
    if (!frameLoopReady || !onScreen) return;
    start();
  }

  window.GospelView = {
    activate: function () {
      onScreen = true;
      maybeStart();
    },
    deactivate: function () {
      if (player) player.stop();
    }
  };

  function boot() {
    initShare();
    initListen();

    if (!hasAnime || reduced) {
      showAll();
      return;
    }

    window.Ambient.rafAlive(600).then(function (alive) {
      if (!alive) {
        showAll();
        return;
      }
      frameLoopReady = true;
      maybeStart();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
