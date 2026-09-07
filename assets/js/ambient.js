/* ============================================================
   Shared ambience — the dark room both pages sit in.
   ============================================================ */
window.Ambient = (function () {
  'use strict';

  /* Pages hide their content so it can be revealed. If requestAnimationFrame
     never fires — backgrounded tab, throttled webview, an embedded browser that
     doesn't drive a frame loop — nothing would ever paint it. Probe first so the
     caller can fall back to showing everything outright. */
  function rafAlive(timeout) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(ok) { if (!settled) { settled = true; resolve(ok); } }
      requestAnimationFrame(function () { done(true); });
      setTimeout(function () { done(false); }, timeout);
    });
  }

  /* Slow motes of light drifting upward. */
  function motes(cv) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    var w = 0, h = 0, dpr = 1;
    var parts = [];
    var raf = null;
    var sprite = makeSprite();

    function makeSprite() {
      var s = document.createElement('canvas');
      var n = 64;
      s.width = s.height = n;
      var c = s.getContext('2d');
      var g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, 'rgba(255,240,205,0.95)');
      g.addColorStop(0.32, 'rgba(233,201,126,0.45)');
      g.addColorStop(1, 'rgba(233,201,126,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
      return s;
    }

    function spawn(anywhere) {
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 20,
        r: 0.7 + Math.random() * 2.1,
        vy: 0.07 + Math.random() * 0.26,
        drift: (Math.random() - 0.5) * 0.20,
        a: 0.10 + Math.random() * 0.40,
        ph: Math.random() * Math.PI * 2,
        sp: 0.005 + Math.random() * 0.013
      };
    }

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(56, Math.max(22, (w * h) / 27000)));
      parts = [];
      for (var i = 0; i < n; i++) parts.push(spawn(true));
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.vy;
        p.x += p.drift + Math.sin(p.ph) * 0.16;
        p.ph += p.sp;
        if (p.y < -20) parts[i] = spawn(false);
        var d = p.r * 11;
        ctx.globalAlpha = p.a * (0.62 + 0.38 * Math.sin(p.ph * 1.7));
        ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    function start() { if (raf === null) raf = requestAnimationFrame(frame); }
    function stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }

    size();
    start();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(size, 180);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  return { rafAlive: rafAlive, motes: motes };
})();
