// native-app.js — ONLY included in the Android/iOS app (mobile/scripts/
// copy-web.js adds it to the app's copy of index.html, right after
// boot.js). The website never loads it.
//
// It adds the few things a phone app needs that a website doesn't:
//   • account emails link back to the public website (see below)
//   • Android's back button: closes a dialog → goes to the 📖 Mushaf
//     tab → closes the app
//   • the strips behind the status bar / navigation bar match the theme,
//     and their icons stay readable in light and dark theme
//   • the splash screen hides as soon as the page is ready
//
// Capacitor gives every installed native plugin to the page as
// window.Capacitor.Plugins.<Name>, so no build step / bundler is needed.

(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Where Supabase's emails ("confirm your email", "reset password")
  // send people. Inside the app the page lives at an in-app address
  // (https://localhost on Android, capacitor://localhost on iOS) that
  // the phone's browser can't open, so the links go to the website
  // instead. Change this if the website ever moves — and make sure it
  // is listed in Supabase → Authentication → URL Configuration →
  // Redirect URLs.
  // ---------------------------------------------------------------
  window.QF_AUTH_REDIRECT_URL = "https://issa13.github.io/itqan/";

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  if (!isNative) return; // opened in a normal browser — nothing else to do

  var platform = Cap.getPlatform(); // "android" | "ios"
  var Plugins = Cap.Plugins || {};
  var App = Plugins.App;
  var SystemBars = Plugins.SystemBars;
  var SplashScreen = Plugins.SplashScreen;

  var root = document.documentElement;
  root.classList.add("native-app", "platform-" + platform);
  window.QF_IS_NATIVE_APP = true;

  // ---------------- Android: page stays BETWEEN the system bars ----------------
  // With viewport-fit=cover, Android draws the page behind the status bar
  // and navigation bar and relies on CSS safe-area values — which some
  // phones / WebView versions report wrongly (double gaps at the top and
  // bottom, page not scrolling to the end). Without it, Capacitor sizes
  // the page to the space between the bars, and native-app.css sets all
  // safe-area spacing to 0 on Android. iPhone keeps viewport-fit=cover:
  // its safe-area values are reliable. Runs while <head> is parsed —
  // before Capacitor checks the tag.
  if (platform === "android") {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute("content", viewport.getAttribute("content").replace(/,?\s*viewport-fit=cover/, ""));
    }
  }

  function safe(promiseOrValue) {
    // Plugin calls return promises; a failure must never break the app.
    if (promiseOrValue && typeof promiseOrValue.catch === "function") promiseOrValue.catch(function () {});
  }

  // ---------------- status bar / navigation bar ----------------
  // Follows the app's own theme toggle (data-theme="dark"):
  //  • icon colour — "DARK" style = light icons (for a dark background),
  //    "LIGHT" = dark icons;
  //  • Android: the strips behind the bars get the page's --paper colour
  //    (our own small plugin, android/…/ItqanWindowPlugin.java).
  var PAPER_LIGHT = "#f4efe1"; // keep in sync with --paper in styles.css
  var PAPER_DARK = "#14180f";
  function syncSystemBars() {
    var dark = root.getAttribute("data-theme") === "dark";
    if (SystemBars) safe(SystemBars.setStyle({ style: dark ? "DARK" : "LIGHT" }));
    if (Plugins.ItqanWindow) safe(Plugins.ItqanWindow.setBackgroundColor({ color: dark ? PAPER_DARK : PAPER_LIGHT }));
  }
  syncSystemBars();
  new MutationObserver(syncSystemBars).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // ---------------- splash screen ----------------
  function hideSplash() {
    if (SplashScreen) safe(SplashScreen.hide({ fadeOutDuration: 200 }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hideSplash);
  else hideSplash();

  // ---------------- Android back button ----------------
  // 1. an open ⋮ menu or dialog → close it;
  // 2. on any other tab → go to the 📖 القرآن (Mushaf) tab;
  // 3. already on the Mushaf tab → close the app.
  function isShown(el) {
    return !!el && window.getComputedStyle(el).display !== "none";
  }

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  function closeTopmostLayer() {
    var menu = document.getElementById("quranMenuDropdown");
    if (isShown(menu)) { pressEscape(); return true; }

    var overlays = Array.prototype.slice.call(document.querySelectorAll(".modal-overlay")).filter(isShown);
    if (!overlays.length) return false;
    var top = overlays[overlays.length - 1];
    var closeBtn = top.querySelector(".modal-close, [data-close-modal]");
    if (closeBtn) closeBtn.click(); else pressEscape();
    return true;
  }

  if (App && platform === "android") {
    safe(App.addListener("backButton", function () {
      if (closeTopmostLayer()) return;
      var onMushaf = typeof currentViewName === "undefined" || currentViewName === "quran";
      if (!onMushaf && typeof switchView === "function") { switchView("quran"); return; }
      safe(App.exitApp());
    }));
  }

  // ---------------- coming back to the app ----------------
  // Re-apply the bar style (some Android versions reset it while the app
  // was in the background).
  if (App) {
    safe(App.addListener("resume", syncSystemBars));
  }
})();
