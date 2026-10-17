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

  // ---- reciters recorded as ONE FILE PER SURAH (mp3quran.net) ----
  // e.g. إدريس أبكر: there are no per-ayah files, but mp3quran publishes
  // when each ayah starts and ends inside the surah file. Every ayah of a
  // surah then maps to the same file ("sss000"), played as a clip.
  const surahSources = new Map(); // folder -> { server, read }
  function registerSurahSource(folder, server, read) { surahSources.set(folder, { server, read }); }
  function isSurahSource(folder) { return surahSources.has(folder); }

  function pad3(n) { return String(n).padStart(3, "0"); }
  function code(folder, surah, ayah) {
    return pad3(surah) + (surahSources.has(folder) ? "000" : pad3(ayah));
  }
  function remoteUrl(folder, surah, ayah) {
    const src = surahSources.get(folder);
    if (src) return `${src.server}${pad3(surah)}.mp3`;
    return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
  }

  // Ayah start/end times (ms) inside a surah file: [[start, end], …] by
  // ayah number - 1. Kept on the device once fetched (also for offline).
  const timingMem = new Map();
  async function getTimings(folder, surah) {
    const src = surahSources.get(folder);
    if (!src) return null;
    const key = `qf_timing:${src.read}:${surah}`;
    if (timingMem.has(key)) return timingMem.get(key);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) { timingMem.set(key, saved); return saved; }
    } catch (e) { /* ignore */ }
    const url = `https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${src.read}`;
    let data;
    if (isNative && HTTP) {
      const res = await HTTP.request({ method: "GET", url, responseType: "json", connectTimeout: 15000, readTimeout: 20000 });
      data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } else {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try { data = await (await fetch(url, { signal: ctrl.signal })).json(); } finally { clearTimeout(t); }
    }
    if (!Array.isArray(data) || !data.length) throw new Error("no timings");
    const list = [];
    data.forEach((row) => { if (row.ayah > 0) list[row.ayah - 1] = [row.start_time, row.end_time]; });
    timingMem.set(key, list);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* ignore */ }
    return list;
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
  function has(folder, surah, ayah) { return indexFor(folder).has(code(folder, surah, ayah)); }
  function count(folder) { return indexFor(folder).size; }

  // ---- support ----
  function canDownload() {
    if (isNative) return !!(FS && HTTP);
    return !webBlocked && typeof caches !== "undefined" && window.isSecureContext;
  }
  // net-status.js knows better than the phone whether data really gets through
  function isOnline() { return (typeof Net !== "undefined") ? Net.isOnline() : navigator.onLine !== false; }

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
          return { url: Cap.convertFileSrc(`${base}/${folder}/${code(folder, surah, ayah)}.mp3`), local: true };
        }
        const cache = await caches.open(WEB_CACHE);
        const res = await cache.match(remoteUrl(folder, surah, ayah));
        if (res) return { url: URL.createObjectURL(await res.blob()), local: true };
        // the browser cleared it — forget it
        indexFor(folder).delete(code(folder, surah, ayah));
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
    indexFor(folder).delete(code(folder, surah, ayah));
    saveIndex(folder);
  }

  // ---- downloading ----
  async function downloadOne(folder, surah, ayah) {
    if (surahSources.has(folder)) await getTimings(folder, surah); // needed to play it offline
    if (has(folder, surah, ayah)) return;
    const url = remoteUrl(folder, surah, ayah);
    if (isNative) {
      const path = `audio/${folder}/${code(folder, surah, ayah)}.mp3`;
      if (typeof FS.downloadFile === "function") {
        // streamed straight to storage — whole-surah files can be 100 MB+
        const res = await FS.downloadFile({ url, path, directory: "DATA", recursive: true, connectTimeout: 20000, readTimeout: 120000 });
        if (!res || !res.path) throw new Error("download failed");
      } else {
        const res = await HTTP.request({ method: "GET", url, responseType: "blob", connectTimeout: 20000, readTimeout: 60000 });
        if (!res || res.status !== 200 || !res.data) throw new Error("http " + (res && res.status));
        await FS.writeFile({ path, data: res.data, directory: "DATA", recursive: true });
      }
    } else {
      let res;
      try {
        res = await fetch(url, { mode: "cors" });
      } catch (e) {
        // A network error while online is (almost always) the browser
        // refusing a cross-site download.
        if (navigator.onLine !== false) { webBlocked = true; throw new Error("web_blocked"); }
        throw new Error("offline");
      }
      if (!res.ok) throw new Error("http " + res.status);
      const cache = await caches.open(WEB_CACHE);
      await cache.put(url, res);
    }
    indexFor(folder).add(code(folder, surah, ayah));
    saveIndex(folder);
  }

  // Downloads a list of { surah, ayah } with a few in parallel.
  // onProgress(done, total, failed); returns { done, failed, cancelled }.
  // Stops early when offline / blocked, or when isCancelled() says so.
  async function downloadMany(folder, items, onProgress, isCancelled) {
    const seen = new Set();
    const todo = items.filter((it) => {
      const c = code(folder, it.surah, it.ayah);
      if (seen.has(c) || has(folder, it.surah, it.ayah)) return false;
      seen.add(c);
      return true;
    });
    const total = surahSources.has(folder) ? new Set(items.map((it) => it.surah)).size : items.length;
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
      const src = surahSources.get(folder);
    const marker = src ? src.server : `/data/${folder}/`;
    await Promise.all(keys.filter((r) => r.url.includes(marker)).map((r) => cache.delete(r)));
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

  return { registerSurahSource, isSurahSource, getTimings, isNative, canDownload, isOnline, has, count, resolve, release, forget, downloadOne, downloadMany, deleteAll, estimateMB, remoteUrl,
    get webBlocked() { return webBlocked; } };
})();
