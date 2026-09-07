/* ============================================================
   The Good News — a long read, revealed as you come to it.
   ============================================================ */
(function () {
  'use strict';

  var hasAnime = typeof window.anime === 'function';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var toastEl = document.getElementById('toast');

  /* This page is mostly words. If anything at all goes wrong with the motion,
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
    var btn = document.getElementById('btn-share');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var payload = {
        title: 'The Good News',
        text: 'Jesus loves you. Grace is available, forgiveness is possible. Hope is alive.',
        url: window.location.href.split('#')[0]
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

    /* Backstop: anything still hidden after a few seconds gets shown outright,
       so a missed observer callback can never leave the page blank. */
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

  /* One narration for the whole page, hidden unless it has been recorded. */
  function initListen() {
    var button = document.getElementById('listen');
    var audio = window.BLESSING_AUDIO;
    if (!button || !audio || !audio.gospel || !window.createListenPlayer) return;

    var player = window.createListenPlayer({
      button: button,
      bar: document.getElementById('listen-bar'),
      toast: toast,
      playLabel: 'Listen to this page',
      pauseLabel: 'Pause'
    });
    if (!player) return;

    button.hidden = false;
    button.addEventListener('click', function () {
      player.toggle(audio.dir + 'gospel' + audio.ext, 'gospel');
    });
  }

  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
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
      window.Ambient.motes(document.getElementById('motes'));
      start();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
