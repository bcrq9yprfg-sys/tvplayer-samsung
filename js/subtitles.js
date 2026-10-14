/* Ondertitels: online zoeken (OpenSubtitles REST API), SRT/VTT lezen, tonen in sync met de speler. */
var Subs = (function () {
  var API = 'https://api.opensubtitles.com/api/v1';
  var NAMES = { nl: 'Nederlands', en: 'English', ar: 'العربية', tr: 'Türkçe', fr: 'Français', de: 'Deutsch',
    es: 'Español', pt: 'Português', it: 'Italiano', pl: 'Polski', ru: 'Русский' };
  var token = null, tokenTime = 0;

  function cfg() { return (window.CONFIG && CONFIG.opensubtitles) || {}; }
  function langs() { return (window.CONFIG && CONFIG.subLangs) || ['nl', 'en']; }
  function name(l) { return NAMES[l] || String(l || '').toUpperCase(); }
  function configured() { return !!cfg().apiKey; }

  /* ---------- API ---------- */
  function req(method, url, body, auth) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, url.indexOf('http') === 0 ? url : API + url, true);
      x.timeout = 20000;
      if (url.indexOf('http') !== 0) {
        x.setRequestHeader('Api-Key', cfg().apiKey);
        x.setRequestHeader('Accept', 'application/json');
        try { x.setRequestHeader('X-User-Agent', cfg().appName || 'TVPlayer v1'); } catch (e) {}
        if (auth && token) x.setRequestHeader('Authorization', 'Bearer ' + token);
        if (body) x.setRequestHeader('Content-Type', 'application/json');
      }
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) {
          if (url.indexOf('http') === 0) return resolve(x.responseText);
          try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('Ongeldig antwoord van OpenSubtitles')); }
          return;
        }
        var j = null; try { j = JSON.parse(x.responseText); } catch (e) {}
        var m = j && (j.message || (j.errors && j.errors[0]));
        if (x.status === 401) m = 'OpenSubtitles: inlog of API-sleutel klopt niet';
        if (x.status === 406 || x.status === 429) m = m || T('OpenSubtitles: daglimiet bereikt');
        reject(new Error(m || 'OpenSubtitles gaf HTTP ' + x.status));
      };
      x.onerror = function () { reject(new Error(T('Geen verbinding met OpenSubtitles'))); };
      x.ontimeout = function () { reject(new Error(T('OpenSubtitles reageert niet'))); };
      x.send(body ? JSON.stringify(body) : null);
    });
  }

  function login() {
    var c = cfg();
    if (!c.username || !c.password) return Promise.resolve(null);
    if (token && Date.now() - tokenTime < 20 * 3600 * 1000) return Promise.resolve(token);
    return req('POST', '/login', { username: c.username, password: c.password }).then(function (r) {
      token = r && r.token; tokenTime = Date.now(); return token;
    });
  }

  // "NL | The Batman (2022) 4K" → "The Batman"
  function clean(n) {
    return String(n || '')
      .replace(/^[^|]{1,14}\|\s*/, '')
      .replace(/^[A-Z]{2,3}\s*[-:]\s+/, '')
      .replace(/\((19|20)\d\d\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(4K|UHD|FHD|HD|SD|HEVC|x265|H265|MULTI|DUBBED|GESPROKEN|SUBS?|NL|EN)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function search(q) {
    var p = ['languages=' + q.lang];
    if (q.kind === 'episode') {
      p.push('type=episode');
      if (q.parentTmdb) p.push('parent_tmdb_id=' + encodeURIComponent(q.parentTmdb));
      else p.push('query=' + encodeURIComponent(clean(q.name)));
      p.push('season_number=' + q.season, 'episode_number=' + q.episode);
    } else {
      p.push('type=movie');
      if (q.tmdb) p.push('tmdb_id=' + encodeURIComponent(q.tmdb));
      else { p.push('query=' + encodeURIComponent(clean(q.name))); if (q.year) p.push('year=' + q.year); }
    }
    return req('GET', '/subtitles?' + p.join('&')).then(function (r) { return (r && r.data) || []; });
  }

  function pick(list) {
    function score(d) {
      var a = d.attributes;
      return (a.download_count || 0) + (a.from_trusted ? 100000 : 0) -
        (a.hearing_impaired ? 1000000 : 0) - (a.machine_translated || a.ai_translated ? 2000000 : 0);
    }
    list = list.filter(function (d) { return d.attributes && d.attributes.files && d.attributes.files.length; });
    list.sort(function (a, b) { return score(b) - score(a); });
    return list[0] || null;
  }

  function download(fileId) {
    return login().then(function () {
      return req('POST', '/download', { file_id: fileId, sub_format: 'srt' }, true);
    }).then(function (r) {
      if (!r || !r.link) throw new Error('OpenSubtitles gaf geen downloadlink');
      return req('GET', r.link);
    });
  }

  // q: { key, kind:'movie'|'episode', name, year, tmdb, parentTmdb, season, episode, lang }
  function find(q) {
    if (!configured()) return Promise.reject(new Error(T('Online ondertitels niet beschikbaar')));
    var ck = 'sub|' + q.key + '|' + q.lang;
    return Sources.kvGet(ck).then(function (c) {
      if (c) return c;
      return search(q).then(function (list) {
        var best = pick(list);
        if (!best) throw new Error(T('Geen ondertitels gevonden in ') + name(q.lang));
        return download(best.attributes.files[0].file_id).then(function (text) {
          var v = { text: text, lang: q.lang, release: best.attributes.release || '' };
          Sources.kvPut(ck, v);
          return v;
        });
      });
    });
  }

  /* ---------- SRT / WebVTT lezen ---------- */
  function parse(text) {
    text = String(text || '').replace(/\r/g, '').replace(/^﻿/, '');
    var re = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g, m, cues = [];
    function ms(h, mi, s, f) { return ((+h * 60 + +mi) * 60 + +s) * 1000 + +((f + '00').slice(0, 3)); }
    while ((m = re.exec(text))) {
      var t = m[9].replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim();
      if (t) cues.push({ s: ms(m[1], m[2], m[3], m[4]), e: ms(m[5], m[6], m[7], m[8]), t: t });
    }
    cues.sort(function (a, b) { return a.s - b.s; });
    return cues;
  }

  /* ---------- Tonen ---------- */
  var cues = null, offset = 0, timer = null, last = null;
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function setText(t) {
    t = t || '';
    if (t === last) return;
    last = t;
    document.getElementById('subs').innerHTML = t ? t.split('\n').map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('<br>') : '';
  }
  function tick() {
    if (!cues) return;
    var t = Player.time() + offset, lo = 0, hi = cues.length - 1, txt = '';
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, c = cues[mid];
      if (t < c.s) hi = mid - 1; else if (t > c.e) lo = mid + 1; else { txt = c.t; break; }
    }
    setText(txt);
  }
  function showCues(c) { cues = c; offset = 0; clearInterval(timer); timer = setInterval(tick, 200); tick(); }
  function hide() { cues = null; clearInterval(timer); timer = null; setText(''); }
  function shift(ms) { offset += ms; tick(); return offset; }
  function active() { return !!cues; }

  return {
    langs: langs, name: name, configured: configured, find: find, parse: parse,
    showCues: showCues, hide: hide, shift: shift, active: active, setText: setText
  };
})();
