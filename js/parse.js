/* Parsers voor M3U en Xtream. Draait in een Web Worker (UI blijft vloeiend),
   of op de hoofdthread als terugval.
   Uitvoer is compact (arrays i.p.v. objecten) om kopiëren en opslaan snel te houden:
     live:   [name, img, cat, url, id]
     movies: [name, img, cat, url, id, rating, added, year]
     series: [name, img, cat, id, rating, added, year, plot, genre, backdrop, eps] */
var Parse = (function () {

  function attr(line, key) {
    var i = line.indexOf(key + '="');
    if (i < 0) return '';
    i += key.length + 2;
    var j = line.indexOf('"', i);
    return j < 0 ? '' : line.slice(i, j);
  }
  function yearOf(name) { var m = /[\(\[ ](19\d\d|20\d\d)[\)\] ]?\s*$/.exec(name || ''); return m ? m[1] : ''; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function arr(v) { return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(function (k) { return v[k]; }) : []); }
  var EP_RE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})\b/i;

  function m3u(text) {
    if (text.slice(0, 300).toUpperCase().indexOf('#EXTM3U') < 0) throw new Error('Geen geldig M3U-bestand');
    var live = [], movies = [], series = [], smap = {};
    var pos = 0, len = text.length, name = null, img = '', cat = '', n = 0;
    while (pos < len) {
      var end = text.indexOf('\n', pos);
      if (end < 0) end = len;
      var line = text.slice(pos, end);
      pos = end + 1;
      if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      if (!line) continue;
      if (line.charCodeAt(0) === 35) { // '#'
        if (line.indexOf('#EXTINF') === 0) {
          var comma = line.lastIndexOf(',');
          name = comma > -1 ? line.slice(comma + 1).trim() : 'Onbekend';
          img = attr(line, 'tvg-logo'); cat = attr(line, 'group-title') || 'Overig';
        } else if (line.indexOf('#EXTGRP:') === 0 && name !== null) cat = line.slice(8).trim() || cat;
        continue;
      }
      if (name === null) continue;
      var url = line.trim(), lu = url.toLowerCase();
      n++;
      if (lu.indexOf('/series/') > -1) {
        var m = EP_RE.exec(name);
        var sname = m ? m[1].trim() : name, season = m ? String(+m[2]) : '1', epn = m ? +m[3] : 0;
        var key = sname + '|' + cat, s = smap[key];
        if (!s) {
          s = smap[key] = [sname, img, cat, 'm' + n, 0, n, yearOf(sname), '', '', '', {}];
          series.push(s);
        }
        var eps = s[10], list = eps[season] = eps[season] || [];
        list.push({ episode_num: epn || list.length + 1, title: m ? 'Aflevering ' + epn : name, url: url, info: { movie_image: img } });
        s[5] = n;
      } else if (lu.indexOf('/movie/') > -1 || /\.(mp4|mkv|avi|mov)(\?|$)/.test(lu)) {
        movies.push([name, img, cat, url, 'm' + n, 0, n, yearOf(name)]);
      } else {
        live.push([name, img, cat, url, 'l' + n]);
      }
      name = null;
    }
    for (var i = 0; i < series.length; i++) {
      var e = series[i][10];
      for (var k in e) e[k].sort(function (a, b) { return a.episode_num - b.episode_num; });
    }
    if (!live.length && !movies.length && !series.length) throw new Error('Playlist is leeg');
    return { live: live, movies: movies, series: series };
  }

  // Xtream: json = streams-lijst, cats = {id: naam}, pre = {server, u, p}
  function xt(kind, json, cats, pre) {
    var list = arr(json), out = new Array(list.length), base = pre.server + '/' + (kind === 'live' ? 'live' : 'movie') + '/' + pre.u + '/' + pre.p + '/';
    for (var i = 0; i < list.length; i++) {
      var x = list[i], c = cats[x.category_id] || 'Overig';
      if (kind === 'live') {
        out[i] = [x.name, x.stream_icon || '', c, base + x.stream_id + '.m3u8', x.stream_id];
      } else if (kind === 'movie') {
        out[i] = [x.name, x.stream_icon || '', c, base + x.stream_id + '.' + (x.container_extension || 'mp4'), x.stream_id,
          num(x.rating), num(x.added), yearOf(x.name)];
      } else {
        out[i] = [x.name, x.cover || '', c, x.series_id, num(x.rating), num(x.last_modified),
          String(x.releaseDate || x.release_date || '').slice(0, 4) || yearOf(x.name), x.plot || '', x.genre || '',
          Array.isArray(x.backdrop_path) ? (x.backdrop_path[0] || '') : '', null];
      }
    }
    return out;
  }

  return { m3u: m3u, xt: xt };
})();

// Als Web Worker: berichten verwerken
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = function (e) {
    var d = e.data;
    try {
      var out = d.type === 'm3u' ? Parse.m3u(d.text) : Parse.xt(d.kind, JSON.parse(d.text), d.cats, d.pre);
      self.postMessage({ id: d.id, ok: true, out: out });
    } catch (err) {
      self.postMessage({ id: d.id, ok: false, err: String(err && err.message || err) });
    }
  };
}
