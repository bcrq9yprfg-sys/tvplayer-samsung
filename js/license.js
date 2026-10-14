/* AM IPTV — licentie + gratis proefperiode.
   - Zonder licentie: 3 dagen gratis per TV (bijgehouden op de server, per toestel-ID).
   - Na de proefperiode: de app werkt nog 1 minuut en vraagt dan om een licentiecode.
   - Code wordt lokaal bewaard en elke 24 uur opnieuw gecontroleerd.
   - Geen internet / server onbereikbaar: app blijft werken tot 7 dagen na laatste geslaagde controle.
   - Server zegt expliciet "ongeldig" of "verlopen": app vraagt opnieuw om een code. */
var License = (function () {
  'use strict';

  var BASE = 'https://am-iptv-production.up.railway.app';
  var API = BASE + '/api/license/';
  var STORE = 'amiptv.license', TSTORE = 'amiptv.trial', DSTORE = 'amiptv.device';
  var TRIAL_DAYS = 3, NAG_AFTER = 60 * 1000;
  var RECHECK = 24 * 3600 * 1000;
  var GRACE = 7 * 24 * 3600 * 1000;
  var K = { UP: 38, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };

  var active = false, onOk = null, focusIdx = 0, canBack = false, onClose = null, appStarted = false, nagTimer = null;
  function $(id) { return document.getElementById(id); }

  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(STORE); } catch (e) {} }
  function norm(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* resolve(data) bij antwoord van server, reject(err) bij netwerkfout */
  function check(key) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', API + encodeURIComponent(key));
      x.timeout = 10000;
      x.onload = function () {
        if (x.status !== 200) return reject(new Error('HTTP ' + x.status));
        try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); }
      };
      x.onerror = x.ontimeout = function () { reject(new Error('network')); };
      x.send();
    });
  }

  function getJSON(url) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url); x.timeout = 10000;
      x.onload = function () {
        if (x.status !== 200) return reject(new Error('HTTP ' + x.status));
        try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); }
      };
      x.onerror = x.ontimeout = function () { reject(new Error('network')); };
      x.send();
    });
  }

  /* Vast toestel-ID: Samsung DUID (blijft gelijk na herinstallatie), anders willekeurig ID */
  function deviceId() {
    try { var d = webapis.productinfo.getDuid(); if (d && d.length >= 8) return 'duid-' + d; } catch (e) {}
    try {
      var id = localStorage.getItem(DSTORE);
      if (!id) {
        id = 'dev-'; for (var i = 0; i < 24; i++) id += '0123456789abcdef'[Math.floor(Math.random() * 16)];
        localStorage.setItem(DSTORE, id);
      }
      return id;
    } catch (e) { return 'dev-nostorage'; }
  }

  function loadTrial() { try { return JSON.parse(localStorage.getItem(TSTORE)); } catch (e) { return null; } }
  function saveTrial(t) { try { localStorage.setItem(TSTORE, JSON.stringify(t)); } catch (e) {} }

  /* resolve({ active, msLeft }) — server eerst, bij geen verbinding de laatst bekende stand */
  function trialStatus() {
    return getJSON(BASE + '/api/trial/' + encodeURIComponent(deviceId())).then(function (r) {
      var t = { expires_at: r.expires_at, offset: r.now * 1000 - Date.now() };
      saveTrial(t);
      return { active: r.active, msLeft: r.expires_at * 1000 - (Date.now() + t.offset) };
    }).catch(function () {
      var t = loadTrial();
      if (!t) { t = { expires_at: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86400, offset: 0, local: true }; saveTrial(t); }
      var left = t.expires_at * 1000 - (Date.now() + (t.offset || 0));
      return { active: left > 0, msLeft: left };
    });
  }

  function stopPlayback() { try { Player.stop(); } catch (e) {} }

  /* Proefperiode voorbij: afspelen stoppen en om licentie vragen (kan niet weg met Terug) */
  function nag() {
    if (active) return;
    stopPlayback();
    try { Pair.stop(); } catch (e) {}
    showScreen(T('Je gratis proefperiode is voorbij. Koop een licentie op am-iptv-production.up.railway.app en voer je code in.'), false);
  }
  function scheduleNag(ms) {
    clearTimeout(nagTimer);
    nagTimer = setTimeout(nag, Math.max(0, Math.min(ms, 2147483000)));
  }

  function expired(v) { return v && v.expires_at && v.expires_at * 1000 < Date.now(); }

  function msg(t, ok) { var m = $('lic-msg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }
  function els() { return [$('lic-key'), $('lic-btn')]; }
  function focus(i) {
    focusIdx = Math.max(0, Math.min(i, 1));
    els().forEach(function (el, j) { el.classList.toggle('focused', j === focusIdx); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function showScreen(text, back) {
    active = true; canBack = !!back;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.add('hidden'); });
    $('license').classList.remove('hidden');
    var v = load();
    if (v && v.key) $('lic-key').value = v.key;
    msg(text || '');
    $('lic-hint').textContent = canBack ? T('Pijltjes: navigeren · OK: kiezen · Terug: vorige') : T('Pijltjes: navigeren · OK: kiezen · Terug: afsluiten');
    focus(0);
  }

  function done(v) {
    v.checked = Date.now();
    save(v);
    clearTimeout(nagTimer);
    if (appStarted) { location.reload(); return; }
    if (active) {
      active = false;
      $('license').classList.add('hidden');
      $('setup').classList.remove('hidden');
    }
    var cb = onOk; onOk = null;
    if (cb) cb();
  }

  function activate() {
    var key = norm($('lic-key').value);
    if (key.length < 8) return msg(T('Vul je licentiecode in'));
    msg(T('Controleren…'), true);
    check(key).then(function (r) {
      if (r && r.valid) done({ key: key, plan: r.plan, expires_at: r.expires_at || null });
      else msg(r && r.reason === 'expired'
        ? T('Deze licentie is verlopen')
        : T('Ongeldige licentiecode'));
    }).catch(function () {
      msg(T('Geen verbinding met de server'));
    });
  }

  function key(code) {
    if (!active) return false;
    var input = $('lic-key');
    var editing = document.activeElement === input;
    if (editing) {
      if (code === K.ENTER || code === K.BACK || code === K.ESC) { input.blur(); focus(code === K.ENTER ? 1 : 0); return true; }
      return false;
    }
    switch (code) {
      case K.UP: focus(focusIdx - 1); break;
      case K.DOWN: focus(focusIdx + 1); break;
      case K.ENTER: if (focusIdx === 0) input.focus(); else activate(); break;
      case K.BACK: case K.ESC:
        if (canBack) { close(); break; }
        try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
        break;
      default: return false;
    }
    return true;
  }

  /* Achtergrondcontrole bij een opgeslagen licentie */
  function revalidate(v) {
    check(v.key).then(function (r) {
      if (r && r.valid) { v.plan = r.plan; v.expires_at = r.expires_at || null; v.checked = Date.now(); save(v); }
      else { clear(); location.reload(); }   // ingetrokken: opnieuw starten (proef/licentie)
    }).catch(function () { /* offline: houd huidige status aan */ });
  }

  function licensed() { var v = load(); return !!(v && v.key && !expired(v)); }

  function startApp(cb, info) { appStarted = true; cb(info || {}); }

  function trialFlow(cb) {
    trialStatus().then(function (t) {
      if (t.active) {
        startApp(cb, { trialDays: Math.max(1, Math.ceil(t.msLeft / 86400000)) });
        scheduleNag(t.msLeft + NAG_AFTER);      // proef loopt af terwijl de app open staat
      } else {
        startApp(cb, { trialEnded: true });
        scheduleNag(NAG_AFTER);                 // nog 1 minuut gebruiken, dan licentie vragen
      }
    });
  }

  function ensure(cb) {
    var v = load();
    if (v && v.key && !expired(v)) {
      var age = Date.now() - (v.checked || 0);
      if (age < RECHECK) { startApp(cb); revalidate(v); return; }
      check(v.key).then(function (r) {
        if (r && r.valid) { v.plan = r.plan; v.expires_at = r.expires_at || null; v.checked = Date.now(); save(v); startApp(cb); }
        else { clear(); trialFlow(cb); }
      }).catch(function () {
        if (age < GRACE) startApp(cb);
        else { onOk = function () { startApp(cb); }; showScreen(T('Geen verbinding met de server'), false); }
      });
      return;
    }
    if (v) clear();
    trialFlow(cb);
  }

  /* Vanaf het playlistscherm: licentiecode invoeren (Terug = terug naar playlistscherm) */
  function open(closeCb) {
    onClose = closeCb;
    try { Pair.stop(); } catch (e) {}
    showScreen('', true);
  }
  function close() {
    active = false; canBack = false;
    $('license').classList.add('hidden');
    var cb = onClose; onClose = null;
    if (cb) cb();
  }

  document.addEventListener('click', function (e) {
    if (!active) return;
    if (e.target.id === 'lic-btn') { focus(1); activate(); }
    else if (e.target.id === 'lic-key') { focus(0); }
  });

  return { ensure: ensure, key: key, open: open, licensed: licensed, active: function () { return active; } };
})();
