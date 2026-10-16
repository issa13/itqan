// boot.js — runs in <head> before anything renders. Kept in its own file
// (instead of an inline <script>) so the Content-Security-Policy in
// index.html can forbid ALL inline scripts — the most common way an
// injected-HTML bug turns into running someone else's code.

// Cache-busting version for the Quran data files (fetched by app.js and
// quran-reader.js). Read from <html data-asset-version="…"> so there's
// one place to change it — `npm run bump` updates it for you.
window.QF_ASSET_VERSION = document.documentElement.getAttribute("data-asset-version") || "dev";

// Applied before first paint so switching themes never flashes the wrong
// one. auth-ui.js's toggle button reads/writes the same data-theme
// attribute and qf_theme localStorage key.
(function () {
  try {
    var stored = localStorage.getItem("qf_theme");
    var dark = stored === "dark" || (stored !== "light" &&
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) { /* ignore */ }
})();
