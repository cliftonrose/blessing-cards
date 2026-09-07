/* ============================================================
   The deck — two views on one page, swipe either way to switch.

   ?gospel=true opens on the Good News; anything else opens on a
   blessing. The URL is kept in step so whatever is on screen is
   what gets shared.
   ============================================================ */
(function () {
  'use strict';

  var deck = document.getElementById('deck');
  var nav = document.getElementById('deck-nav');
  if (!deck) return;

  var views = {
    blessing: document.getElementById('view-blessing'),
    gospel: document.getElementById('view-gospel')
  };
  if (!views.blessing || !views.gospel) return;

  var hasAnime = typeof window.anime === 'function';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var current = null;
  var busy = false;

  /* ---------- which view to open on ---------- */

  function wanted() {
    var p = new URLSearchParams(window.location.search);
    var g = (p.get('gospel') || '').toLowerCase();
    return g === 'true' ? 'gospel' : 'blessing';
  }

  /* Keep the address bar honest, so Share and a reload both land back on
     whatever the reader is actually looking at. */
  function syncUrl(name) {
    if (!window.history || !history.replaceState) return;
    var url = new URL(window.location.href);
    if (name === 'gospel') url.searchParams.set('gospel', 'true');
    else url.searchParams.delete('gospel');
    history.replaceState(null, '', url.toString());
  }

  function markNav(name) {
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('.deck-dot'), function (dot) {
      var on = dot.getAttribute('data-goto') === name;
      dot.classList.toggle('is-current', on);
      dot.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  /* ---------- switching ---------- */

  function activate(name) {
    var hook = name === 'gospel' ? window.GospelView : window.BlessingView;
    if (hook && typeof hook.activate === 'function') hook.activate();
  }

  function deactivate(name) {
    var hook = name === 'gospel' ? window.GospelView : window.BlessingView;
    if (hook && typeof hook.deactivate === 'function') hook.deactivate();
  }

  /* Drop any animation still registered against this view before clearing it.
     An interrupted fade stays in anime's list holding its end value, and will
     re-apply that value — opacity 0 — the next time the engine ticks, long
     after we thought the view was restored. */
  function bare(el) {
    if (hasAnime) window.anime.remove(el);
    el.style.opacity = '';
    el.style.transform = '';
  }

  /* The swap itself runs on timers, never on an animation callback. anime only
     decorates: if the frame loop is throttled its complete() never fires, and
     gating the switch on it would strand the reader on the old view with `busy`
     stuck true, locking out every later swipe. */
  function show(name, dir) {
    if (busy || name === current || !views[name]) return;
    busy = true;

    var outgoing = current ? views[current] : null;
    var incoming = views[name];
    var from = current;

    /* dir: -1 came from a leftward swipe, so the new view enters from the right. */
    var d = dir === 1 ? 1 : -1;
    var moving = hasAnime && !reduced;
    var out = moving && outgoing ? 280 : 0;

    if (moving && outgoing) {
      window.anime.remove(outgoing);
      window.anime({
        targets: outgoing,
        opacity: [1, 0],
        translateX: [0, d * 34],
        duration: out,
        easing: 'easeInQuad'
      });
    }

    setTimeout(function () {
      if (outgoing) {
        outgoing.hidden = true;
        bare(outgoing);
      }
      incoming.hidden = false;

      if (from) deactivate(from);
      current = name;
      markNav(name);
      syncUrl(name);
      window.scrollTo(0, 0);
      activate(name);

      if (!moving) {
        bare(incoming);
        busy = false;
        return;
      }

      window.anime.remove(incoming);
      window.anime.set(incoming, { opacity: 0, translateX: -d * 34 });
      window.anime({
        targets: incoming,
        opacity: [0, 1],
        translateX: [-d * 34, 0],
        duration: 620,
        easing: 'easeOutExpo'
      });

      /* Clearing the inline styles outright returns the view to its stylesheet
         values, so it is on screen even if not one frame of that ever ran. */
      setTimeout(function () {
        bare(incoming);
        busy = false;
      }, 700);
    }, out);
  }

  function other() { return current === 'gospel' ? 'blessing' : 'gospel'; }

  /* ---------- swipe ---------- */

  /* Detected on release rather than during the drag: the Good News view scrolls
     vertically and well past one screen, and anything that calls preventDefault
     mid-gesture risks eating that scroll. */
  function initSwipe() {
    var startX = 0, startY = 0, startT = 0, tracking = false;

    deck.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
      tracking = true;
    }, { passive: true });

    deck.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;

      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var ms = Date.now() - startT;

      var far = Math.abs(dx) > 55;
      var sideways = Math.abs(dx) > Math.abs(dy) * 1.6;
      var quick = ms < 900;

      if (far && sideways && quick) show(other(), dx < 0 ? -1 : 1);
    }, { passive: true });
  }

  /* ---------- controls ---------- */

  function initControls() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-goto]') : null;
      if (!trigger) return;
      e.preventDefault();
      var name = trigger.getAttribute('data-goto');
      show(name, name === 'gospel' ? -1 : 1);
    });
  }

  /* ---------- boot ---------- */

  var first = wanted();

  /* Put the opening view in place before anything animates, so a scan that asks
     for the Good News never flashes the card first. */
  views.blessing.hidden = first !== 'blessing';
  views.gospel.hidden = first !== 'gospel';
  current = first;
  markNav(first);
  activate(first);

  initSwipe();
  initControls();

  window.Deck = { show: show, current: function () { return current; } };
})();
