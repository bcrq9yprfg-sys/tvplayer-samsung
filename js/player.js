/* Speler: Samsung AVPlay op TV, HTML5 <video> als fallback (browser).
   Ondersteunt ingebouwde ondertitel- en audiosporen (AVPlay). */
var Player = (function () {
  var hasAV = typeof webapis !== 'undefined' && !!webapis.avplay;
  var avEl = document.getElementById('avplayer');
  var vid = document.getElementById('html5video');
  var onStatus = function () {}, onEnd = function () {}, onReady = function () {}, onSub = function () {};
  var LANG3 = { dut: 'nl', nld: 'nl', eng: 'en', ara: 'ar', tur: 'tr', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
    spa: 'es', por: 'pt', ita: 'it', pol: 'pl', rus: 'ru' };

  /* Samsung-eis: geen screensaver tijdens afspelen */
  function screenSaver(on) {
    try {
      webapis.appcommon.setScreenSaver(on ? webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON
                                          : webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) { /* browser */ }
  }

  function stop() {
    current = null;
    screenSaver(true);
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

  var current = null, resumeInfo = null;   // huidige stream (voor hervatten na Smart Hub)

  /* Begrijpelijke foutmelding met oplossing (Samsung UX150042) */
  function failMsg() { return T('Afspelen lukt niet. Controleer je internetverbinding of kies een andere titel.'); }

  function play(url, startMs) {
    stop();
    current = url;
    screenSaver(false);
    onStatus(T('Laden…'));
    if (hasAV) {
      avEl.style.display = 'block';
      try {
        webapis.avplay.open(url);
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        webapis.avplay.setListener({
          onbufferingstart: function () { onStatus(T('Bufferen…')); },
          onbufferingcomplete: function () { onStatus(''); },
          onerror: function () { onStatus(failMsg()); },
          onstreamcompleted: function () { onStatus(''); onEnd(); },
          onsubtitlechange: function (duration, text) { onSub(String(text || '').replace(/<[^>]+>/g, '')); }
        });
        webapis.avplay.prepareAsync(
          function () {
            try { webapis.avplay.setSilentSubtitle(true); } catch (e) {}
            if (startMs > 0) { try { webapis.avplay.seekTo(startMs); } catch (e) {} }
            webapis.avplay.play(); onStatus(''); onReady();
          },
          function () { onStatus(failMsg()); }
        );
      } catch (e) {
        onStatus(failMsg());
      }
    } else {
      vid.style.display = 'block';
      vid.src = url;
      var first = true;
      vid.onplaying = function () { onStatus(''); if (first) { first = false; onReady(); } };
      vid.onwaiting = function () { onStatus(T('Bufferen…')); };
      vid.onended = function () { onEnd(); };
      vid.onerror = function () { onStatus(failMsg()); };
      if (startMs > 0) vid.onloadedmetadata = function () { try { vid.currentTime = startMs / 1000; } catch (e) {} };
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
    if (vid.paused) { var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); return false; }
    vid.pause(); return true;
  }

  /* Opnieuw starten op dezelfde plek (na netwerkherstel) */
  function restart() {
    if (!current) return;
    var u = current, t = duration() > 0 ? time() : 0;
    play(u, t);
  }

  function paused() {
    if (hasAV) { try { return webapis.avplay.getState() === 'PAUSED'; } catch (e) { return false; } }
    return !!vid.paused && !!vid.src;
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

  /* Multitasking (Samsung MU150001): naar Smart Hub = stoppen en positie onthouden,
     terug in de app = verder afspelen (film/serie op dezelfde plek, live opnieuw starten). */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (current) {
        var d = duration();
        resumeInfo = { url: current, t: d > 0 ? time() : 0, paused: paused() };
        stop(); current = null;
      }
    } else if (resumeInfo) {
      var r = resumeInfo; resumeInfo = null;
      play(r.url, r.t);
    }
  });

  return {
    play: play, stop: stop, restart: restart, togglePause: togglePause, paused: paused, time: time, duration: duration, seek: seek,
    tracks: tracks, selectTrack: selectTrack, muteEmbeddedSubs: muteEmbeddedSubs,
    setStatusHandler: function (fn) { onStatus = fn; },
    setEndHandler: function (fn) { onEnd = fn; },
    setReadyHandler: function (fn) { onReady = fn; },
    setSubtitleHandler: function (fn) { onSub = fn; },
    isTV: hasAV
  };
})();
