/* Playlist-bronnen: downloaden, parsen in een worker, index, zoeken, cache.
   Database (na expand): { live:[], movies:[], series:[] } met objecten
   { kind, id, name, img, cat, url, rating, added, year, ... } */
var Sources = (function () {

  /* ---------- Netwerk ---------- */
  function httpGet(url, timeoutMs, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeoutMs || 30000;
      if (onProgress) xhr.onprogress = function (e) { onProgress(e.loaded, e.lengthComputable ? e.total : 0); };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error('Server gaf HTTP ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('Geen verbinding met server')); };
      xhr.ontimeout = function () { reject(new Error('Server reageert te traag (time-out)')); };
      xhr.send();
    });
  }
  function getJSON(url, t) {
    return httpGet(url, t).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw new Error('Ongeldig antwoord van server'); }
    });
  }
  function arr(v) { return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(function (k) { return v[k]; }) : []); }

  /* ---------- Worker (parsen buiten de UI-thread) ---------- */
  var worker = null, wid = 0, pending = {};
  try {
    worker = new Worker('js/parse.js');
    worker.onmessage = function (e) {
      var p = pending[e.data.id]; if (!p) return;
      delete pending[e.data.id];
      if (e.data.ok) p.resolve(e.data.out); else p.reject(new Error(e.data.err));
    };
    worker.onerror = function () { worker = null; };
  } catch (e) { worker = null; }

  function parse(msg) {
    if (!worker) {
      return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
        return msg.type === 'm3u' ? Parse.m3u(msg.text) : Parse.xt(msg.kind, JSON.parse(msg.text), msg.cats, msg.pre);
      });
    }
    return new Promise(function (resolve, reject) {
      msg.id = ++wid;
      pending[msg.id] = { resolve: resolve, reject: reject };
      worker.postMessage(msg);
    });
  }

  /* ---------- Compacte vorm → objecten ---------- */
  function expand(raw) {
    var i, t, live = [], movies = [], series = [];
    for (i = 0; i < raw.live.length; i++) { t = raw.live[i];
      live.push({ kind: 'live', name: t[0], img: t[1], cat: t[2], url: t[3], id: t[4] }); }
    for (i = 0; i < raw.movies.length; i++) { t = raw.movies[i];
      movies.push({ kind: 'movie', name: t[0], img: t[1], cat: t[2], url: t[3], id: t[4], rating: t[5], added: t[6], year: t[7] }); }
    for (i = 0; i < raw.series.length; i++) { t = raw.series[i];
      series.push({ kind: 'series', name: t[0], img: t[1], cat: t[2], id: t[3], rating: t[4], added: t[5], year: t[6],
        plot: t[7], genre: t[8], backdrop: t[9], eps: t[10] || undefined }); }
    return { live: live, movies: movies, series: series };
  }

  /* ---------- M3U ---------- */
  function loadM3U(url, onProgress) {
    return httpGet(url, 300000, onProgress).then(function (text) {
      if (onProgress) onProgress(-1, 0);
      return parse({ type: 'm3u', text: text });
    });
  }

  /* ---------- Xtream ---------- */
  function Xtream(server, user, pass) {
    server = server.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
    var u = encodeURIComponent(user), p = encodeURIComponent(pass);
    var base = server + '/player_api.php?username=' + u + '&password=' + p;
    var pre = { server: server, u: u, p: p };
    function cats(action) {
      return getJSON(base + '&action=' + action).then(function (c) {
        var m = {}; arr(c).forEach(function (x) { m[x.category_id] = x.category_name; }); return m;
      }).catch(function () { return {}; });
    }
    function list(kind, catAction, action, prog) {
      return Promise.all([cats(catAction), httpGet(base + '&action=' + action, 300000, prog)]).then(function (r) {
        return parse({ type: 'xt', kind: kind, text: r[1], cats: r[0], pre: pre });
      });
    }
    return {
      auth: function () {
        return getJSON(base, 20000).then(function (info) {
          if (!info || !info.user_info || String(info.user_info.auth) !== '1') throw new Error('Login mislukt: controleer gegevens');
          if (info.user_info.status && info.user_info.status !== 'Active') throw new Error('Account: ' + info.user_info.status);
          return info;
        });
      },
      live: function (prog) { return list('live', 'get_live_categories', 'get_live_streams', prog); },
      movies: function (prog) { return list('movie', 'get_vod_categories', 'get_vod_streams', prog); },
      series: function (prog) { return list('series', 'get_series_categories', 'get_series', prog); },
      vodInfo: function (id) { return getJSON(base + '&action=get_vod_info&vod_id=' + id, 15000); },
      seriesInfo: function (id) { return getJSON(base + '&action=get_series_info&series_id=' + id, 30000); },
      episodeUrl: function (ep) {
        return ep.url || (server + '/series/' + u + '/' + p + '/' + ep.id + '.' + (ep.container_extension || 'mp4'));
      }
    };
  }

  /* ---------- Index ---------- */
  function topBy(items, key, n, filter) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], v = it[key] || 0;
      if (filter && !v) continue;
      if (out.length < n) { out.push(it); if (out.length === n) out.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); }); continue; }
      if (v <= (out[n - 1][key] || 0)) continue;
      var j = n - 1;
      while (j > 0 && (out[j - 1][key] || 0) < v) j--;
      out.splice(j, 0, it); out.pop();
    }
    if (out.length < n) out.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
    return out;
  }
  function groupBy(items) {
    var map = {}, order = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!map[it.cat]) { map[it.cat] = []; order.push(it.cat); }
      map[it.cat].push(it);
    }
    return order.map(function (k) { return { name: k, items: map[k] }; });
  }
  function index(db, rowMax) {
    for (var i = 0; i < db.live.length; i++) db.live[i].num = i + 1;
    db.v = {
      liveCats: groupBy(db.live), movieCats: groupBy(db.movies), seriesCats: groupBy(db.series),
      newMovies: topBy(db.movies, 'added', rowMax), topMovies: topBy(db.movies, 'rating', rowMax, true),
      newSeries: topBy(db.series, 'added', rowMax), topSeries: topBy(db.series, 'rating', rowMax, true)
    };
    return db;
  }

  /* ---------- Zoeken (zoekindex pas bij eerste zoekopdracht) ---------- */
  var DIA = /[̀-ͯ]/g;
  function norm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(DIA, '');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function search(list, q, max) {
    var terms = norm(q).split(' ').filter(Boolean);
    if (!terms.length) return [];
    if (!list._indexed) { for (var k = 0; k < list.length; k++) list[k]._s = norm(list[k].name); list._indexed = true; }
    var first = terms[0], hits = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i]._s, ok = true;
      for (var t = 0; t < terms.length; t++) { if (s.indexOf(terms[t]) < 0) { ok = false; break; } }
      if (!ok) continue;
      hits.push({ it: list[i], sc: (s.indexOf(first) === 0 ? 2 : (s.indexOf(' ' + first) > -1 ? 1 : 0)) * 100 + (list[i].rating || 0) });
      if (hits.length > 2000) break;
    }
    hits.sort(function (a, b) { return b.sc - a.sc; });
    return hits.slice(0, max).map(function (h) { return h.it; });
  }

  /* ---------- Afbeeldingen: kleinere TMDB-formaten ---------- */
  function sized(u, w) {
    return u ? String(u).replace(/(image\.tmdb\.org\/t\/p\/)[^/]+\//, '$1' + w + '/') : u;
  }

  /* ---------- Cache (IndexedDB, compacte vorm) ---------- */
  var DBNAME = 'tvplayer', STORE = 'cache2';
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no idb'));
      var r = indexedDB.open(DBNAME, 3);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function cacheGet(key) {
    return idb().then(function (d) {
      return new Promise(function (resolve) {
        var q = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        q.onsuccess = function () { resolve(q.result || null); };
        q.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }
  function cachePut(key, raw) {
    return idb().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ t: Date.now(), live: raw.live, movies: raw.movies, series: raw.series }, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  // Kleine sleutel-waarde-opslag (bijv. gedownloade ondertitels)
  function kvGet(key) {
    return idb().then(function (d) {
      return new Promise(function (resolve) {
        var q = d.transaction('kv', 'readonly').objectStore('kv').get(key);
        q.onsuccess = function () { resolve(q.result || null); };
        q.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }
  function kvPut(key, val) {
    return idb().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  return {
    kvGet: kvGet, kvPut: kvPut,
    loadM3U: loadM3U, Xtream: Xtream, expand: expand, index: index, search: search, sized: sized,
    cacheGet: cacheGet, cachePut: cachePut
  };
})();
