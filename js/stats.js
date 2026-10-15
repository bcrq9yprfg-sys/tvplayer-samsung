/* AM IPTV — kijkstatistieken (alleen met toestemming).
   Vraagt één keer: "Mogen we bijhouden wat je kijkt?" Ja / Nee.
   Bij Ja meldt de app per gestarte titel: soort, titel, map, seizoen/aflevering.
   Nooit: playlist-link, Xtream-gegevens of andere inloggegevens. */
var Stats = (function () {
  'use strict';
  var API = 'https://am-iptv-production.up.railway.app/api/watch';
  var STORE = 'amiptv.stats';
  var active = false, idx = 0, after = null;
  var K = { LEFT: 37, RIGHT: 39, UP: 38, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };
  function $(id) { return document.getElementById(id); }
  function choice() { try { return localStorage.getItem(STORE); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(STORE, v); } catch (e) {} }

  function focus(i) {
    idx = Math.max(0, Math.min(1, i));
    [$('st-yes'), $('st-no')].forEach(function (b, j) { b.classList.toggle('focused', j === idx); });
  }
  function answer(yes) {
    setChoice(yes ? 'yes' : 'no');
    active = false;
    $('statsbox').classList.add('hidden');
    var cb = after; after = null;
    if (cb) cb();
  }

  /* Vraag stellen als dat nog niet gebeurd is; daarna cb() */
  function ask(cb) {
    if (choice()) { cb(); return; }
    after = cb; active = true;
    $('statsbox').classList.remove('hidden');
    focus(0);
  }

  function key(code) {
    if (!active) return false;
    switch (code) {
      case K.LEFT: case K.UP: focus(idx - 1); break;
      case K.RIGHT: case K.DOWN: focus(idx + 1); break;
      case K.ENTER: answer(idx === 0); break;
      case K.BACK: case K.ESC: answer(false); break;
      default: break;
    }
    return true;
  }

  function send(ev) {
    if (choice() !== 'yes') return;
    try {
      ev.device = License.device();
      ev.license = License.code() || '';
      var x = new XMLHttpRequest();
      x.open('POST', API); x.timeout = 8000;
      x.setRequestHeader('Content-Type', 'text/plain');   // geen preflight nodig
      x.send(JSON.stringify(ev));
    } catch (e) { /* stil */ }
  }

  document.addEventListener('click', function (e) {
    if (!active) return;
    if (e.target.id === 'st-yes') answer(true);
    else if (e.target.id === 'st-no') answer(false);
  });

  return { ask: ask, key: key, send: send, active: function () { return active; },
           enabled: function () { return choice() === 'yes'; },
           toggle: function () { setChoice(choice() === 'yes' ? 'no' : 'yes'); return choice() === 'yes'; } };
})();
