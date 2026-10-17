// audio-store.js — recitation audio kept on the device, for listening
// without internet (📥 «التلاوة دون إنترنت» in the 📖 ⋮ menu, and the
// "download this for offline?" offer while listening).
//
// Files are the same everyayah.com mp3s the player streams
// ({folder}/{sss}{aaa}.mp3). Where they're kept:
//   • Android / iPhone app: the app's private storage, via Capacitor's
//     Filesystem plugin, downloaded with Capacitor's native HTTP (no
//     browser cross-site restrictions apply there).
//   • Website: the browser's Cache Storage. This only works if
//     everyayah.com allows websites to download its files (CORS); if it
//     doesn't, downloadOne() throws "web_blocked" and the UI says the
//     feature is available in the phone app.
// Which ayahs are downloaded is remembered per reciter folder in
// localStorage, so checking is instant.
//
// Loaded before app.js and quran-reader.js (see index.html).

const QuranAudioStore = (function () {
  "use strict";

  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  const Plugins = (Cap && Cap.Plugins) || {};
  const FS = Plugins.Filesystem;
  const HTTP = Plugins.CapacitorHttp;
  const WEB_CACHE = "itqan-audio-v1";
  const INDEX_PREFIX = "qf_audio_dl:";

  let nativeBaseUri = null;      // file:// URI of the app's "audio" folder
  let webBlocked = false;        // the site can't download from everyayah (CORS)
  const indexCache = new Map();  // folder -> Set of "sssaaa"

  function code(surah, ayah) {
    return String(surah).padStart(3, "0") + String(ayah).padStart(3, "0");
  }
  function remoteUrl(folder, surah, ayah) {
    return `https://everyayah.com/data/${folder}/${code(surah, ayah)}.mp3`;
  }

  // ---- which ayahs are on the device ----
  function indexFor(folder) {
    if (!indexCache.has(folder)) {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(INDEX_PREFIX + folder) || "[]"); } catch (e) { /* ignore */ }
      indexCache.set(folder, new Set(list));
    }
    return indexCache.get(folder);
  }
  let saveTimers = new Map();
  function saveIndex(folder) {
    // batched: a whole-Quran download marks thousands of files
    clearTimeout(saveTimers.get(folder));
    saveTimers.set(folder, setTimeout(() => {
      try { localStorage.setItem(INDEX_PREFIX + folder, JSON.stringify(Array.from(indexFor(folder)))); } catch (e) { /* storage full */ }
    }, 400));
  }
  function has(folder, surah, ayah) { return indexFor(folder).has(code(surah, ayah)); }
  function count(folder) { return indexFor(folder).size; }

  // ---- support ----
  function canDownload() {
    if (isNative) return !!(FS && HTTP);
    return !webBlocked && typeof caches !== "undefined" && window.isSecureContext;
  }
  function isOnline() { return navigator.onLine !== false; }

  async function nativeBase() {
    if (!nativeBaseUri) {
      const r = await FS.getUri({ path: "audio", directory: "DATA" });
      nativeBaseUri = r.uri.replace(/\/$/, "");
    }
    return nativeBaseUri;
  }

  // ---- playing: the local copy when there is one, else the internet ----
  // Returns { url, local }. A web blob: URL must be released with
  // release(url) when the audio element is done with it.
  async function resolve(folder, surah, ayah) {
    if (has(folder, surah, ayah)) {
      try {
        if (isNative) {
          const base = await nativeBase();
          return { url: Cap.convertFileSrc(`${base}/${folder}/${code(surah, ayah)}.mp3`), local: true };
        }
        const cache = await caches.open(WEB_CACHE);
        const res = await cache.match(remoteUrl(folder, surah, ayah));
        if (res) return { url: URL.createObjectURL(await res.blob()), local: true };
        // the browser cleared it — forget it
        indexFor(folder).delete(code(surah, ayah));
        saveIndex(folder);
      } catch (e) { /* fall back to streaming */ }
    }
    return { url: remoteUrl(folder, surah, ayah), local: false };
  }
  function release(url) {
    if (url && url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }
  }
  // A local file that failed to play (deleted by the system?) — forget it.
  function forget(folder, surah, ayah) {
    indexFor(folder).delete(code(surah, ayah));
    saveIndex(folder);
  }

  // ---- downloading ----
  async function downloadOne(folder, surah, ayah) {
    if (has(folder, surah, ayah)) return;
    const url = remoteUrl(folder, surah, ayah);
    if (isNative) {
      const res = await HTTP.request({ method: "GET", url, responseType: "blob", connectTimeout: 20000, readTimeout: 60000 });
      if (!res || res.status !== 200 || !res.data) throw new Error("http " + (res && res.status));
      await FS.writeFile({ path: `audio/${folder}/${code(surah, ayah)}.mp3`, data: res.data, directory: "DATA", recursive: true });
    } else {
      let res;
      try {
        res = await fetch(url, { mode: "cors" });
      } catch (e) {
        // A network error while online is (almost always) the browser
        // refusing a cross-site download.
        if (isOnline()) { webBlocked = true; throw new Error("web_blocked"); }
        throw new Error("offline");
      }
      if (!res.ok) throw new Error("http " + res.status);
      const cache = await caches.open(WEB_CACHE);
      await cache.put(url, res);
    }
    indexFor(folder).add(code(surah, ayah));
    saveIndex(folder);
  }

  // Downloads a list of { surah, ayah } with a few in parallel.
  // onProgress(done, total, failed); returns { done, failed, cancelled }.
  // Stops early when offline / blocked, or when isCancelled() says so.
  async function downloadMany(folder, items, onProgress, isCancelled) {
    const todo = items.filter((it) => !has(folder, it.surah, it.ayah));
    const total = items.length;
    let done = total - todo.length, failed = 0, next = 0, fatal = null;
    if (onProgress) onProgress(done, total, failed);
    async function worker() {
      while (next < todo.length && !fatal && !(isCancelled && isCancelled())) {
        const it = todo[next++];
        try {
          await downloadOne(folder, it.surah, it.ayah);
          done++;
        } catch (e) {
          if (e.message === "web_blocked" || !isOnline()) fatal = isOnline() ? e.message : "offline";
          else failed++;
        }
        if (onProgress) onProgress(done, total, failed);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    saveIndex(folder);
    return { done, failed, total, cancelled: !!(isCancelled && isCancelled()), error: fatal };
  }

  async function deleteAll(folder) {
    if (isNative) {
      try { await FS.rmdir({ path: `audio/${folder}`, directory: "DATA", recursive: true }); } catch (e) { /* not there */ }
    } else if (typeof caches !== "undefined") {
      const cache = await caches.open(WEB_CACHE);
      const keys = await cache.keys();
      await Promise.all(keys.filter((r) => r.url.includes(`/data/${folder}/`)).map((r) => cache.delete(r)));
    }
    indexFor(folder).clear();
    try { localStorage.removeItem(INDEX_PREFIX + folder); } catch (e) { /* ignore */ }
  }

  // Rough size, for "≈ 12 م.ب" labels: everyayah files are constant
  // bitrate (the kbps is in the folder name) and an ayah lasts ~11s on
  // average across the whole Quran.
  function estimateMB(folder, ayahCount) {
    const m = /(\d+)\s*kbps/i.exec(folder);
    const kbps = m ? parseInt(m[1], 10) : 128;
    return (ayahCount * 11 * kbps * 1000) / 8 / 1e6;
  }

  return { isNative, canDownload, isOnline, has, count, resolve, release, forget, downloadOne, downloadMany, deleteAll, estimateMB, remoteUrl,
    get webBlocked() { return webBlocked; } };
})();
