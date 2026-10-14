/* AM IPTV — licentiecontrole.
   De app start pas na een geldige licentiecode van am-iptv-production.up.railway.app.
   - Code wordt lokaal bewaard en elke 24 uur opnieuw gecontroleerd.
   - Geen internet / server onbereikbaar: app blijft werken tot 7 dagen na laatste geslaagde controle.
   - Server zegt expliciet "ongeldig" of "verlopen": app vraagt opnieuw om een code. */
var License = (function () {
  'use strict';

  var API = 'https://am-iptv-production.up.railway.app/api/license/';
  var STORE = 'amiptv.license';
  var RECHECK = 24 * 3600 * 1000;
  var GRACE = 7 * 24 * 3600 * 1000;
  var K = { UP: 38, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };

  var active = false, onOk = null, focusIdx = 0;
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

  function expired(v) { return v && v.expires_at && v.expires_at * 1000 < Date.now(); }

  function msg(t, ok) { var m = $('lic-msg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }
  function els() { return [$('lic-key'), $('lic-btn')]; }
  function focus(i) {
    focusIdx = Math.max(0, Math.min(i, 1));
    els().forEach(function (el, j) { el.classList.toggle('focused', j === focusIdx); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function showScreen(text) {
    active = true;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.add('hidden'); });
    $('license').classList.remove('hidden');
    var v = load();
    if (v && v.key) $('lic-key').value = v.key;
    msg(text || '');
    focus(0);
  }

  function done(v) {
    v.checked = Date.now();
    save(v);
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
    if (key.length < 8) return msg('Vul je licentiecode in · Enter your license code');
    msg('Controleren… · Checking…', true);
    check(key).then(function (r) {
      if (r && r.valid) done({ key: key, plan: r.plan, expires_at: r.expires_at || null });
      else msg(r && r.reason === 'expired'
        ? 'Deze licentie is verlopen · This license has expired'
        : 'Ongeldige licentiecode · Invalid license code');
    }).catch(function () {
      msg('Geen verbinding met de server · Cannot reach server');
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
      else { clear(); location.reload(); }
    }).catch(function () { /* offline: houd huidige status aan */ });
  }

  function ensure(cb) {
    var v = load();
    if (v && v.key && !expired(v)) {
      var age = Date.now() - (v.checked || 0);
      if (age < RECHECK) { cb(); revalidate(v); return; }
      check(v.key).then(function (r) {
        if (r && r.valid) { v.plan = r.plan; v.expires_at = r.expires_at || null; v.checked = Date.now(); save(v); cb(); }
        else { clear(); onOk = cb; showScreen(r && r.reason === 'expired' ? 'Je licentie is verlopen · Your license has expired' : ''); }
      }).catch(function () {
        if (age < GRACE) cb();
        else { onOk = cb; showScreen('Geen verbinding met de server · Cannot reach server'); }
      });
      return;
    }
    onOk = cb;
    showScreen('');
  }

  document.addEventListener('click', function (e) {
    if (!active) return;
    if (e.target.id === 'lic-btn') { focus(1); activate(); }
    else if (e.target.id === 'lic-key') { focus(0); }
  });

  return { ensure: ensure, key: key, active: function () { return active; } };
})();
