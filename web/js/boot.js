// Runs before the first paint (a classic, blocking script in <head>): theme and language are in
// place before anything is drawn, so the page never flashes the wrong ones.
(function () {
  var root = document.documentElement;
  var lang = (navigator.language || '').slice(0, 2) === 'it' ? 'it' : 'en';
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    var savedLang = localStorage.getItem('aipong.lang');
    if (savedLang === 'it' || savedLang === 'en') lang = savedLang;
    var savedTheme = localStorage.getItem('aipong.theme');
    if (savedTheme === 'light' || savedTheme === 'dark') dark = savedTheme === 'dark';
  } catch (e) {
    // Storage blocked: the browser's settings decide.
  }
  root.lang = lang;
  root.dataset.theme = dark ? 'dark' : 'light';
})();
