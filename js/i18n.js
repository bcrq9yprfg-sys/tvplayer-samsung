/* AM IPTV — taal volgt de menutaal van de TV (Samsung-eis).
   Nederlands als de TV op Nederlands staat, anders Engels.
   T('Nederlandse tekst') geeft de vertaling; onbekende tekst blijft ongewijzigd. */
var LANG = (function () {
  var l = '';
  try { l = (navigator.language || navigator.userLanguage || '').toLowerCase(); } catch (e) {}
  return l.indexOf('nl') === 0 ? 'nl' : 'en';
})();

var T = (function () {
  var EN = {
    /* tabs & rijen */
    'Home': 'Home', 'Live TV': 'Live TV', 'Films': 'Movies', 'Series': 'Series', 'Zoeken': 'Search',
    'Favorieten': 'Favorites', 'Playlist': 'Playlist', 'Zenders': 'Channels',
    'Verder kijken': 'Continue watching', 'Meest bekeken · Live TV': 'Most watched · Live TV',
    'Top 10 · Films': 'Top 10 · Movies', 'Top 10 · Series': 'Top 10 · Series',
    'Nieuw · Films': 'New · Movies', 'Nieuw · Series': 'New · Series',
    /* laden */
    'Laden…': 'Loading…', 'Laden': 'Load', 'Laden mislukt': 'Loading failed', 'Verversen mislukt: ': 'Refresh failed: ',
    'Verwerken…': 'Processing…', 'Playlist downloaden… ': 'Downloading playlist… ',
    'Laden…  zenders ': 'Loading…  channels ', '  ·  films ': '  ·  movies ', '  ·  series ': '  ·  series ',
    ' laden mislukt': ' failed to load', 'Geen inhoud gevonden': 'No content found',
    /* setup */
    'Playlist toevoegen': 'Add playlist', 'M3U-link': 'M3U link', 'Xtream login': 'Xtream login',
    'https://voorbeeld.nl/playlist.m3u': 'https://example.com/playlist.m3u', 'http://server:poort': 'http://server:port',
    'Gebruikersnaam': 'Username', 'Wachtwoord': 'Password',
    'Vul een geldige URL in': 'Enter a valid URL', 'Vul alle velden in': 'Fill in all fields',
    'Pijltjes: navigeren · OK: kiezen · Terug: vorige': 'Arrows: navigate · OK: select · Return: back',
    'Pijltjes: navigeren · OK: kiezen · Terug: afsluiten': 'Arrows: navigate · OK: select · Return: exit',
    /* licentie */
    'Licentie activeren': 'Activate license', 'Licentiecode': 'License code', 'Activeren': 'Activate',
    'Voer de licentiecode in uit je account op am-iptv-production.up.railway.app': 'Enter the license code from your account at am-iptv-production.up.railway.app',
    'Vul je licentiecode in': 'Enter your license code', 'Controleren…': 'Checking…',
    'Deze licentie is verlopen': 'This license has expired', 'Je licentie is verlopen': 'Your license has expired',
    'Ongeldige licentiecode': 'Invalid license code', 'Geen verbinding met de server': 'Cannot reach the server',
    /* home & zoeken */
    'Zoek films, series of zenders': 'Search movies, series or channels', 'OK: typen · Omlaag: resultaten': 'OK: type · Down: results',
    'Niets gevonden voor “': 'Nothing found for “', 'Druk OK om te typen': 'Press OK to type',
    'Nog niets hier. Kies favorieten bij Favorieten.': 'Nothing here yet. Choose folders under Favorites.',
    'Kies je favoriete mappen: OK = aan/uit. Daarna naar Home.': 'Choose your favorite folders: OK = on/off. Then go to Home.',
    'Goedenacht': 'Good night', 'Goedemorgen': 'Good morning', 'Goedemiddag': 'Good afternoon', 'Goedenavond': 'Good evening',
    'Wat wil je kijken?': 'What would you like to watch?', 'Nu live op ': 'Live now on ',
    '▶  OK om te kijken': '▶  OK to watch', '▶  OK om te openen': '▶  OK to open',
    'Seizoenen & afleveringen': 'Seasons & episodes', 'Kanaal ': 'Channel ', ' bestaat niet': ' does not exist',
    'OK = favoriet aan/uit · ': 'OK = favorite on/off · ', ' gekozen': ' selected', ' mappen': ' folders',
    ' titels · Terug = mappen': ' titles · Return = folders', 'Geen mappen': 'No folders',
    /* detail */
    '▶  Afspelen': '▶  Play', '▶  Afspelen  S': '▶  Play  S', ' · A': ' · E', 'Terug': 'Back',
    'Ondertitels: ': 'Subtitles: ', 'Afleveringen laden…': 'Loading episodes…', 'Afleveringen laden mislukt': 'Failed to load episodes',
    'Geen afleveringen gevonden': 'No episodes found', 'Aflevering ': 'Episode ', 'Seizoen ': 'Season ', 'Meer zoals dit': 'More like this',
    /* speler */
    'Gepauzeerd': 'Paused', 'Bufferen…': 'Buffering…', 'Fout: ': 'Error: ', 'Kan niet afspelen: ': 'Cannot play: ',
    'Browser kan stream niet afspelen': 'This stream cannot be played',
    'Ondertitels & audio': 'Subtitles & audio', '▲ Ondertitels & audio': '▲ Subtitles & audio',
    'Uit': 'Off', 'Ondertitels uit': 'Subtitles off', ' (ingebouwd)': ' (built-in)', 'Ingebouwd · ': 'Built-in · ', 'spoor ': 'track ',
    'Audio · ': 'Audio · ', 'Ondertitels 0,5 s eerder': 'Subtitles 0.5 s earlier', 'Ondertitels 0,5 s later': 'Subtitles 0.5 s later',
    'Ondertitel-sync: ': 'Subtitle sync: ', 'Ondertitels zoeken: ': 'Searching subtitles: ', 'Ondertitelbestand is leeg': 'Subtitle file is empty',
    'Keuze wordt per film/serie onthouden': 'Your choice is remembered per movie/series',
    'Geen titelgegevens om ondertitels te zoeken': 'No title information to search subtitles',
    'Online ondertitels niet beschikbaar': 'Online subtitles not available',
    /* proefperiode & QR */
    'Gratis proefperiode · nog {n} dag(en)': 'Free trial · {n} day(s) left',
    'Je gratis proefperiode is voorbij': 'Your free trial has ended',
    'Je gratis proefperiode is voorbij. Koop een licentie op am-iptv-production.up.railway.app en voer je code in.': 'Your free trial has ended. Buy a license at am-iptv-production.up.railway.app and enter your code.',
    'Licentie invoeren': 'Enter license code', 'Of scan met je telefoon': 'Or scan with your phone',
    'Scan de QR-code, vul je playlist in op je telefoon. De TV laadt hem automatisch.': 'Scan the QR code and enter your playlist on your phone. The TV loads it automatically.',
    'Code: ': 'Code: ', 'Playlist ontvangen…': 'Playlist received…', 'QR-code laden…': 'Loading QR code…',
    'QR-code niet beschikbaar (geen verbinding)': 'QR code not available (no connection)',
    /* netwerk & bronnen */
    'Server gaf HTTP ': 'Server returned HTTP ', 'Geen verbinding met server': 'No connection to the server',
    'Server reageert te traag (time-out)': 'Server is not responding (timeout)', 'Ongeldig antwoord van server': 'Invalid response from server',
    'Geen geldig M3U-bestand': 'Not a valid M3U file', 'Playlist is leeg': 'Playlist is empty',
    'Geen netwerkverbinding. Controleer je internet.': 'No network connection. Please check your internet.',
    'Verbinding hersteld': 'Connection restored',
    'Geen ondertitels gevonden in ': 'No subtitles found in ', 'Geen verbinding met OpenSubtitles': 'No connection to OpenSubtitles',
    'OpenSubtitles reageert niet': 'OpenSubtitles is not responding', 'OpenSubtitles: daglimiet bereikt': 'OpenSubtitles: daily limit reached'
  };
  return function (s) { return LANG === 'nl' ? s : (EN.hasOwnProperty(s) ? EN[s] : s); };
})();

/* Vaste teksten in index.html vertalen (tekstknopen en placeholders) */
(function () {
  function run() {
    if (LANG === 'nl') return;
    document.documentElement.lang = 'en';
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (node) {
      var raw = node.nodeValue, t = raw.trim();
      if (t && T(t) !== t) node.nodeValue = raw.replace(t, T(t));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[placeholder]'), function (el) {
      var p = el.getAttribute('placeholder'); if (T(p) !== p) el.setAttribute('placeholder', T(p));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
