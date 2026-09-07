/* ============================================================
   Shared listen button — one <audio>, a progress ring, and a fade.
   Used by the blessing card and by the Good News page.
   ============================================================ */
window.createListenPlayer = function (opts) {
  'use strict';

  var button = opts.button;
  var bar = opts.bar;
  var toast = opts.toast || function () {};

  if (!button) return null;

  var audio = null;
  var circumference = 0;
  var state = 'idle';   /* idle | loading | playing */
  var loadedId = null;  /* which recording the element currently holds */

  /* The recordings end on a non-zero sample, which a media element clips off
     abruptly — audible as a small pop, though local players hide it by draining
     their own buffer. Routing through a gain node lets us ramp to silence just
     before the stream ends. `volume` would be simpler but is read-only on iOS,
     so it is no use here. */
  var FADE_OUT = 0.14;
  var actx = null;
  var gainNode = null;
  var graphOff = false;

  function prepareGraph(el) {
    if (gainNode || graphOff) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !AC.prototype.createMediaElementSource) { graphOff = true; return; }

    try {
      actx = new AC();
    } catch (e) {
      graphOff = true;
      return;
    }

    /* Only take over routing once the context is actually running. Connecting a
       suspended context would silence playback entirely, which is far worse than
       the pop we are removing. */
    function connect() {
      if (gainNode || actx.state !== 'running') return;
      try {
        gainNode = actx.createGain();
        actx.createMediaElementSource(el).connect(gainNode);
        gainNode.connect(actx.destination);
      } catch (e) {
        gainNode = null;
        graphOff = true;
      }
    }

    if (actx.state === 'running') connect();
    else if (actx.resume) actx.resume().then(connect, function () { graphOff = true; });
    else graphOff = true;
  }

  function scheduleFade() {
    if (!gainNode || !audio) return;
    var d = audio.duration;
    if (!d || !isFinite(d)) return;

    var rate = audio.playbackRate || 1;
    var remaining = (d - audio.currentTime) / rate;
    var now = actx.currentTime;
    var start = now + Math.max(0, remaining - FADE_OUT);

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(1, now);
    gainNode.gain.setValueAtTime(1, start);
    gainNode.gain.linearRampToValueAtTime(0.0001, start + FADE_OUT);
  }

  function clearFade() {
    if (!gainNode) return;
    gainNode.gain.cancelScheduledValues(actx.currentTime);
    gainNode.gain.setValueAtTime(1, actx.currentTime);
  }

  function setProgress(fraction) {
    if (!bar || !circumference) return;
    var clamped = Math.max(0, Math.min(1, fraction || 0));
    bar.style.strokeDashoffset = (circumference * (1 - clamped)).toFixed(3);
  }

  /* The button follows our own state, not the media element's flags: paused /
     ended race with the events that set them, which left the button showing
     "playing" after a pause. */
  function setState(next) {
    state = next;
    var playing = next === 'playing';
    button.classList.toggle('is-playing', playing);
    button.classList.toggle('is-loading', next === 'loading');
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.setAttribute('aria-label', playing ? opts.pauseLabel : opts.playLabel);
  }

  function ensureAudio() {
    if (audio) return audio;

    audio = new Audio();
    audio.preload = 'none';

    audio.addEventListener('playing', function () {
      setState('playing');
      scheduleFade();
    });
    audio.addEventListener('loadedmetadata', scheduleFade);
    audio.addEventListener('seeked', scheduleFade);
    audio.addEventListener('waiting', function () { setState('loading'); });
    audio.addEventListener('pause', function () {
      if (!audio.ended) setState('idle');
    });
    audio.addEventListener('timeupdate', function () {
      if (state === 'idle') return;
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    });
    /* No currentTime reset here: play() rewinds an ended element by itself, and
       assigning currentTime fires a trailing timeupdate that redraws the ring
       part-way round just after it was cleared. */
    audio.addEventListener('ended', function () {
      setState('idle');
      setProgress(0);
    });
    audio.addEventListener('error', function () {
      setState('idle');
      setProgress(0);
      toast('Recording unavailable');
    });

    return audio;
  }

  function toggle(url, id) {
    var el = ensureAudio();

    /* Anything but idle for this recording means a press is a stop. */
    if (state !== 'idle' && loadedId === id) {
      el.pause();
      clearFade();
      setState('idle');
      return;
    }

    if (loadedId !== id) {
      el.src = url;
      loadedId = id;
      setProgress(0);
    }

    prepareGraph(el);
    clearFade();

    setState('loading');
    var attempt = el.play();
    if (attempt && attempt.catch) {
      attempt.catch(function () {
        setState('idle');
        setProgress(0);
      });
    }
  }

  function stop() {
    if (audio) {
      audio.pause();
      clearFade();
      /* Drop the source so a half-buffered file isn't left downloading. */
      audio.removeAttribute('src');
      audio.load();
    }
    loadedId = null;
    setState('idle');
    setProgress(0);
  }

  function init() {
    if (bar) {
      /* Derive the dash length from the rendered radius so the ring stays exact
         if the button is ever resized. */
      var r = parseFloat(bar.getAttribute('r')) || 22;
      circumference = 2 * Math.PI * r;
      bar.style.strokeDasharray = circumference.toFixed(3);
    }
    setProgress(0);
    setState('idle');
  }

  opts.playLabel = opts.playLabel || 'Listen';
  opts.pauseLabel = opts.pauseLabel || 'Pause';
  init();

  return { toggle: toggle, stop: stop };
};
