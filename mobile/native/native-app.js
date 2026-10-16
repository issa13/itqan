// native-app.js — ONLY included in the Android/iOS app (mobile/scripts/
// copy-web.js adds it to the app's copy of index.html, right after
// boot.js). The website never loads it.
//
// It adds the few things a phone app needs that a website doesn't:
//   • account emails link back to the public website (see below)
//   • Android's back button closes dialogs / goes to the previous tab
//   • status-bar icons stay readable in light and dark theme
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

  function safe(promiseOrValue) {
    // Plugin calls return promises; a failure must never break the app.
    if (promiseOrValue && typeof promiseOrValue.catch === "function") promiseOrValue.catch(function () {});
  }

  // ---------------- status bar / navigation bar icons ----------------
  // "DARK" style = light icons (for a dark background), "LIGHT" = dark
  // icons. Follows the app's own theme toggle (data-theme="dark").
  function syncSystemBars() {
    if (!SystemBars) return;
    var dark = root.getAttribute("data-theme") === "dark";
    safe(SystemBars.setStyle({ style: dark ? "DARK" : "LIGHT" }));
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
  // Order: close the topmost open thing (⋮ menu, then a dialog) → go
  // back to the previous tab (each tab is its own #address, see
  // switchView() in auth-ui.js) → on the first screen, send the app to
  // the background (like every Android app) instead of killing it, so
  // a running duel / quiz is still there when you come back.
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
    safe(App.addListener("backButton", function (ev) {
      if (closeTopmostLayer()) return;
      if (ev && ev.canGoBack) { window.history.back(); return; }
      safe(App.minimizeApp());
    }));
  }

  // ---------------- coming back to the app ----------------
  // Re-apply the bar style (some Android versions reset it while the app
  // was in the background).
  if (App) {
    safe(App.addListener("resume", syncSystemBars));
  }
})();
