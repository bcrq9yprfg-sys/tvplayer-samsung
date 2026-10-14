/* AM IPTV — playlist toevoegen via telefoon (QR-code).
   Op het playlistscherm vraagt de TV een koppelcode aan, toont die als QR-code
   en kijkt elke 2 seconden of de telefoon een playlist heeft ingestuurd.
   Zodra die binnen is, laadt de app hem automatisch. */
var Pair = (function () {
  'use strict';
  var API = 'https://am-iptv-production.up.railway.app';
  var session = null, timer = null, running = false, onResult = null, gen = 0;
  function $(id) { return document.getElementById(id); }

  function req(method, url) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, url); x.timeout = 10000;
      x.onload = function () { try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); } };
      x.onerror = x.ontimeout = function () { reject(new Error('network')); };
      x.send();
    });
  }

  function status(t) { $('qr-status').textContent = t || ''; }

  function draw(url) {
    try {
      var q = qrcode(0, 'M'); q.addData(url); q.make();
      $('qr-img').innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    } catch (e) { $('qr-img').innerHTML = ''; }
  }

  function newSession() {
    var my = ++gen;
    status(T('QR-code laden…')); $('qr-img').innerHTML = ''; $('qr-code').textContent = '';
    req('POST', API + '/api/pair').then(function (r) {
      if (!running || my !== gen) return;
      session = r;
      draw(r.url);
      $('qr-code').textContent = T('Code: ') + r.code;
      status('');
      poll(my);
    }).catch(function () {
      if (!running || my !== gen) return;
      status(T('QR-code niet beschikbaar (geen verbinding)'));
      timer = setTimeout(newSession, 15000);
    });
  }

  function poll(my) {
    timer = setTimeout(function () {
      if (!running || my !== gen || !session) return;
      req('GET', API + '/api/pair/' + session.code + '/result?token=' + session.token).then(function (r) {
        if (!running || my !== gen) return;
        if (r.status === 'done') {
          var src = r.type === 'xtream'
            ? { mode: 'xtream', server: r.xtream_host, user: r.xtream_user, pass: r.xtream_pass }
            : { mode: 'm3u', url: r.m3u_url };
          status(T('Playlist ontvangen…'));
          stop();
          if (onResult) onResult(src);
        } else if (r.status === 'pending') poll(my);
        else newSession();          // verlopen of onbekend: nieuwe code
      }).catch(function () { poll(my); });
    }, 2000);
  }

  function start(cb) {
    onResult = cb;
    if (running) return;
    running = true;
    newSession();
  }
  function stop() { running = false; gen++; clearTimeout(timer); session = null; }

  return { start: start, stop: stop };
})();
