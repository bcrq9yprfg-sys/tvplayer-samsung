/* Instellingen voor online ondertitels (OpenSubtitles.com).
   1. Maak een gratis account op https://www.opensubtitles.com
   2. Ga naar je profiel → "API consumers" → maak een nieuwe consumer → kopieer de API-sleutel.
   3. Vul hieronder de API-sleutel en je OpenSubtitles-inlog in (inlog is nodig om te downloaden).
   4. Bouw de app opnieuw (Build Project → Run Project). */
var CONFIG = {
  opensubtitles: {
    apiKey: '',
    username: '',
    password: '',
    appName: 'TVPlayer v0.6'
  },
  // Talen in het ondertitelmenu (ISO 639-1), in deze volgorde
  subLangs: ['nl', 'en', 'ar', 'tr', 'fr', 'de', 'es']
};
