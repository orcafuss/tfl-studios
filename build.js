// build.js
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');

const SRC = path.join(__dirname, 'src');
const PAGES = path.join(SRC, 'pages');
const TRANSLATIONS = path.join(SRC, 'translations');
const ASSETS = path.join(SRC, 'assets');
const DIST = path.join(__dirname, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    fs.readdirSync(src).forEach(child => copyRecursive(path.join(src, child), path.join(dest, child)));
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

// read translations
const langFiles = fs.readdirSync(TRANSLATIONS).filter(f => f.endsWith('.json'));
const langs = langFiles.map(f => {
  const code = path.basename(f, '.json');
  const data = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS, f), 'utf8'));
  return { code, data };
});

// clean dist
fs.rmSync(DIST, { recursive: true, force: true });

// copy assets into dist root (optional), and into each lang folder later
copyRecursive(ASSETS, path.join(DIST, 'assets'));

// read templates
const pageFiles = fs.readdirSync(PAGES).filter(f => f.endsWith('.html'));

const siteBase = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/+$/,'') : ''; // optional

langs.forEach(lang => {
  const langDir = path.join(DIST, lang.code);
  ensureDir(langDir);

  // copy assets per-language (optional: if assets are language-independent you can skip per-lang copy)
  copyRecursive(ASSETS, path.join(langDir, 'assets'));

  pageFiles.forEach(pageFile => {
    const template = fs.readFileSync(path.join(PAGES, pageFile), 'utf8');
    const pageName = path.basename(pageFile, '.html'); // index, about, ...
    const outDir = pageName === 'index' ? langDir : path.join(langDir, pageName);
    ensureDir(outDir);

    // build alternates for hreflang links
    const alternates = langs.map(l => {
      const pagePath = pageName === 'index' ? '' : pageName + '/';
      return { lang: l.code, url: `${siteBase}/${l.code}/${pagePath}`.replace(/\/+/g,'/').replace(':/','://') };
    });

    const view = Object.assign({}, lang.data, {
      lang: lang.code,
      alternates,
      canonical: `${siteBase}/${lang.code}/${pageName === 'index' ? '' : pageName + '/'}`.replace(/\/+/g,'/').replace(':/','://')
    });

    const outHtml = mustache.render(template, view);
    fs.writeFileSync(path.join(outDir, 'index.html'), outHtml, 'utf8');
  });
});

// root index: language chooser mit automatischer Weiterleitung
const rootIndex = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Redirecting...</title>
</head>
<body>
  <script>
    (function() {
      var supported = ${JSON.stringify(langs.map(l => l.code))};
      var browserLang = (navigator.language || navigator.userLanguage || 'en').slice(0,2).toLowerCase();
      if (!supported.includes(browserLang)) browserLang = 'en'; // default fallback
      window.location.replace('/' + browserLang + '/');
    })();
  </script>
  <noscript>
    <h1>Choose your language</h1>
    <ul>
      ${langs.map(l => `<li><a href="/${l.code}/">${l.code.toUpperCase()}</a></li>`).join('\n')}
    </ul>
  </noscript>
</body>
</html>`;
fs.writeFileSync(path.join(DIST, 'index.html'), rootIndex, 'utf8');

console.log('Build complete — generated', langs.map(l => l.code).join(', '));
