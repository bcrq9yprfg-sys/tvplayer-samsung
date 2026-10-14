/* TVPlayer — schermen, navigatie met afstandsbediening, Netflix-achtige startpagina, zoeken. */
(function () {
  'use strict';

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27, BACKSPACE: 8,
    CH_UP: 427, CH_DOWN: 428, PAGE_UP: 33, PAGE_DOWN: 34,
    PLAY_PAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, REW: 412, FF: 417, CAPTION: 10221
  };
  var STORE = 'tvplayer.source';
  var TABS = ['Home', 'Live TV', 'Films', 'Series', 'Zoeken', 'Favorieten', 'Playlist'];
  var T_HOME = 0, T_LIVE = 1, T_MOVIES = 2, T_SERIES = 3, T_SEARCH = 4, T_FAV = 5, T_PLAYLIST = 6;
  var ROW_MAX = 40, CAT_ROW_MAX = 150, CAT_MAX = 80, SEARCH_MAX = 60;
  var STEP = { poster: 244, live: 344, top: 344 };   // kaartbreedte + tussenruimte

  var $ = function (id) { return document.getElementById(id); };
  var S = {
    screen: 'setup', mode: 'm3u', focusIdx: 0,
    db: null, xt: null, src: null,
    tab: 0, nav: 0, zone: 'rows', rows: [], row: 0, cols: [], rowEls: [],
    query: '', searchTimer: null, heroTimer: null, fav: null, favKind: 'live', bs: {},
    detail: null, dz: 'btns', dBtn: 0, dSeason: 0, dEp: 0, dMore: 0,
    play: null, numBuf: '', numTimer: null, osdTimer: null
  };

  try {
    ['ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
     'MediaRewind', 'MediaFastForward', 'Caption', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ].forEach(function (k) { tizen.tvinputdevice.registerKey(k); });
  } catch (e) { /* browser */ }

  /* ---------- Hulpjes ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtRating(r) { r = parseFloat(r) || 0; return (r > 10 ? r / 10 : r).toFixed(1); }
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    s = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function mb(b) { return (b / 1048576).toFixed(1) + ' MB'; }
  function clamp(i, len) { return Math.max(0, Math.min(i, len - 1)); }
  function show(name) {
    ['setup', 'home', 'detail', 'player'].forEach(function (s) { $(s).classList.toggle('hidden', s !== name); });
    S.screen = name;
  }
  function loading(on, text) {
    $('loading').classList.toggle('hidden', !on);
    if (text) $('loading-text').textContent = text;
  }
  var toastTimer;
  function toast(t) {
    $('toast').textContent = t; $('toast').classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').classList.add('hidden'); }, 4000);
  }
  function setBg(el, url, mode) {
    var key = (url || '') + '|' + mode;
    if (el._key === key) return;
    el._key = key;
    el.style.backgroundImage = url ? 'url("' + String(url).replace(/"/g, '%22') + '")' : 'none';
    el.classList.toggle('contain', mode === 'contain');
    el.classList.toggle('logo', mode === 'logo');
  }
  function bgMode(it) { return it.kind === 'live' ? 'logo' : (it.backdrop ? 'cover' : 'contain'); }
  function save(src) { try { localStorage.setItem(STORE, JSON.stringify(src)); } catch (e) {} }
  function loadSaved() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function srcKey(src) { return src.mode === 'xtream' ? 'x|' + src.server + '|' + src.user : 'm|' + src.url; }
  function exitApp() { try { tizen.application.getCurrentApplication().exit(); } catch (e) {} }

  function tick() {
    var d = new Date();
    $('clock').textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  tick(); setInterval(tick, 20000);

  /* ======================================================
     LADEN: cache eerst; alleen verversen als cache oud is
     ====================================================== */
  var STALE = 12 * 3600 * 1000;
  function useRaw(raw, src) {
    var db = Sources.expand(raw);
    Sources.index(db, ROW_MAX);
    S.db = db; S.src = src;
    S.xt = src.mode === 'xtream' ? Sources.Xtream(src.server, src.user, src.pass) : null;
  }

  function openSource(src, force) {
    msg('');
    loading(true, 'Laden…');
    if (force) { fetchFresh(src, false); return; }
    Sources.cacheGet(srcKey(src)).then(function (c) {
      if (c && (c.live.length || c.movies.length || c.series.length)) {
        useRaw(c, src);
        loading(false); enterHome();
        if (Date.now() - (c.t || 0) > STALE) setTimeout(function () { fetchFresh(src, true); }, 4000);
      } else fetchFresh(src, false);
    });
  }

  function fetchFresh(src, silent) {
    function fail(e) {
      if (silent) { toast('Verversen mislukt: ' + (e && e.message || 'fout')); return; }
      loading(false); show('setup');
      msg(e && e.message || 'Laden mislukt'); setupFocus(S.focusIdx);
    }
    function apply(raw) {
      save(src);
      Sources.cachePut(srcKey(src), raw);
      useRaw(raw, src);
      if (silent) { if (S.screen === 'home') renderHome(false); }
      else { loading(false); enterHome(); }
    }

    if (src.mode !== 'xtream') {
      Sources.loadM3U(src.url, function (l, t) {
        if (silent) return;
        loading(true, l < 0 ? 'Verwerken…' : 'Playlist downloaden… ' + mb(l) + (t ? ' / ' + mb(t) : ''));
      }).then(apply).catch(fail);
      return;
    }

    var xt = Sources.Xtream(src.server, src.user, src.pass);
    xt.auth().then(function () {
      var raw = { live: [], movies: [], series: [] }, got = { l: 0, m: 0, s: 0 };
      function status() {
        if (!silent) loading(true, 'Laden…  zenders ' + mb(got.l) + '  ·  films ' + mb(got.m) + '  ·  series ' + mb(got.s));
      }
      status();
      function part(fn, key, k, label) {
        return fn(function (l) { got[k] = l; status(); })
          .then(function (list) { raw[key] = list; })
          .catch(function () { if (!silent) toast(label + ' laden mislukt'); });
      }
      Promise.all([part(xt.live, 'live', 'l', 'Zenders'), part(xt.movies, 'movies', 'm', 'Films'), part(xt.series, 'series', 's', 'Series')])
        .then(function () {
          if (!raw.live.length && !raw.movies.length && !raw.series.length) return fail(new Error('Geen inhoud gevonden'));
          apply(raw);
        });
    }).catch(fail);
  }

  /* ======================================================
     SETUP
     ====================================================== */
  function setupFocusables() {
    return Array.prototype.filter.call(document.querySelectorAll('#setup .focusable'), function (el) {
      return el.offsetParent !== null;
    });
  }
  function setupFocus(i) {
    var els = setupFocusables();
    S.focusIdx = clamp(i, els.length);
    els.forEach(function (el, j) { el.classList.toggle('focused', j === S.focusIdx); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function setMode(mode) {
    S.mode = mode;
    document.querySelectorAll('#setup .tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-mode') === mode);
    });
    $('form-m3u').classList.toggle('hidden', mode !== 'm3u');
    $('form-xtream').classList.toggle('hidden', mode !== 'xtream');
  }
  function msg(text, ok) { $('setup-msg').textContent = text; $('setup-msg').classList.toggle('ok', !!ok); }
  function prefill(src) {
    if (!src) return;
    setMode(src.mode);
    if (src.mode === 'xtream') {
      $('xt-server').value = src.server || ''; $('xt-user').value = src.user || ''; $('xt-pass').value = src.pass || '';
    } else $('m3u-url').value = src.url || '';
  }
  function submit() {
    var src = S.mode === 'xtream'
      ? { mode: 'xtream', server: $('xt-server').value.trim(), user: $('xt-user').value.trim(), pass: $('xt-pass').value.trim() }
      : { mode: 'm3u', url: $('m3u-url').value.trim() };
    if (src.mode === 'm3u') {
      if (src.url && !/^https?:\/\//i.test(src.url)) src.url = 'http://' + src.url;
      if (!/^https?:\/\/.+/i.test(src.url)) return msg('Vul een geldige URL in');
    }
    if (src.mode === 'xtream' && (!src.server || !src.user || !src.pass)) return msg('Vul alle velden in');
    openSource(src, true);
  }
  function setupKey(code) {
    var els = setupFocusables(), el = els[S.focusIdx];
    var editing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (editing) {
      if (code === KEY.ENTER || code === KEY.BACK || code === KEY.ESC) {
        document.activeElement.blur();
        setupFocus(S.focusIdx + (code === KEY.ENTER ? 1 : 0));
        return true;
      }
      return false;
    }
    var onTab = el && el.classList.contains('tab');
    switch (code) {
      case KEY.UP: setupFocus(onTab ? S.focusIdx : (els[S.focusIdx - 1] && els[S.focusIdx - 1].classList.contains('tab') ? 0 : S.focusIdx - 1)); break;
      case KEY.DOWN: setupFocus(onTab ? 2 : S.focusIdx + 1); break;
      case KEY.LEFT: if (onTab) setupFocus(S.focusIdx - 1); break;
      case KEY.RIGHT: if (onTab) setupFocus(Math.min(S.focusIdx + 1, 1)); break;
      case KEY.ENTER:
        if (!el) break;
        if (onTab) { setMode(el.getAttribute('data-mode')); setupFocus(S.focusIdx); }
        else if (el.tagName === 'INPUT') el.focus();
        else if (el.id === 'btn-load') submit();
        break;
      case KEY.BACK:
        if (S.db) { show('home'); updateFocus(); } else exitApp();
        break;
      default: return false;
    }
    return true;
  }

  /* ======================================================
     HOME, MAPPEN, FAVORIETEN
     ====================================================== */
  var KINDS = { 1: 'live', 2: 'movie', 3: 'series' };
  var KIND_LABEL = { live: 'Live TV', movie: 'Films', series: 'Series' };
  var GRID_COLS = { live: 5, movie: 7, series: 7 };
  var GRID_ROW_H = { live: 232, movie: 358, series: 358 };
  var LIST_ROWS = 10;

  function isGif(u) { return /\.gif(\?|#|$)/i.test(u || ''); }
  function imgOk(u) { return !!u && !isGif(u); }

  /* ---------- Favorieten & kijkgeschiedenis ---------- */
  function favKey() { return 'tvplayer.fav.' + (S.src ? srcKey(S.src) : ''); }
  function loadFav() {
    try { S.fav = JSON.parse(localStorage.getItem(favKey())) || null; } catch (e) { S.fav = null; }
  }
  function saveFav() { try { localStorage.setItem(favKey(), JSON.stringify(S.fav)); } catch (e) {} }
  function favList(kind) { return (S.fav && S.fav[kind]) || []; }
  function isFav(kind, cat) { return favList(kind).indexOf(cat) > -1; }
  function toggleFav(kind, cat) {
    if (!S.fav) S.fav = { live: [], movie: [], series: [] };
    var l = S.fav[kind] = S.fav[kind] || [], i = l.indexOf(cat);
    if (i > -1) l.splice(i, 1); else l.push(cat);
    saveFav();
  }

  var HIST = 'tvplayer.hist';
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST)) || []; } catch (e) { return []; } }
  function recordWatch(it) {
    if (!it) return;
    var h = loadHist(), k = it.kind + '|' + (it.id || it.url || it.name), e = null;
    for (var i = 0; i < h.length; i++) if (h[i].k === k) { e = h.splice(i, 1)[0]; break; }
    e = e || { k: k, kind: it.kind, id: it.id, name: it.name, img: it.img, cat: it.cat, url: it.url, n: 0 };
    e.n++; e.t = Date.now();
    h.unshift(e);
    try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, 80))); } catch (x) {}
  }
  function histItems(sortKey, n) {
    var h = loadHist().slice().sort(function (a, b) { return b[sortKey] - a[sortKey]; }).slice(0, n);
    var d = S.db;
    return h.map(function (e) {
      var pool = e.kind === 'live' ? d.live : e.kind === 'movie' ? d.movies : d.series;
      for (var i = 0; i < pool.length; i++) {
        var x = pool[i];
        if ((e.id != null && x.id === e.id) || (e.url && x.url === e.url)) return x;
      }
      return null;
    }).filter(Boolean);
  }

  function catsOf(kind) {
    var v = S.db.v;
    return kind === 'live' ? v.liveCats : kind === 'movie' ? v.movieCats : v.seriesCats;
  }

  /* ---------- Home-rijen ---------- */
  function buildRows() {
    var d = S.db, v = d.v, r = [];
    function add(title, items) { if (items && items.length) r.push({ title: title, items: items }); }
    if (S.tab === T_SEARCH) {
      if (S.query) {
        add('Films', Sources.search(d.movies, S.query, SEARCH_MAX));
        add('Series', Sources.search(d.series, S.query, SEARCH_MAX));
        add('Live TV', Sources.search(d.live, S.query, SEARCH_MAX));
      }
      return r;
    }
    var recent = histItems('t', 20), most = histItems('n', 20);
    add('Verder kijken', recent.filter(function (x) { return x.kind !== 'live'; }));
    var mostLive = most.filter(function (x) { return x.kind === 'live'; });
    add('Meest bekeken · Live TV', mostLive);
    ['live', 'movie', 'series'].forEach(function (kind) {
      catsOf(kind).forEach(function (g) {
        if (isFav(kind, g.name)) add(g.name, g.items.slice(0, ROW_MAX));
      });
    });
    if (v.topMovies.length >= 5) r.push({ title: 'Top 10 · Films', items: v.topMovies.slice(0, 10), top: true });
    if (v.topSeries.length >= 5) r.push({ title: 'Top 10 · Series', items: v.topSeries.slice(0, 10), top: true });
    if (r.length < 3) {
      add('Live TV', d.live.slice(0, ROW_MAX));
      add('Nieuw · Films', v.newMovies);
      add('Nieuw · Series', v.newSeries);
    }
    return r;
  }

  function cardHtml(it, rank) {
    var img = imgOk(it.img) ? '<img data-src="' + esc(it.kind === 'live' ? it.img : Sources.sized(it.img, 'w342')) + '" alt="">' : '';
    if (it.kind === 'live') {
      return '<div class="card live-card">' + img + '<div class="cname">' + (it.num ? '<b>' + it.num + '</b>' : '') + esc(it.name) +
        '</div><span class="badge">LIVE</span></div>';
    }
    var card = '<div class="card poster"><div class="ph">' + esc(it.name) + '</div>' + img +
      (it.rating ? '<span class="rating">★ ' + fmtRating(it.rating) + '</span>' : '') +
      '<div class="cap">' + esc(it.name) + '</div></div>';
    if (rank) return '<div class="card topcard"><span class="rank">' + rank + '</span>' + card.replace('class="card poster"', 'class="poster"') + '</div>';
    return card;
  }
  function showImgs(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-src]'), function (img) {
      img.src = img.getAttribute('data-src'); img.removeAttribute('data-src');
    });
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.id === 'd-poster' || t.id === 'hero-poster') t.style.visibility = 'hidden';
    else if (t.parentNode) t.parentNode.removeChild(t);
  }, true);

  function renderNav() {
    $('nav').innerHTML = TABS.map(function (t) { return '<div class="tab">' + esc(t) + '</div>'; }).join('');
  }
  function navFocus() {
    Array.prototype.forEach.call(document.querySelectorAll('#nav .tab'), function (t, i) {
      t.classList.toggle('active', i === S.tab);
      t.classList.toggle('focused', S.zone === 'nav' && i === S.nav);
    });
  }

  function renderHome(reset) {
    var browsing = !!KINDS[S.tab] || S.tab === T_FAV;
    $('home').classList.toggle('browsing', browsing);
    $('home').classList.toggle('searching', S.tab === T_SEARCH);
    if (browsing) { renderBrowse(); return; }
    S.rows = buildRows();
    if (reset) { S.row = 0; S.cols = S.rows.map(function () { return 0; }); }
    else {
      S.row = clamp(S.row, Math.max(1, S.rows.length));
      S.cols = S.rows.map(function (r, i) { return clamp(S.cols[i] || 0, r.items.length); });
    }
    var html = '';
    S.rows.forEach(function (row) {
      var live = row.items[0] && row.items[0].kind === 'live';
      html += '<section class="row ' + (live ? 'live-row' : row.top ? 'poster-row top-row' : 'poster-row') + '"><h3>' + esc(row.title) +
        '<span class="count">' + row.items.length + '</span></h3><div class="track"></div></section>';
    });
    if (!S.rows.length) {
      html = '<div class="empty">' + (S.tab === T_SEARCH ? (S.query ? 'Niets gevonden voor “' + esc(S.query) + '”' : 'Druk OK om te typen') :
        'Nog niets hier. Kies favorieten bij Favorieten.') + '</div>';
      if (S.zone === 'rows') S.zone = S.tab === T_SEARCH ? 'search' : 'nav';
    }
    $('rows').innerHTML = html;
    S.rowEls = Array.prototype.map.call($('rows').querySelectorAll('.row'), function (el, i) {
      return { el: el, track: el.querySelector('.track'), cards: null, f: null,
        step: el.classList.contains('live-row') ? STEP.live : el.classList.contains('top-row') ? STEP.top : STEP.poster, ri: i };
    });
    updateFocus();
  }

  function buildRow(re) {
    if (re.cards) return;
    var row = S.rows[re.ri];
    re.track.innerHTML = row.items.map(function (it, i) { return cardHtml(it, row.top ? i + 1 : 0); }).join('');
    re.cards = re.track.children;
  }
  function loadImgs(re, col) {
    var cards = re.cards, from = Math.max(0, col - 1), to = Math.min(cards.length, col + 8);
    for (var i = from; i < to; i++) {
      var img = cards[i].querySelector('img[data-src]');
      if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
    }
  }

  function enterHome() {
    loadFav();
    S.tab = T_HOME; S.nav = T_HOME; S.zone = 'rows';
    show('home');
    if (!S.fav) { selectTab(T_FAV); toast('Kies je favoriete mappen: OK = aan/uit. Daarna naar Home.'); return; }
    renderHome(true);
  }
  function refreshHome() { if (S.db && (S.screen === 'home' || S.screen === 'detail' || S.screen === 'player')) renderHome(false); }

  function updateFocus() {
    navFocus();
    if (KINDS[S.tab] || S.tab === T_FAV) { browseFocus(); return; }
    $('q-wrap').classList.toggle('focused', S.zone === 'search');
    S.rowEls.forEach(function (re, ri) {
      var near = ri >= S.row - 1 && ri <= S.row + 2;
      re.el.classList.toggle('current', ri === S.row);
      if (!near) return;
      buildRow(re);
      var col = S.cols[ri] || 0, cards = re.cards;
      if (re.f != null && cards[re.f]) cards[re.f].classList.remove('focused');
      re.f = null;
      if (S.zone === 'rows' && ri === S.row && cards[col]) { cards[col].classList.add('focused'); re.f = col; }
      re.track.style.transform = 'translateX(' + (-Math.max(0, col - 1) * re.step) + 'px)';
      loadImgs(re, col);
    });
    var cur = S.rowEls[S.row];
    $('rows').style.transform = 'translateY(' + (cur ? -cur.el.offsetTop : 0) + 'px)';
    scheduleHero();
  }

  /* ---------- Hero ---------- */
  function focusedItem() {
    var r = S.rows[S.row];
    return r ? r.items[S.cols[S.row] || 0] : null;
  }
  function metaHtml(it) {
    var m = [];
    if (it.kind === 'live') {
      m.push('<span class="live-dot">● LIVE</span>');
      if (it.cat) m.push(esc(it.cat));
      if (it.num) m.push('Kanaal ' + it.num);
    } else {
      m.push('<span class="kind">' + (it.kind === 'series' ? 'SERIE' : 'FILM') + '</span>');
      if (it.year) m.push(esc(it.year));
      if (it.rating) m.push('<span class="star">★ ' + fmtRating(it.rating) + '</span>');
      if (it.genre) m.push(esc(it.genre)); else if (it.cat) m.push(esc(it.cat));
      if (it.duration) m.push(esc(it.duration));
    }
    return m.join('<i>·</i>');
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  }
  function setHero(it) {
    var art = $('hero-art'), pi = $('hero-poster');
    if (!it) {
      $('hero-meta').innerHTML = ''; $('hero-title').textContent = greeting(); $('hero-plot').textContent = 'Wat wil je kijken?';
      $('hero-hint').innerHTML = ''; art.className = ''; setBg($('hero-bg'), '', 'cover'); return;
    }
    $('hero-meta').innerHTML = metaHtml(it);
    $('hero-title').textContent = it.name;
    $('hero-plot').textContent = it.plot || (it.kind === 'live' ? 'Nu live op ' + (it.cat || 'tv') : '');
    $('hero-hint').innerHTML = '<span class="pill primary">▶  OK om te ' + (it.kind === 'live' ? 'kijken' : 'openen') + '</span>' +
      (it.kind === 'series' ? '<span class="pill">Seizoenen &amp; afleveringen</span>' : '') +
      (it.kind === 'live' && it.num ? '<span class="pill">Kanaal ' + it.num + '</span>' : '');
    var hasBd = imgOk(it.backdrop);
    setBg($('hero-bg'), hasBd ? Sources.sized(it.backdrop, 'w1280') : '', 'cover');
    var showArt = !hasBd && imgOk(it.img);
    art.className = showArt ? (it.kind === 'live' ? 'logo' : 'poster') : '';
    var pu = it.kind === 'live' ? it.img : Sources.sized(it.img, 'w500');
    if (showArt && pi.getAttribute('src') !== pu) { pi.style.visibility = 'visible'; pi.src = pu; }
  }
  function scheduleHero() {
    clearTimeout(S.heroTimer);
    var it = S.zone === 'rows' ? focusedItem() : null;
    // Hero pas bijwerken als je even stilstaat: scheelt veel werk bij snel scrollen
    S.heroTimer = setTimeout(function () {
      if (S.screen !== 'home' || focusedItem() !== it) return;
      setHero(it);
      if (it && it.kind === 'movie' && S.xt && !it._info) {
        S.heroTimer = setTimeout(function () {
          enrichMovie(it).then(function () { if (S.screen === 'home' && focusedItem() === it) setHero(it); });
        }, 500);
      }
    }, 180);
  }
  function enrichMovie(it) {
    if (it._info || !S.xt) return Promise.resolve(it._info || {});
    return S.xt.vodInfo(it.id).then(function (r) {
      var i = (r && r.info) || {};
      it._info = i;
      it.plot = it.plot || i.plot || i.description || '';
      it.genre = it.genre || i.genre || '';
      it.year = it.year || String(i.releasedate || i.release_date || '').slice(0, 4);
      it.duration = it.duration || i.duration || '';
      it.backdrop = it.backdrop || (Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : (i.backdrop_path || '')) || '';
      it.cast = i.cast || i.actors || ''; it.director = i.director || '';
      it.tmdb = it.tmdb || i.tmdb_id || i.tmdb || '';
      if (!it.rating && i.rating) it.rating = parseFloat(i.rating) || 0;
      return i;
    }).catch(function () { it._info = {}; return {}; });
  }

  /* ---------- Mappenlijst en raster ---------- */
  function bKind() { return S.tab === T_FAV ? S.favKind : KINDS[S.tab]; }
  function bState() {
    var k = (S.tab === T_FAV ? 'fav-' : '') + bKind();
    return S.bs[k] = S.bs[k] || { mode: 'list', idx: 0, cat: null, item: 0 };
  }

  function renderBrowse() {
    var kind = bKind(), st = bState(), cats = catsOf(kind), fav = S.tab === T_FAV;
    $('b-seg').innerHTML = fav ? ['live', 'movie', 'series'].map(function (k) {
      return '<div class="seg' + (k === kind ? ' active' : '') + '">' + KIND_LABEL[k] + '</div>';
    }).join('') : '';
    if (fav) {
      $('b-title').textContent = '';
      $('b-sub').textContent = 'OK = favoriet aan/uit · ' + favList(kind).length + ' gekozen';
      st.mode = 'list';
    } else if (st.mode === 'list') {
      $('b-title').textContent = KIND_LABEL[kind];
      $('b-sub').textContent = cats.length + ' mappen';
    } else {
      $('b-title').textContent = st.cat.name;
      $('b-sub').textContent = st.cat.items.length + ' titels · Terug = mappen';
    }
    $('b-list').style.display = st.mode === 'list' ? 'block' : 'none';
    $('b-grid').style.display = st.mode === 'grid' ? 'block' : 'none';
    if (S.zone === 'rows') S.zone = st.mode;
    browseFocus();
  }

  function browseFocus() {
    var kind = bKind(), st = bState(), fav = S.tab === T_FAV;
    Array.prototype.forEach.call($('b-seg').children, function (c, i) {
      c.classList.toggle('focused', S.zone === 'seg' && ['live', 'movie', 'series'][i] === kind);
    });
    if (st.mode === 'list') {
      var cats = catsOf(kind);
      st.idx = clamp(st.idx, cats.length || 1);
      var start = Math.max(0, Math.min(st.idx - 4, cats.length - LIST_ROWS));
      var html = '';
      for (var i = start; i < Math.min(cats.length, start + LIST_ROWS); i++) {
        var g = cats[i], on = isFav(kind, g.name);
        html += '<div class="fold' + (i === st.idx && S.zone === 'list' ? ' focused' : '') + (on ? ' on' : '') + '">' +
          '<span class="fi">' + (fav ? (on ? '☑' : '☐') : '▸') + '</span>' +
          '<span class="fn">' + esc(g.name) + '</span><span class="fc">' + g.items.length + '</span>' +
          '<span class="fs">' + (!fav && on ? '★' : '') + '</span></div>';
      }
      $('b-list').innerHTML = cats.length ? html + '<div class="b-pos">' + (st.idx + 1) + ' / ' + cats.length + '</div>'
        : '<div class="empty-b">Geen mappen</div>';
      return;
    }
    // raster: alleen zichtbare rijen tekenen; bij links/rechts alleen focus verplaatsen
    var items = st.cat.items, cols = GRID_COLS[kind];
    st.item = clamp(st.item, items.length || 1);
    var fr = Math.floor(st.item / cols), first = Math.max(0, fr - 1), grid = $('b-grid');
    if (grid._cat !== st.cat || grid._first !== first || !grid.firstChild) {
      var out = '';
      for (var r = first; r < first + 3; r++) {
        var a = r * cols;
        if (a >= items.length) break;
        out += '<div class="grow">';
        for (var c = a; c < Math.min(items.length, a + cols); c++) out += cardHtml(items[c]);
        out += '</div>';
      }
      grid.innerHTML = out + '<div class="b-pos"></div>';
      showImgs(grid);
      grid._cat = st.cat; grid._first = first;
      grid._cards = grid.querySelectorAll('.card');
    }
    var gc = grid._cards;
    for (var q = 0; q < gc.length; q++) gc[q].classList.toggle('focused', S.zone === 'grid' && q === st.item - first * cols);
    grid.lastChild.textContent = (st.item + 1) + ' / ' + items.length;
  }

  function browseKey(code) {
    var kind = bKind(), st = bState(), fav = S.tab === T_FAV, cats = catsOf(kind);
    if (S.zone === 'seg') {
      var ks = ['live', 'movie', 'series'], ki = ks.indexOf(kind);
      switch (code) {
        case KEY.LEFT: S.favKind = ks[Math.max(0, ki - 1)]; renderBrowse(); return true;
        case KEY.RIGHT: S.favKind = ks[Math.min(2, ki + 1)]; renderBrowse(); return true;
        case KEY.DOWN: S.zone = 'list'; break;
        case KEY.UP: case KEY.BACK: S.zone = 'nav'; S.nav = S.tab; break;
        default: return false;
      }
      updateFocus(); return true;
    }
    if (st.mode === 'list') {
      switch (code) {
        case KEY.UP: if (st.idx === 0) { S.zone = fav ? 'seg' : 'nav'; S.nav = S.tab; } else st.idx--; break;
        case KEY.DOWN: st.idx = Math.min(cats.length - 1, st.idx + 1); break;
        case KEY.CH_UP: case KEY.PAGE_UP: case KEY.LEFT: st.idx = Math.max(0, st.idx - LIST_ROWS); break;
        case KEY.CH_DOWN: case KEY.PAGE_DOWN: case KEY.RIGHT: st.idx = Math.min(cats.length - 1, st.idx + LIST_ROWS); break;
        case KEY.ENTER:
          var g = cats[st.idx];
          if (!g) break;
          if (fav) { toggleFav(kind, g.name); renderBrowse(); return true; }
          st.cat = g; st.mode = 'grid'; st.item = 0; S.zone = 'grid'; renderBrowse(); return true;
        case KEY.BACK: S.zone = 'nav'; S.nav = S.tab; break;
        default: return false;
      }
      updateFocus(); return true;
    }
    var items = st.cat.items, cols = GRID_COLS[kind], i = st.item;
    switch (code) {
      case KEY.LEFT: if (i % cols > 0) st.item--; break;
      case KEY.RIGHT: if (i % cols < cols - 1 && i + 1 < items.length) st.item++; break;
      case KEY.UP: if (i >= cols) st.item -= cols; else { S.zone = 'nav'; S.nav = S.tab; } break;
      case KEY.DOWN: if (i + cols < items.length) st.item += cols; else if (Math.floor(i / cols) < Math.floor((items.length - 1) / cols)) st.item = items.length - 1; break;
      case KEY.CH_UP: case KEY.PAGE_UP: st.item = Math.max(i % cols, i - cols * 3); break;
      case KEY.CH_DOWN: case KEY.PAGE_DOWN: st.item = Math.min(items.length - 1, i + cols * 3); break;
      case KEY.ENTER: openItem(items[i], { items: items }); return true;
      case KEY.BACK: st.mode = 'list'; S.zone = 'list'; renderBrowse(); return true;
      default: return false;
    }
    updateFocus(); return true;
  }

  /* ---------- Zoeken ---------- */
  var qInput = $('q');
  qInput.addEventListener('input', function () {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(runSearch, 350);
  });
  function runSearch() {
    var q = qInput.value.trim();
    if (q === S.query) return;
    S.query = q;
    var z = S.zone;
    renderHome(true);
    S.zone = z === 'rows' ? 'search' : z;
    updateFocus();
  }
  function searchKey(code) {
    if (document.activeElement === qInput) {
      if (code === KEY.ENTER || code === KEY.BACK || code === KEY.ESC || code === KEY.DOWN) {
        qInput.blur(); runSearch();
        if ((code === KEY.ENTER || code === KEY.DOWN) && S.rows.length) S.zone = 'rows';
        updateFocus(); return true;
      }
      return false;
    }
    switch (code) {
      case KEY.ENTER: qInput.focus(); return true;
      case KEY.DOWN: if (S.rows.length) S.zone = 'rows'; break;
      case KEY.UP: case KEY.BACK: S.zone = 'nav'; S.nav = S.tab; break;
      default: return false;
    }
    updateFocus(); return true;
  }

  function selectTab(i) {
    if (i === T_PLAYLIST) { show('setup'); prefill(loadSaved()); setupFocus(0); return; }
    S.tab = i; S.nav = i;
    if (i === T_HOME) $('toast').classList.add('hidden');
    if (i === T_SEARCH) S.zone = 'search';
    else if (i === T_FAV) S.zone = 'list';
    else if (KINDS[i]) S.zone = bState().mode;
    else S.zone = 'rows';
    renderHome(true);
    if (i === T_SEARCH && !S.query) qInput.focus();
  }

  function homeKey(code) {
    if (S.zone === 'nav') {
      switch (code) {
        case KEY.LEFT: S.nav = Math.max(0, S.nav - 1); break;
        case KEY.RIGHT: S.nav = Math.min(TABS.length - 1, S.nav + 1); break;
        case KEY.DOWN:
          if (S.tab === T_SEARCH) S.zone = 'search';
          else if (S.tab === T_FAV) S.zone = 'seg';
          else if (KINDS[S.tab]) S.zone = bState().mode;
          else if (S.rows.length) S.zone = 'rows';
          break;
        case KEY.ENTER: selectTab(S.nav); return true;
        case KEY.BACK: if (S.tab !== T_HOME) selectTab(T_HOME); else exitApp(); return true;
        default: return false;
      }
      updateFocus(); return true;
    }
    if (KINDS[S.tab] || S.tab === T_FAV) return browseKey(code);
    if (S.zone === 'search') return searchKey(code);
    var row = S.rows[S.row];
    if (!row) { if (code === KEY.UP || code === KEY.BACK) { S.zone = 'nav'; updateFocus(); return true; } return false; }
    var c = S.cols[S.row] || 0;
    switch (code) {
      case KEY.LEFT: S.cols[S.row] = Math.max(0, c - 1); break;
      case KEY.RIGHT: S.cols[S.row] = Math.min(row.items.length - 1, c + 1); break;
      case KEY.CH_UP: case KEY.PAGE_UP: S.cols[S.row] = Math.max(0, c - 6); break;
      case KEY.CH_DOWN: case KEY.PAGE_DOWN: S.cols[S.row] = Math.min(row.items.length - 1, c + 6); break;
      case KEY.UP:
        if (S.row === 0) { if (S.tab === T_SEARCH) S.zone = 'search'; else { S.zone = 'nav'; S.nav = S.tab; } }
        else S.row--;
        break;
      case KEY.DOWN: S.row = Math.min(S.rows.length - 1, S.row + 1); break;
      case KEY.ENTER: openItem(row.items[c], row); return true;
      case KEY.BACK:
        if (S.row > 0 || c > 0) { S.row = 0; S.cols[0] = 0; }
        else if (S.tab === T_SEARCH) S.zone = 'search';
        else { S.zone = 'nav'; S.nav = S.tab; }
        break;
      default: return false;
    }
    updateFocus(); return true;
  }

  function openItem(it, row) {
    if (!it) return;
    if (it.kind === 'live') {
      var g = catsOf('live').filter(function (x) { return x.name === it.cat; })[0];
      var list = (g && g.items) || row.items;
      recordWatch(it);
      playLive(list, Math.max(0, list.indexOf(it)));
    } else openDetail(it);
  }
  /* ======================================================
     DETAIL
     ====================================================== */
  function openDetail(it) {
    var pool = it.kind === 'series' ? S.db.series : S.db.movies, more = [];
    for (var i = 0; i < pool.length && more.length < 24; i++) if (pool[i] !== it && pool[i].cat === it.cat) more.push(pool[i]);
    S.detail = { it: it, seasons: [], eps: {}, btns: [], loading: false, more: more };
    S.dz = 'btns'; S.dBtn = 0; S.dSeason = 0; S.dEp = 0; S.dMore = 0;
    show('detail');
    if (it.eps) setEpisodes(it.eps);
    renderDetail();
    if (S.xt && it.kind === 'movie') {
      enrichMovie(it).then(function () { if (S.detail && S.detail.it === it) renderDetail(); });
    }
    if (S.xt && it.kind === 'series' && !it.eps) {
      S.detail.loading = true; renderDetail();
      S.xt.seriesInfo(it.id).then(function (r) {
        if (!S.detail || S.detail.it !== it) return;
        var info = (r && r.info) || {};
        it.plot = it.plot || info.plot || '';
        it.genre = it.genre || info.genre || '';
        it.cast = info.cast || ''; it.director = info.director || '';
        it.tmdb = it.tmdb || info.tmdb || info.tmdb_id || '';
        if (!it.backdrop && Array.isArray(info.backdrop_path)) it.backdrop = info.backdrop_path[0] || '';
        var eps = (r && r.episodes) || {};
        if (Array.isArray(eps)) { var o = {}; eps.forEach(function (list, i) { o[String(i + 1)] = list; }); eps = o; }
        setEpisodes(eps);
        S.detail.loading = false;
        renderDetail();
      }).catch(function () {
        if (S.detail && S.detail.it === it) { S.detail.loading = false; S.detail.error = true; renderDetail(); }
      });
    }
  }
  function setEpisodes(eps) {
    S.detail.eps = eps;
    S.detail.seasons = Object.keys(eps).filter(function (k) { return eps[k] && eps[k].length; })
      .sort(function (a, b) { return a - b; });
  }
  function curEps() { var d = S.detail; return (d && d.eps[d.seasons[S.dSeason]]) || []; }

  function renderDetail() {
    var d = S.detail, it = d.it;
    var bu = it.backdrop ? Sources.sized(it.backdrop, 'w1280') : Sources.sized(it.img, 'w500');
    setBg($('d-bg'), imgOk(bu) ? bu : '', bgMode(it));
    $('d-poster').src = imgOk(it.img) ? Sources.sized(it.img, 'w500') : '';
    $('d-poster').style.visibility = imgOk(it.img) ? 'visible' : 'hidden';
    $('d-meta').innerHTML = metaHtml(it);
    $('d-title').textContent = it.name;
    $('d-plot').textContent = it.plot || '';
    var ex = '';
    if (it.director) ex += '<div><b>Regie:</b> ' + esc(it.director) + '</div>';
    if (it.cast) ex += '<div><b>Cast:</b> ' + esc(it.cast) + '</div>';
    $('d-extra').innerHTML = ex;

    d.btns = [];
    if (it.kind === 'series') {
      var ep = curEps()[S.dEp];
      if (ep) d.btns.push({ label: '▶  Afspelen  S' + d.seasons[S.dSeason] + ' · A' + (ep.episode_num || S.dEp + 1), act: 'ep' });
    } else d.btns.push({ label: '▶  Afspelen', act: 'play' });
    d.btns.push({ label: 'Ondertitels: ' + subLabel(getSubPref(prefKeyOf(it))), act: 'subs' });
    d.btns.push({ label: 'Terug', act: 'back' });
    S.dBtn = clamp(S.dBtn, d.btns.length);
    $('d-btns').innerHTML = d.btns.map(function (b) {
      return '<div class="btn' + (b.act !== 'back' ? ' primary' : '') + '">' + esc(b.label) + '</div>';
    }).join('');

    $('d-status').textContent = d.loading ? 'Afleveringen laden…' : d.error ? 'Afleveringen laden mislukt' :
      (it.kind === 'series' && !d.seasons.length ? 'Geen afleveringen gevonden' : '');

    $('d-seasons').innerHTML = d.seasons.length > 1 ? d.seasons.map(function (s) {
      return '<div class="chip">Seizoen ' + esc(s) + '</div>';
    }).join('') : '';
    renderEps();
    detailFocus();
  }

  function renderEps() {
    var eps = curEps(), d = S.detail;
    if (!eps.length) {
      $('d-eps').innerHTML = d.more.length && !d.loading
        ? '<h3>Meer zoals dit</h3><div class="track" id="d-more">' + d.more.map(cardHtml).join('') + '</div>' : '';
      if ($('d-more')) showImgs($('d-more'));
      return;
    }
    $('d-eps').innerHTML = (d.seasons.length === 1 ? '<h3>Seizoen ' + esc(d.seasons[0]) + '</h3>' : '') +
      '<div class="track" id="d-track">' + eps.map(function (e, i) {
      var inf = e.info || {};
      var img = imgOk(inf.movie_image) ? '<img src="' + esc(Sources.sized(inf.movie_image, 'w300')) + '" alt="">' : '';
      return '<div class="card ep"><div class="ep-img">' + img + '<span class="ep-n">' + esc(e.episode_num || i + 1) + '</span></div>' +
        '<div class="ep-t">' + esc(e.title || ('Aflevering ' + (e.episode_num || i + 1))) + '</div>' +
        (inf.duration ? '<div class="ep-d">' + esc(inf.duration) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function detailZones() {
    var z = ['btns'];
    if (S.detail.seasons.length > 1) z.push('seasons');
    if (curEps().length) z.push('eps');
    else if (S.detail.more.length && !S.detail.loading) z.push('more');
    return z;
  }

  function detailFocus() {
    Array.prototype.forEach.call($('d-btns').children, function (b, i) {
      b.classList.toggle('focused', S.dz === 'btns' && i === S.dBtn);
    });
    Array.prototype.forEach.call($('d-seasons').children, function (c, i) {
      c.classList.toggle('active', i === S.dSeason);
      c.classList.toggle('focused', S.dz === 'seasons' && i === S.dSeason);
    });
    var tr = $('d-track');
    if (tr) {
      Array.prototype.forEach.call(tr.children, function (c, i) { c.classList.toggle('focused', S.dz === 'eps' && i === S.dEp); });
      tr.style.transform = 'translateX(' + (-Math.max(0, S.dEp - 1) * 384) + 'px)';
    }
    var mr = $('d-more');
    if (mr) {
      Array.prototype.forEach.call(mr.children, function (c, i) { c.classList.toggle('focused', S.dz === 'more' && i === S.dMore); });
      mr.style.transform = 'translateX(' + (-Math.max(0, S.dMore - 1) * STEP.poster) + 'px)';
    }
  }

  function playEpisode(i) {
    var d = S.detail, eps = curEps(), ep = eps[i];
    if (!ep) return;
    recordWatch(d.it);
    S.dEp = i;
    var season = d.seasons[S.dSeason];
    var url = ep.url || (S.xt && S.xt.episodeUrl(ep));
    var epn = ep.episode_num || i + 1;
    playVod(url, d.it.name, 'S' + season + ' · A' + epn + (ep.title && ep.title !== d.it.name ? ' · ' + ep.title : ''),
      i + 1 < eps.length ? function () { playEpisode(i + 1); } : null,
      { key: 'e|' + d.it.id + '|' + season + '|' + epn, prefKey: prefKeyOf(d.it), kind: 'episode', name: d.it.name,
        parentTmdb: d.it.tmdb, season: season, episode: epn });
  }

  function detailKey(code) {
    var d = S.detail, zones = detailZones(), zi = zones.indexOf(S.dz);
    if (zi < 0) { S.dz = 'btns'; zi = 0; }
    switch (code) {
      case KEY.UP: if (zi > 0) S.dz = zones[zi - 1]; break;
      case KEY.DOWN: if (zi < zones.length - 1) S.dz = zones[zi + 1]; break;
      case KEY.LEFT: case KEY.RIGHT:
        var dlt = code === KEY.LEFT ? -1 : 1;
        if (S.dz === 'btns') S.dBtn = clamp(S.dBtn + dlt, d.btns.length);
        else if (S.dz === 'seasons') {
          var ns = clamp(S.dSeason + dlt, d.seasons.length);
          if (ns !== S.dSeason) { S.dSeason = ns; S.dEp = 0; renderDetail(); return true; }
        } else if (S.dz === 'eps') {
          var ne = clamp(S.dEp + dlt, curEps().length);
          if (ne !== S.dEp) { S.dEp = ne; renderDetail(); return true; }
        } else if (S.dz === 'more') {
          S.dMore = clamp(S.dMore + dlt, d.more.length);
        }
        break;
      case KEY.ENTER:
        if (S.dz === 'btns') {
          var b = d.btns[S.dBtn];
          if (!b) break;
          if (b.act === 'back') return detailKey(KEY.BACK);
          if (b.act === 'subs') {
            var opts = ['off'].concat(Subs.langs()), cur = getSubPref(prefKeyOf(d.it));
            setSubPref(prefKeyOf(d.it), opts[(opts.indexOf(cur) + 1) % opts.length]);
            renderDetail(); return true;
          }
          if (b.act === 'play') recordWatch(d.it);
          if (b.act === 'play') playVod(d.it.url, d.it.name, d.it.year || d.it.cat || '', null,
            { key: 'm|' + (d.it.id || d.it.url), prefKey: prefKeyOf(d.it), kind: 'movie', name: d.it.name, year: d.it.year, tmdb: d.it.tmdb });
          if (b.act === 'ep') playEpisode(S.dEp);
          return true;
        }
        if (S.dz === 'seasons') { S.dz = 'eps'; break; }
        if (S.dz === 'eps') { playEpisode(S.dEp); return true; }
        if (S.dz === 'more') { openDetail(d.more[S.dMore]); return true; }
        break;
      case KEY.BACK:
        S.detail = null; show('home'); updateFocus(); return true;
      default: return false;
    }
    detailFocus(); return true;
  }

  /* ======================================================
     SPELER
     ====================================================== */
  function playLive(list, idx) {
    S.play = { live: true, list: list, idx: idx, back: S.screen };
    startLive();
  }
  function startLive() {
    var p = S.play;
    p.idx = (p.idx + p.list.length) % p.list.length;
    var c = p.list[p.idx];
    if (p.zapped) recordWatch(c);
    p.zapped = true;
    $('osd-num').textContent = c.num || '';
    $('osd-name').textContent = c.name;
    $('osd-sub').textContent = c.cat || '';
    $('osd').classList.remove('vod');
    show('player');
    Player.play(c.url);
    osd();
  }
  function playVod(url, title, sub, next, meta) {
    Subs.hide(); closeSubMenu();
    S.play = { live: false, back: S.screen, next: next, meta: meta || null, subSel: 'off' };
    $('osd-num').textContent = '';
    $('osd-name').textContent = title;
    $('osd-sub').textContent = sub || '';
    $('osd').classList.add('vod');
    $('osd-bar').style.width = '0';
    $('osd-time').textContent = '';
    show('player');
    Player.play(url);
    osd();
  }
  function osd(status) {
    if (status !== undefined) $('osd-status').textContent = status;
    $('osd').classList.remove('hidden');
    $('player').classList.add('osd-on');
    updateProgress();
    clearTimeout(S.osdTimer);
    S.osdTimer = setTimeout(function () {
      if (!$('osd-status').textContent) { $('osd').classList.add('hidden'); $('player').classList.remove('osd-on'); }
    }, 5000);
  }
  var flashTimer;
  function flash(t) {
    osd(t);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { if ($('osd-status').textContent === t) { $('osd-status').textContent = ''; osd(); } }, 4000);
  }
  function updateProgress() {
    if (!S.play || S.play.live) return;
    var t = Player.time(), d = Player.duration();
    $('osd-bar').style.width = d ? Math.min(100, t / d * 100) + '%' : '0';
    $('osd-time').textContent = d ? fmtTime(t) + ' / ' + fmtTime(d) : fmtTime(t);
  }
  setInterval(function () {
    if (S.screen === 'player' && !$('osd').classList.contains('hidden')) updateProgress();
  }, 1000);

  Player.setStatusHandler(function (s) { if (S.screen === 'player') osd(s); });
  Player.setEndHandler(function () {
    if (S.screen !== 'player' || !S.play || S.play.live) return;
    if (S.play.next) S.play.next(); else leavePlayer();
  });

  function leavePlayer() {
    Subs.hide(); closeSubMenu();
    Player.stop();
    $('osd').classList.add('hidden');
    $('osd-status').textContent = '';
    var back = S.play ? S.play.back : 'home';
    S.play = null;
    if (back === 'detail' && S.detail) { show('detail'); detailFocus(); }
    else { show('home'); updateFocus(); }
  }

  function digit(dg) {
    var all = S.db.live;
    if (!all.length) return;
    S.numBuf = (S.numBuf + dg).slice(-4);
    $('osd-num').textContent = S.numBuf + '_';
    $('osd').classList.remove('hidden');
    clearTimeout(S.numTimer);
    S.numTimer = setTimeout(function () {
      var n = parseInt(S.numBuf, 10);
      S.numBuf = '';
      if (n >= 1 && n <= all.length) playLive(all, n - 1);
      else osd('Kanaal ' + n + ' bestaat niet');
    }, 1500);
  }

  function playerKey(code) {
    var p = S.play;
    if (!p) return false;
    if (S.sm) return subMenuKey(code);
    if (!p.live && (code === KEY.UP || code === KEY.CAPTION)) { openSubMenu(); return true; }
    if (p.live && code === KEY.CAPTION) { openSubMenu(); return true; }
    if (p.live && code >= 48 && code <= 57) { digit(String(code - 48)); return true; }
    switch (code) {
      case KEY.UP: case KEY.CH_UP:
        if (p.live) { p.idx++; startLive(); } else osd();
        break;
      case KEY.DOWN: case KEY.CH_DOWN:
        if (p.live) { p.idx--; startLive(); } else osd();
        break;
      case KEY.LEFT: if (!p.live) { Player.seek(-10000); osd(); } break;
      case KEY.RIGHT: if (!p.live) { Player.seek(10000); osd(); } break;
      case KEY.REW: if (!p.live) { Player.seek(-60000); osd(); } break;
      case KEY.FF: if (!p.live) { Player.seek(60000); osd(); } break;
      case KEY.ENTER: case KEY.PLAY_PAUSE: case KEY.PLAY: case KEY.PAUSE:
        if (code === KEY.ENTER && $('osd').classList.contains('hidden')) { osd(); break; }
        osd(Player.togglePause() ? 'Gepauzeerd' : '');
        break;
      case KEY.BACK: case KEY.STOP: leavePlayer(); break;
      default: return false;
    }
    return true;
  }

  /* ======================================================
     ONDERTITELS
     ====================================================== */
  var SUBP = 'tvplayer.subs';
  function prefKeyOf(it) { return it.kind === 'series' ? 's|' + it.id : 'm|' + (it.id || it.url); }
  function loadSubPrefs() { try { return JSON.parse(localStorage.getItem(SUBP)) || { t: {} }; } catch (e) { return { t: {} }; } }
  function getSubPref(k) { var p = loadSubPrefs(); return p.t[k] || p.def || 'off'; }
  function setSubPref(k, v) {
    var p = loadSubPrefs(); p.t[k] = v; p.def = v;
    try { localStorage.setItem(SUBP, JSON.stringify(p)); } catch (e) {}
  }
  function subLabel(v) { return v === 'off' ? 'Uit' : Subs.name(v); }

  // Taal kiezen: eerst ingebouwd spoor in die taal, anders online zoeken
  function useSubLang(lang, auto) {
    var p = S.play;
    if (!p || p.live) return;
    Subs.hide(); Player.muteEmbeddedSubs();
    p.subSel = 'off';
    if (lang === 'off') { if (!auto) flash('Ondertitels uit'); return; }
    var emb = Player.tracks().filter(function (t) { return t.type === 'TEXT' && t.lang === lang; })[0];
    if (emb && Player.selectTrack('TEXT', emb.index)) { p.subSel = 'emb:' + emb.index; flash('Ondertitels: ' + Subs.name(lang) + ' (ingebouwd)'); return; }
    useOnline(lang, auto);
  }
  function useOnline(lang, auto) {
    var p = S.play;
    if (!p || !p.meta) { if (!auto) flash('Geen titelgegevens om ondertitels te zoeken'); return; }
    if (!Subs.configured()) { if (!auto) flash('Online ondertitels: vul eerst je OpenSubtitles-sleutel in (js/config.js)'); return; }
    var q = {}; for (var k in p.meta) q[k] = p.meta[k];
    q.lang = lang;
    flash('Ondertitels zoeken: ' + Subs.name(lang) + '…');
    Subs.find(q).then(function (v) {
      if (S.play !== p) return;
      var cues = Subs.parse(v.text);
      if (!cues.length) throw new Error('Ondertitelbestand is leeg');
      Player.muteEmbeddedSubs();
      Subs.showCues(cues);
      p.subSel = 'online:' + lang;
      flash('Ondertitels: ' + Subs.name(lang) + (v.release ? ' · ' + v.release : ''));
      if (S.sm) renderSubMenu();
    }).catch(function (e) { if (S.play === p) flash(e.message); });
  }

  Player.setReadyHandler(function () {
    var p = S.play;
    if (!p || p.live || !p.meta) return;
    var pref = getSubPref(p.meta.prefKey);
    if (pref !== 'off') setTimeout(function () { if (S.play === p) useSubLang(pref, true); }, 600);
  });
  Player.setSubtitleHandler(function (t) { if (!Subs.active()) Subs.setText(t); });

  /* ---------- Menu in de speler ---------- */
  function subMenuItems() {
    var p = S.play, items = [{ label: 'Uit', act: 'off', on: p.subSel === 'off' }], tr = Player.tracks();
    tr.filter(function (t) { return t.type === 'TEXT'; }).forEach(function (t, i) {
      items.push({ label: 'Ingebouwd · ' + (t.lang ? Subs.name(t.lang) : 'spoor ' + (i + 1)), act: 'emb', index: t.index, lang: t.lang, on: p.subSel === 'emb:' + t.index });
    });
    if (!p.live) {
      Subs.langs().forEach(function (l) {
        items.push({ label: 'Online · ' + Subs.name(l), act: 'online', lang: l, on: p.subSel === 'online:' + l });
      });
    }
    if (Subs.active()) {
      items.push({ label: 'Ondertitels 0,5 s eerder', act: 'shift', ms: 500 });
      items.push({ label: 'Ondertitels 0,5 s later', act: 'shift', ms: -500 });
    }
    var audio = tr.filter(function (t) { return t.type === 'AUDIO'; });
    if (audio.length > 1) audio.forEach(function (t, i) {
      items.push({ label: 'Audio · ' + (t.lang ? Subs.name(t.lang) : 'spoor ' + (i + 1)), act: 'audio', index: t.index, on: p.audioSel === t.index });
    });
    return items;
  }
  function openSubMenu() {
    S.sm = { items: subMenuItems(), idx: 0 };
    S.sm.items.forEach(function (it, i) { if (it.on) S.sm.idx = i; });
    $('submenu').classList.remove('hidden');
    renderSubMenu();
  }
  function closeSubMenu() { S.sm = null; $('submenu').classList.add('hidden'); }
  function renderSubMenu() {
    if (!S.sm) return;
    var old = S.sm.idx; S.sm.items = subMenuItems(); S.sm.idx = clamp(old, S.sm.items.length);
    $('sm-list').innerHTML = S.sm.items.map(function (it, i) {
      return '<div class="sm-item' + (i === S.sm.idx ? ' focused' : '') + (it.on ? ' on' : '') + '">' + esc(it.label) + '</div>';
    }).join('');
    $('sm-hint').textContent = Subs.configured() ? 'Keuze wordt per film/serie onthouden' : 'Online: OpenSubtitles-sleutel nodig (js/config.js)';
    var sel = $('sm-list').children[S.sm.idx];
    $('sm-list').style.transform = 'translateY(' + (-Math.max(0, S.sm.idx - 8) * 74) + 'px)';
  }
  function subMenuKey(code) {
    var sm = S.sm, it = sm.items[sm.idx], p = S.play;
    switch (code) {
      case KEY.UP: sm.idx = Math.max(0, sm.idx - 1); break;
      case KEY.DOWN: sm.idx = Math.min(sm.items.length - 1, sm.idx + 1); break;
      case KEY.ENTER:
        if (!it) break;
        if (it.act === 'shift') { var o = Subs.shift(it.ms); flash('Ondertitel-sync: ' + (o > 0 ? '+' : '') + (o / 1000).toFixed(1) + ' s'); break; }
        if (it.act === 'audio') { Player.selectTrack('AUDIO', it.index); p.audioSel = it.index; flash(it.label); break; }
        if (it.act === 'off') { useSubLang('off'); if (p.meta) setSubPref(p.meta.prefKey, 'off'); }
        if (it.act === 'emb') {
          Subs.hide(); Player.selectTrack('TEXT', it.index); p.subSel = 'emb:' + it.index; flash(it.label);
          if (p.meta && it.lang) setSubPref(p.meta.prefKey, it.lang);
        }
        if (it.act === 'online') { useOnline(it.lang); if (p.meta) setSubPref(p.meta.prefKey, it.lang); }
        closeSubMenu(); return true;
      case KEY.BACK: case KEY.LEFT: case KEY.CAPTION: closeSubMenu(); return true;
      default: return true;
    }
    renderSubMenu(); return true;
  }

  /* ======================================================
     TOETSEN
     ====================================================== */
  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    var inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (code === KEY.ESC || (code === KEY.BACKSPACE && !inInput)) code = KEY.BACK;
    if (!$('loading').classList.contains('hidden')) { e.preventDefault(); return; }
    var handled =
      S.screen === 'setup' ? setupKey(code) :
      S.screen === 'home' ? homeKey(code) :
      S.screen === 'detail' ? detailKey(code) :
      playerKey(code);
    if (handled) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#setup .focusable');
    if (!t || S.screen !== 'setup') return;
    var i = setupFocusables().indexOf(t);
    if (i > -1) { setupFocus(i); setupKey(KEY.ENTER); }
  });

  /* ---------- Start ---------- */
  renderNav();
  var saved = loadSaved();
  prefill(saved);
  setupFocus(0);
  if (saved) openSource(saved, false);

  // Testhaak voor browser
  window.__tv = { S: S, loadDB: function () {} };
})();
