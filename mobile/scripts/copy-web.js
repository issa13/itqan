#!/usr/bin/env node
// copy-web.js — copies the WEBSITE (the folder above mobile/) into
// mobile/www/, which is the folder Capacitor packs into the Android and
// iOS apps. Run it through `npm run sync` (it runs automatically before
// `npx cap sync`), never by hand-editing www/.
//
// Why a copy instead of pointing Capacitor at the website folder?
// The website folder also holds things that must NOT go inside the app
// (node_modules, the Supabase server code, docs, this mobile/ folder…).
// So only the files listed in WEB_FILES / WEB_FOLDERS are copied.
//
// While copying it makes three small app-only changes (the website
// files themselves are never touched):
//   1. adds native-app.js + native-app.css (from mobile/native/) to
//      index.html — back button, status bar colours, splash screen,
//      and where account emails should send people back to.
//   2. in styles.css, every env(safe-area-inset-*) becomes
//      var(--itqan-safe-area-inset-*, env(safe-area-inset-*)) — on
//      Android native-app.css sets those variables to 0 (the page sits
//      between the system bars there, and some phones report wrong
//      env() values); iPhone keeps using env().
//   3. nothing else — if you add a new file to the website, add it to
//      the list below too.

const fs = require("fs");
const path = require("path");

const MOBILE = path.join(__dirname, "..");
const WEBSITE = path.join(MOBILE, "..");
const OUT = path.join(MOBILE, "www");
const NATIVE = path.join(MOBILE, "native");

const WEB_FILES = [
  "index.html",
  "styles.css",
  "boot.js",
  "config.js",
  "supabase-client.js",
  "auth-ui.js",
  "app.js",
  "quran-reader.js",
  "audio-store.js",
  "net-status.js",
  "manifest.webmanifest",
];
const WEB_FOLDERS = ["vendor", "fonts", "icons", "quran-index", "mushaf-layout"];
const NATIVE_FILES = ["native-app.js", "native-app.css"];

function fail(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

// ---- 1. check everything is there before deleting the old copy ----
for (const f of WEB_FILES) {
  if (!fs.existsSync(path.join(WEBSITE, f))) fail(`Missing website file: ${f} (expected next to the mobile/ folder).`);
}
for (const d of WEB_FOLDERS) {
  if (!fs.existsSync(path.join(WEBSITE, d))) fail(`Missing website folder: ${d}/ — see README.md (§3 for quran-index/mushaf-layout, §9 for vendor/fonts).`);
}
for (const f of NATIVE_FILES) {
  if (!fs.existsSync(path.join(NATIVE, f))) fail(`Missing mobile/native/${f}.`);
}
const pageCount = fs.readdirSync(path.join(WEBSITE, "mushaf-layout")).filter((f) => /^page-\d{3}\.json$/.test(f)).length;
if (pageCount !== 604) fail(`mushaf-layout/ has ${pageCount} pages, expected 604 — run ./download-mushaf-layout.sh first.`);

// ---- 2. fresh copy ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of WEB_FILES) fs.copyFileSync(path.join(WEBSITE, f), path.join(OUT, f));
for (const d of WEB_FOLDERS) fs.cpSync(path.join(WEBSITE, d), path.join(OUT, d), { recursive: true });
for (const f of NATIVE_FILES) fs.copyFileSync(path.join(NATIVE, f), path.join(OUT, f));

// ---- 3. app-only changes to the COPIES ----
const indexPath = path.join(OUT, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const version = (html.match(/data-asset-version="([^"]*)"/) || [])[1] || "app";

// native-app.js must run right after boot.js — before supabase-client.js
// reads QF_AUTH_REDIRECT_URL.
const bootTag = html.match(/<script src="boot\.js[^"]*"><\/script>/);
if (!bootTag) fail("Couldn't find the boot.js <script> tag in index.html.");
html = html.replace(bootTag[0], `${bootTag[0]}\n  <script src="native-app.js?v=${version}"></script>`);

const stylesTag = html.match(/<link rel="stylesheet" href="styles\.css[^"]*">/);
if (!stylesTag) fail("Couldn't find the styles.css <link> tag in index.html.");
html = html.replace(stylesTag[0], `${stylesTag[0]}\n  <link rel="stylesheet" href="native-app.css?v=${version}">`);
fs.writeFileSync(indexPath, html, "utf8");

const cssPath = path.join(OUT, "styles.css");
let css = fs.readFileSync(cssPath, "utf8");
let swaps = 0;
css = css.replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(,[^()]*)?\)/g, (m, side) => {
  swaps++;
  return `var(--itqan-safe-area-inset-${side}, ${m})`;
});
fs.writeFileSync(cssPath, css, "utf8");

// ---- 4. summary ----
let bytes = 0, files = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; }
  }
})(OUT);
console.log(`✅ Copied the website into mobile/www/ — ${files} files, ${(bytes / 1048576).toFixed(1)} MB (version ${version}, ${swaps} safe-area rules adapted).`);
