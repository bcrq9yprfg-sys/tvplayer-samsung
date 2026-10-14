/* Speler: Samsung AVPlay op TV, HTML5 <video> als fallback (browser).
   Ondersteunt ingebouwde ondertitel- en audiosporen (AVPlay). */
var Player = (function () {
  var hasAV = typeof webapis !== 'undefined' && !!webapis.avplay;
  var avEl = document.getElementById('avplayer');
  var vid = document.getElementById('html5video');
  var onStatus = function () {}, onEnd = function () {}, onReady = function () {}, onSub = function () {};
  var LANG3 = { dut: 'nl', nld: 'nl', eng: 'en', ara: 'ar', tur: 'tr', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
    spa: 'es', por: 'pt', ita: 'it', pol: 'pl', rus: 'ru' };

  function stop() {
    if (hasAV) {
      try { webapis.avplay.stop(); } catch (e) {}
      try { webapis.avplay.close(); } catch (e) {}
      avEl.style.display = 'none';
    } else {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.style.display = 'none';
    }
  }

  function play(url) {
    stop();
    onStatus('Laden…');
    if (hasAV) {
      avEl.style.display = 'block';
      try {
        webapis.avplay.open(url);
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        webapis.avplay.setListener({
          onbufferingstart: function () { onStatus('Bufferen…'); },
          onbufferingcomplete: function () { onStatus(''); },
          onerror: function (e) { onStatus('Fout: ' + e); },
          onstreamcompleted: function () { onStatus(''); onEnd(); },
          onsubtitlechange: function (duration, text) { onSub(String(text || '').replace(/<[^>]+>/g, '')); }
        });
        webapis.avplay.prepareAsync(
          function () {
            try { webapis.avplay.setSilentSubtitle(true); } catch (e) {}
            webapis.avplay.play(); onStatus(''); onReady();
          },
          function (e) { onStatus('Kan niet afspelen: ' + (e && e.name || e)); }
        );
      } catch (e) {
        onStatus('Kan niet afspelen: ' + e.message);
      }
    } else {
      vid.style.display = 'block';
      vid.src = url;
      var first = true;
      vid.onplaying = function () { onStatus(''); if (first) { first = false; onReady(); } };
      vid.onwaiting = function () { onStatus('Bufferen…'); };
      vid.onended = function () { onEnd(); };
      vid.onerror = function () { onStatus('Browser kan stream niet afspelen'); };
      vid.play().catch(function () {});
    }
  }

  function togglePause() {
    if (hasAV) {
      var st = webapis.avplay.getState();
      if (st === 'PLAYING') { webapis.avplay.pause(); return true; }
      if (st === 'PAUSED') { webapis.avplay.play(); return false; }
      return false;
    }
    if (vid.paused) { vid.play(); return false; }
    vid.pause(); return true;
  }

  function time() {
    if (hasAV) { try { return webapis.avplay.getCurrentTime() || 0; } catch (e) { return 0; } }
    return (vid.currentTime || 0) * 1000;
  }
  function duration() {
    if (hasAV) { try { return webapis.avplay.getDuration() || 0; } catch (e) { return 0; } }
    return isFinite(vid.duration) ? vid.duration * 1000 : 0;
  }
  function seek(deltaMs) {
    if (hasAV) {
      try {
        if (deltaMs > 0) webapis.avplay.jumpForward(deltaMs);
        else webapis.avplay.jumpBackward(-deltaMs);
      } catch (e) {}
    } else {
      vid.currentTime = Math.max(0, vid.currentTime + deltaMs / 1000);
    }
  }

  /* ---------- Sporen ---------- */
  function tracks() {
    if (!hasAV) return [];
    try {
      return webapis.avplay.getTotalTrackInfo().map(function (t) {
        var info = {};
        try { info = JSON.parse(t.extra_info); } catch (e) {}
        var l = String(info.track_lang || info.language || '').toLowerCase();
        return { index: t.index, type: t.type, lang: LANG3[l] || l.slice(0, 2) };
      }).filter(function (t) { return t.type === 'TEXT' || t.type === 'AUDIO'; });
    } catch (e) { return []; }
  }
  function selectTrack(type, index) {
    try {
      webapis.avplay.setSelectTrack(type, index);
      if (type === 'TEXT') webapis.avplay.setSilentSubtitle(false);
      return true;
    } catch (e) { return false; }
  }
  function muteEmbeddedSubs() { if (hasAV) { try { webapis.avplay.setSilentSubtitle(true); } catch (e) {} } onSub(''); }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
  });

  return {
    play: play, stop: stop, togglePause: togglePause, time: time, duration: duration, seek: seek,
    tracks: tracks, selectTrack: selectTrack, muteEmbeddedSubs: muteEmbeddedSubs,
    setStatusHandler: function (fn) { onStatus = fn; },
    setEndHandler: function (fn) { onEnd = fn; },
    setReadyHandler: function (fn) { onReady = fn; },
    setSubtitleHandler: function (fn) { onSub = fn; },
    isTV: hasAV
  };
})();
