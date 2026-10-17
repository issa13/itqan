// Quran reading tab (📖 القرآن) — a fixed-to-viewport reader that
// renders the REAL 604-page, 15-line-per-page Mushaf layout (from a
// locally-mirrored dataset — see download-mushaf-layout.sh and
// mushaf-layout/page-XXX.json), not a re-flowed paragraph. The screen
// itself only ever shows the page; search, page/surah/juz navigation,
// bookmarks, reciter choice, and listen-to-a-range all live behind
// the ⋮ menu as modals. Works fully offline-capable for guests too —
// page text, surah info, ayah->page lookups, and search all run
// against our own derived index (see derive-quran-index.js), with
// zero dependency on alquran.cloud or any other API for text. Audio
// is the one exception (a different medium — can't be derived from
// text), served as direct static files from everyayah.com per the
// selected reciter, again with no API layer in between.
//
// Deliberately loaded AFTER app.js (see index.html) and reuses its
// globals directly rather than re-declaring them — clamp(),
// fetchSurahCatalog(), and fetchLocalAyahIndex() (all share app.js's
// own caches) come from app.js. This mirrors how auth-ui.js and
// app.js already share globals across script tags in this project.

const QURAN_LAST_PAGE_KEY = "qf_quran_last_page";
const QURAN_BOOKMARKS_KEY = "qf_quran_bookmarks";
const QURAN_RECITER_KEY = "qf_quran_reciter";

// `id` values are kept exactly as before so nobody's saved
// localStorage reciter preference resets; `folder` is the matching
// everyayah.com directory name (verified directly against their file
// listing), used by fetchQuranAyahAudioUrl() below.
const QURAN_RECITERS = [
  { id: "ar.alafasy", name: "مشاري راشد العفاسي", folder: "Alafasy_128kbps" },
  { id: "ar.abdulbasitmurattal", name: "عبد الباسط عبد الصمد (مرتل)", folder: "Abdul_Basit_Murattal_192kbps" },
  { id: "ar.husary", name: "محمود خليل الحصري", folder: "Husary_128kbps" },
  { id: "ar.minshawi", name: "محمد صديق المنشاوي (مرتل)", folder: "Minshawy_Murattal_128kbps" },
  { id: "ar.abdurrahmaansudais", name: "عبد الرحمن السديس", folder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي", folder: "MaherAlMuaiqly128kbps" },
  // Added 2026-10-17 — folder names copied from everyayah.com's own
  // recitations list (all Hafs ʿan ʿĀṣim, complete). kbps is used to
  // estimate download sizes.
  { id: "ea.shuraym", name: "سعود الشريم", folder: "Saood_ash-Shuraym_128kbps" },
  { id: "ea.ghamadi", name: "سعد الغامدي", folder: "Ghamadi_40kbps" },
  { id: "ea.dussary", name: "ياسر الدوسري", folder: "Yasser_Ad-Dussary_128kbps" },
  { id: "ea.qatami", name: "ناصر القطامي", folder: "Nasser_Alqatami_128kbps" },
  { id: "ea.ajamy", name: "أحمد بن علي العجمي", folder: "ahmed_ibn_ali_al_ajamy_128kbps" },
  { id: "ea.shaatree", name: "أبو بكر الشاطري", folder: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "ea.hudhaify", name: "علي الحذيفي", folder: "Hudhaify_128kbps" },
  { id: "ea.budair", name: "صلاح البدير", folder: "Salah_Al_Budair_128kbps" },
  { id: "ea.juhaynee", name: "عبد الله عواد الجهني", folder: "Abdullaah_3awwaad_Al-Juhaynee_128kbps" },
  { id: "ea.basfar", name: "عبد الله بصفر", folder: "Abdullah_Basfar_192kbps" },
  { id: "ea.rifai", name: "هاني الرفاعي", folder: "Hani_Rifai_192kbps" },
  { id: "ea.qahtani", name: "خالد القحطاني", folder: "Khaalid_Abdullaah_al-Qahtaanee_192kbps" },
  { id: "ea.qasim", name: "محسن القاسم", folder: "Muhsin_Al_Qasim_192kbps" },
  { id: "ea.ayyoub", name: "محمد أيوب", folder: "Muhammad_Ayyoub_128kbps" },
  { id: "ea.jibreel", name: "محمد جبريل", folder: "Muhammad_Jibreel_128kbps" },
  { id: "ea.bukhatir", name: "صلاح بو خاطر", folder: "Salaah_AbdulRahman_Bukhatir_128kbps" },
  { id: "ea.alaqimy", name: "أكرم العلاقمي", folder: "Akram_AlAlaqimy_128kbps" },
  { id: "ea.alijaber", name: "علي جابر", folder: "Ali_Jaber_64kbps" },
  { id: "ea.abbad", name: "فارس عباد", folder: "Fares_Abbad_64kbps" },
  { id: "ea.tablaway", name: "محمد محمود الطبلاوي", folder: "Mohammad_al_Tablaway_128kbps" },
  { id: "ea.basitmujawwad", name: "عبد الباسط عبد الصمد (مجود)", folder: "Abdul_Basit_Mujawwad_128kbps" },
  { id: "ea.minshawimujawwad", name: "محمد صديق المنشاوي (مجود)", folder: "Minshawy_Mujawwad_192kbps" },
  { id: "ea.husarymujawwad", name: "محمود خليل الحصري (مجود)", folder: "Husary_128kbps_Mujawwad" },
  { id: "ea.husarymuallim", name: "محمود خليل الحصري (المعلّم)", folder: "Husary_Muallim_128kbps" },
  // One file per SURAH (mp3quran.net) + the time each ayah starts/ends in
  // it — see audio-store.js. Ayahs play as clips of the surah file.
  { id: "mp3q.idrees", name: "إدريس أبكر", folder: "mp3quran-idrees-abkar",
    surahServer: "https://cdn.mp3quran.net/audio/idrees-abkar/r1/", timingRead: 12 },
];
QURAN_RECITERS.forEach((r) => {
  if (r.surahServer && typeof QuranAudioStore !== "undefined") QuranAudioStore.registerSurahSource(r.folder, r.surahServer, r.timingRead);
});

// -------- DOM --------
const quranShellEl = document.querySelector(".quran-shell");
const quranMenuBtn = document.getElementById("quranMenuBtn");
const quranMenuDropdown = document.getElementById("quranMenuDropdown");
const quranPrevBtn = document.getElementById("quranPrevBtn");
const quranNextBtn = document.getElementById("quranNextBtn");
const quranPageIndicator = document.getElementById("quranPageIndicator");
const quranPageViewportEl = document.getElementById("quranPageViewport");
const quranPageContent = document.getElementById("quranPageContent");

const quranSearchInput = document.getElementById("quranSearchInput");
const quranSearchResults = document.getElementById("quranSearchResults");
const quranSearchResultsSummary = document.getElementById("quranSearchResultsSummary");

const quranSurahSelect = document.getElementById("quranSurahSelect");
const quranJuzSelect = document.getElementById("quranJuzSelect");
const quranPageInput = document.getElementById("quranPageInput");
const quranGoPageBtn = document.getElementById("quranGoPageBtn");
const quranStatus = document.getElementById("quranStatus");

const quranBookmarkNameInput = document.getElementById("quranBookmarkNameInput");
const quranAddBookmarkBtn = document.getElementById("quranAddBookmarkBtn");
const quranBookmarksList = document.getElementById("quranBookmarksList");

const quranReciterList = document.getElementById("quranReciterList");

const quranListenFromSurah = document.getElementById("quranListenFromSurah");
const quranListenFromAyah = document.getElementById("quranListenFromAyah");
const quranListenToSurah = document.getElementById("quranListenToSurah");
const quranListenToAyah = document.getElementById("quranListenToAyah");
const quranListenStartBtn = document.getElementById("quranListenStartBtn");
const quranListenError = document.getElementById("quranListenError");
const quranListenPlayer = document.getElementById("quranListenPlayer");
const quranListenNowPlaying = document.getElementById("quranListenNowPlaying");
const quranListenPauseBtn = document.getElementById("quranListenPauseBtn");
const quranListenStopBtn = document.getElementById("quranListenStopBtn");

// -------- state --------
let currentQuranPage = 1;
let quranCurrentPageContextLabel = "";
let quranTabInitialized = false;
let quranSurahOptionsLoaded = false;
let quranListenSurahsLoaded = false;

let quranSelectedReciter = QURAN_RECITERS[0].id;
try {
  const savedReciter = localStorage.getItem(QURAN_RECITER_KEY);
  if (savedReciter && QURAN_RECITERS.some((r) => r.id === savedReciter)) quranSelectedReciter = savedReciter;
} catch (e) { /* storage unavailable, ignore */ }

function escapeQuranHtml(str) {
  return (str || "").toString().replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toArabicDigits(n) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(n).split("").map((d) => (map[+d] !== undefined ? map[+d] : d)).join("");
}

// ============================================================
// Arabic search normalisation
//
// The index text is full Uthmani script, which spells many words
// differently from how people type them: ٱ (alef wasla) instead of ا,
// tatweel + dagger alef (ـٰ) for a long "a" (ٱلرَّحْمَـٰنِ, ٱلسَّمَـٰوَٰتِ),
// وٰ for alef (ٱلصَّلَوٰةَ), a standalone hamza before alef (ءَامَنُوا۟),
// plus pause/recitation marks. A regex over the raw text could not
// match most everyday queries ("الله" found 2 ayahs, "الرحمن" none).
//
// Instead, both the query and each ayah are reduced to a plain
// skeleton (no diacritics/marks/spaces, unified letter forms), and the
// match runs on that. Each ayah gets two skeletons — dagger alef
// dropped / وٰ read as ا (الرحمن، الصلاة) and every dagger alef read as ا
// (السماوات) — and matches if either contains the query. An index map back to the original
// characters lets matches still be highlighted in the real text.
// ============================================================
const AR_IGNORABLE = /[ؐ-ًؚ-ٟـۖ-ۭء\s]/;
const AR_LETTER_MAP = {
  "ٱ": "ا", "أ": "ا", "إ": "ا", "آ": "ا", "ٲ": "ا", "ٳ": "ا",
  "ى": "ي", "ئ": "ي", "ی": "ي",
  "ؤ": "و",
  "ة": "ه",
};
const AR_DAGGER_ALEF = "ٰ";

// -> { text: skeleton, map: [original index for each skeleton char] }
function arabicSkeleton(input, daggerAsAlef) {
  const src = input || "";
  const out = [];
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === AR_DAGGER_ALEF) {
      if (daggerAsAlef) {
        // read every dagger alef as a written ا (ٱلسَّمَـٰوَٰتِ -> السماوات)
        if (out[out.length - 1] !== "ا") { out.push("ا"); map.push(i); }
      } else if (out[out.length - 1] === "و") {
        // وٰ is a long alef written on a waw (ٱلصَّلَوٰةَ -> الصلاة)
        out[out.length - 1] = "ا";
      }
      continue;
    }
    if (AR_IGNORABLE.test(ch)) continue;
    const mapped = AR_LETTER_MAP[ch] || ch;
    // Collapse a doubled alef (e.g. يَـٰٓأَيُّهَا -> "يايها" either way it's typed).
    if (mapped === "ا" && out[out.length - 1] === "ا") continue;
    out.push(mapped);
    map.push(i);
  }
  return { text: out.join(""), map };
}

function normalizeArabicQuery(q) {
  return arabicSkeleton(q, false).text;
}

// Cached per ayah object (the index is loaded once and never mutated).
const quranSkeletonCache = new WeakMap();
function ayahSkeletons(text, cacheKey) {
  if (cacheKey && quranSkeletonCache.has(cacheKey)) return quranSkeletonCache.get(cacheKey);
  const pair = [arabicSkeleton(text, false), arabicSkeleton(text, true)];
  if (cacheKey) quranSkeletonCache.set(cacheKey, pair);
  return pair;
}

// Returns [[start, end), ...] ranges in the ORIGINAL text, or [] if no match.
function findArabicMatches(text, normQuery, cacheKey) {
  if (!normQuery) return [];
  for (const sk of ayahSkeletons(text, cacheKey)) {
    const ranges = [];
    let from = 0;
    let idx;
    while ((idx = sk.text.indexOf(normQuery, from)) !== -1) {
      const start = sk.map[idx];
      let end = sk.map[idx + normQuery.length - 1] + 1;
      // extend over trailing diacritics so the whole letter is highlighted
      while (end < text.length && AR_IGNORABLE.test(text[end]) && !/\s/.test(text[end])) end++;
      ranges.push([start, end]);
      from = idx + normQuery.length;
    }
    if (ranges.length) return ranges;
  }
  return [];
}

// Escapes each text segment individually and wraps matches in <mark>
// — never runs escaping on already-built HTML, so this stays safe.
function highlightArabicText(text, normQuery, cacheKey) {
  const ranges = findArabicMatches(text, normQuery, cacheKey);
  if (!ranges.length) return escapeQuranHtml(text);
  let result = "";
  let last = 0;
  for (const [a, b] of ranges) {
    if (a < last) continue;
    result += escapeQuranHtml(text.slice(last, a));
    result += `<mark class="quran-highlight">${escapeQuranHtml(text.slice(a, b))}</mark>`;
    last = b;
  }
  return result + escapeQuranHtml(text.slice(last));
}

// Mushaf pages render one <span> per word, so a multi-word query can't
// be highlighted as one run there. Within the target ayah, a word is
// marked if it's part of the query (or the query is part of it).
function wordMatchesQuery(wordText, normQuery) {
  if (!normQuery) return false;
  return ayahSkeletons(wordText).some(({ text }) =>
    text.length >= 2 && (normQuery.includes(text) || text.includes(normQuery))
  );
}

// Resolves the true page (and authoritative global ayah number) for a
// specific ayah via the ayah-by-reference endpoint — deliberately NOT
// trusting the search API's own "page"/"number" fields for navigation,
// since they don't always line up with the actual result.
// "surah:ayah" string — our local ayah index (and the mirrored
// line-layout dataset) identifies ayahs this way, not by a global
// ayah number, so highlighting keys off the same thing.
let quranHighlightAyahKey = null;
let quranHighlightQuery = null; // normalised query (see normalizeArabicQuery)

// A direct static-file URL — no API call needed. everyayah.com serves
// every reciter's audio as plain files named {surah:03d}{ayah:03d}.mp3
// (verified directly against their file listing). `reference` is a
// "surah:ayahInSurah" string; `reciterId` maps to a folder via
// QURAN_RECITERS below.
function fetchQuranAyahAudioUrl(reference, reciterId) {
  const parts = String(reference).split(":").map((n) => parseInt(n, 10));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const reciter = QURAN_RECITERS.find((r) => r.id === reciterId) || QURAN_RECITERS[0];
  const surahPadded = String(parts[0]).padStart(3, "0");
  const ayahPadded = String(parts[1]).padStart(3, "0");
  return `https://everyayah.com/data/${reciter.folder}/${surahPadded}${ayahPadded}.mp3`;
}

// ============================================================
// Fixed-viewport sizing — the reading box gets an explicit pixel
// height (available viewport space, measured live). Actual vertical
// distribution of the mirrored dataset's real Mushaf lines across
// that height is handled declaratively by CSS (.quran-mushaf-lines
// uses justify-content: space-between, so the last line always lands
// exactly at the bottom edge) — the only thing JS still needs to do
// is pick a font-size small enough that every individual line fits
// its available WIDTH without wrapping, since each dataset line must
// render as exactly one visual line to match the real Mushaf.
// ============================================================
function resizeQuranShell() {
  const quranView = document.getElementById("view-quran");
  if (!quranView || !quranView.classList.contains("active") || !quranShellEl) return;
  const wrapEl = document.querySelector(".wrap");
  if (!wrapEl) return;

  // Measured against the page (not the current scroll position) and the
  // real height of the fixed bottom nav, so the page buttons always end
  // just above it.
  const top = quranShellEl.getBoundingClientRect().top + window.scrollY;
  const nav = document.getElementById("bottomNav");
  const navHeight = nav ? nav.offsetHeight : 0;
  // While reading, .wrap has no bottom padding of its own (.wrap.reading-
  // quran — see switchView() in auth-ui.js); the shell's bottom margin
  // keeps the page buttons just above the fixed nav (and above the
  // recitation mini player when it's showing), which makes the page
  // exactly one screen tall — the reader never scrolls, and the Mushaf
  // page gets all the remaining height (it used to lose ~35px to the
  // generic 96px bottom padding every other tab needs).
  // (the recitation player floats over the page — it takes no height)
  const reserved = navHeight + 5;
  quranShellEl.style.marginBottom = reserved + "px";
  const available = window.innerHeight - top - reserved;
  quranShellEl.style.height = Math.max(360, available) + "px";
  fitMushafPage();
}

// 16px is the preferred size; minFont is the floor used only when a
// line genuinely can't fit (≈320–360px-wide phones). It used to be 16
// as well, which disabled shrinking entirely — dense pages then had
// their line ends clipped off-screen on small phones.
const QURAN_MAX_FONT_PX = 16;
const QURAN_MIN_FONT_PX = 11;        // floor when a line is too WIDE (it must stay one line)
const QURAN_MIN_FONT_FOR_HEIGHT = 13; // floor when the page is too TALL — below this, scroll instead

function fitMushafPage() {
  if (!quranPageContent) return;
  const maxFont = QURAN_MAX_FONT_PX, minFont = QURAN_MIN_FONT_PX;
  let fontSize = maxFont;

  quranPageContent.style.fontSize = fontSize + "px";
  quranPageContent.classList.remove("quran-viewport-scroll");

  const textLines = () => Array.from(quranPageContent.querySelectorAll(".quran-line-text"));
  // Reset any per-line spacing left over from a previous page/resize
  // before measuring — otherwise old values would throw off both the
  // width-fit loop and justifyMushafLine()'s "natural width" reading.
  textLines().forEach((el) => {
    el.style.columnGap = "0px";
    el.style.letterSpacing = "0px";
    el.style.justifyContent = "";
  });

  const anyLineOverflowsWidth = () =>
    Array.from(quranPageContent.querySelectorAll(".quran-mushaf-line"))
      .some((el) => el.scrollWidth > el.clientWidth + 1);
  // the lines' natural total height (space-between spreads them out, so
  // measure the children rather than the stretched container)
  const linesOverflowHeight = () => {
    const lines = Array.from(quranPageContent.querySelectorAll(".quran-mushaf-line"));
    const total = lines.reduce((sum, el) => sum + el.offsetHeight, 0);
    return total > quranPageContent.clientHeight;
  };

  // Shrink until every individual line fits its available width
  // without wrapping — a dataset "line" that wrapped into two visual
  // rows would break the real 15-line-per-page layout entirely — and
  // until all 15 lines fit the height on short screens.
  // Height gets a higher floor than width: on a short screen, a page that
  // still doesn't fit at 13px scrolls inside the reader (see below)
  // rather than shrinking into unreadable text.
  while (
    (anyLineOverflowsWidth() && fontSize > minFont) ||
    (linesOverflowHeight() && fontSize > Math.max(minFont, QURAN_MIN_FONT_FOR_HEIGHT))
  ) {
    fontSize -= 1;
    quranPageContent.style.fontSize = fontSize + "px";
  }

  // Stretch each line to reach both margins, like justified Mushaf
  // typesetting — but instead of dumping all the extra space into
  // just the gaps between words (which looks absurd on a sparse
  // line — a couple of words stretched apart with a huge gap), this
  // spreads it across every word-gap up to a sane per-gap cap, then
  // bleeds any remainder into subtle letter-spacing so it never looks
  // like floating disconnected words.
  textLines().forEach((el) => justifyMushafLine(el, fontSize));

  // Even at the smallest readable size the whole block might still be
  // taller than the box on an unusually small screen — fall back to
  // an internal scroll rather than clip content.
  // (a few px of tolerance: diacritics on the last line may poke out of
  // its line box by a pixel or two, which isn't worth a scrollbar)
  if (quranPageContent.scrollHeight > quranPageContent.clientHeight + 6) {
    quranPageContent.classList.add("quran-viewport-scroll");
  }
}

// Stretches one text line to fill its full width. gap/letter-spacing
// are reset to 0 by the caller before this reads el.scrollWidth, so
// that's the line's true tightest natural width at the chosen font
// size. Word-gaps absorb the stretch first (capped per-gap so two
// words never end up looking like they floated apart), and whatever's
// left bleeds into letter-spacing, verified against the real rendered
// width each step rather than trusting character-count math (Arabic
// diacritics make that math approximate at best).
function justifyMushafLine(el, fontSize) {
  if (el.children.length <= 1) {
    el.style.justifyContent = "center"; // nothing to put a gap between
    return;
  }

  const targetWidth = el.clientWidth;
  const naturalWidth = el.scrollWidth;
  const gapNeeded = targetWidth - naturalWidth;
  if (gapNeeded <= 1) return; // already fills the line

  const numGaps = el.children.length - 1;
  const maxGapPx = fontSize * 1.1;
  // Real kashida elongates letter connectors, not the gaps between
  // every letter — capping here keeps this approximation from turning
  // into visibly loose, harder-to-read text on very sparse lines.
  const maxLetterSpacingPx = fontSize * 0.12;
  const gapPx = Math.max(0, Math.min(maxGapPx, gapNeeded / numGaps));
  el.style.columnGap = gapPx + "px";

  for (let i = 0; i < 4; i++) {
    const diff = targetWidth - el.scrollWidth;
    if (Math.abs(diff) < 1) break;
    const totalChars = el.textContent.replace(/\s/g, "").length || 1;
    const current = parseFloat(el.style.letterSpacing) || 0;
    const next = Math.max(0, Math.min(maxLetterSpacingPx, current + diff / totalChars));
    el.style.letterSpacing = next + "px";
    if (next === current) break; // hit the cap, no more room to give
  }

  // A genuinely very short line (a handful of words) can hit both caps
  // and still fall short — center that leftover shortfall so it reads
  // as a balanced short line rather than one-sided empty space.
  if (targetWidth - el.scrollWidth > 2) {
    el.style.justifyContent = "center";
  }
}

let quranResizeDebounce = null;
window.addEventListener("resize", () => {
  clearTimeout(quranResizeDebounce);
  quranResizeDebounce = setTimeout(resizeQuranShell, 150);
});

// -------- entering the tab (called by switchView() in auth-ui.js) --------
async function enterQuranTab() {
  if (!quranSurahOptionsLoaded) {
    quranSurahOptionsLoaded = await populateQuranSurahSelect();
  }
  if (!quranTabInitialized) {
    quranTabInitialized = true;
    let startPage = 1;
    try {
      const saved = parseInt(localStorage.getItem(QURAN_LAST_PAGE_KEY), 10);
      if (Number.isFinite(saved) && saved >= 1 && saved <= 604) startPage = saved;
    } catch (e) { /* ignore */ }
    await quranGoToPage(startPage);
  }
  requestAnimationFrame(resizeQuranShell);
}

async function populateQuranSurahSelect() {
  try {
    const catalog = await fetchSurahCatalog(); // reused from app.js
    if (!catalog || !catalog.length) throw new Error("empty catalog");
    quranSurahSelect.innerHTML =
      '<option value="">اذهب إلى سورة...</option>' +
      catalog.map((s) => `<option value="${s.number}">${s.number}. ${escapeQuranHtml(s.name)}</option>`).join("");
    return true;
  } catch (e) {
    quranSurahSelect.innerHTML = '<option value="">تعذّر تحميل قائمة السور</option>';
    return false; // retried next time the tab is opened
  }
}

(function populateQuranJuzSelect() {
  let opts = '<option value="">اذهب إلى جزء...</option>';
  for (let j = 1; j <= 30; j++) opts += `<option value="${j}">الجزء ${toArabicDigits(j)}</option>`;
  quranJuzSelect.innerHTML = opts;
})();

// -------- rendering a page --------
function renderSurahDividerHtml(surah) {
  return `<div class="quran-surah-divider"><span>۞</span>${escapeQuranHtml(surah.name)}<span>۞</span></div>`;
}

// Where the mirrored 604-page dataset lives (see download-mushaf-layout.sh)
// — one JSON file per page, e.g. mushaf-layout/page-002.json.
const QURAN_MUSHAF_LAYOUT_BASE = "mushaf-layout";

const quranMushafPageCache = new Map();
async function fetchMushafPageLayout(page) {
  if (quranMushafPageCache.has(page)) return quranMushafPageCache.get(page);
  const padded = String(page).padStart(3, "0");
  // The shared asset version invalidates stale page data after deployment;
  // no-cache still allows reuse of a validated browser/server response.
  const version = encodeURIComponent(window.QF_ASSET_VERSION || "dev");
  const res = await fetch(`${QURAN_MUSHAF_LAYOUT_BASE}/page-${padded}.json?v=${version}`, { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP error " + res.status);
  const data = await res.json();
  quranMushafPageCache.set(page, data);
  return data;
}

// The dataset appends the ayah's own (Arabic-Indic) number straight
// onto the last word's text of every verse, e.g. "ٱلرَّحِيمِ ١" — this
// pulls that back off so it can be shown as its own styled badge
// instead of plain trailing text.
function splitEmbeddedAyahNumber(wordText) {
  const match = (wordText || "").match(/\s*([\u0660-\u0669]+)\s*$/);
  if (!match) return { text: wordText || "", number: null };
  return { text: wordText.slice(0, match.index).trimEnd(), number: match[1] };
}

function renderMushafWordHtml(word) {
  const { text, number } = splitEmbeddedAyahNumber(word.word);
  const [surahStr, ayahStr] = (word.location || "").split(":");
  const surahNum = parseInt(surahStr, 10) || null;
  const ayahNum = parseInt(ayahStr, 10) || null;
  const isTarget = surahNum && ayahNum && quranHighlightAyahKey === `${surahNum}:${ayahNum}`;

  const textHtml = (isTarget && quranHighlightQuery && wordMatchesQuery(text, quranHighlightQuery))
    ? `<mark class="quran-highlight">${escapeQuranHtml(text)}</mark>`
    : escapeQuranHtml(text);

  const keyAttr = (surahNum && ayahNum) ? ` data-k="${surahNum}:${ayahNum}"` : "";
  let html = `<span class="quran-word${isTarget ? " quran-ayah-target" : ""}"${keyAttr}>${textHtml}</span>`;

  // Only the ayah-ending word (the one carrying the embedded number)
  // gets the listen button + number badge — matches the printed
  // Mushaf's own end-of-ayah marker convention.
  if (number && surahNum && ayahNum) {
    html +=
      `<button type="button" class="quran-ayah-audio-btn" data-surah="${surahNum}" data-ayah="${ayahNum}" aria-label="استماع">🔊</button>` +
      `<span class="quran-ayah-num">${number}</span>`;
  }
  return html;
}

// Renders the real 604-page Mushaf layout: one row per dataset line
// (surah-header / basmala / text), matching the actual printed
// 15-line-per-page arrangement rather than a re-flowed paragraph.
// Vertical distribution across the full page height is handled by
// CSS (.quran-mushaf-lines) — see fitMushafPage() for the width side.
function buildMushafPageHtml(data) {
  const lines = data?.lines || [];
  let html = '<div class="quran-mushaf-lines">';

  lines.forEach((line) => {
    if (line.type === "surah-header") {
      html += `<div class="quran-mushaf-line quran-line-header">${renderSurahDividerHtml({ name: line.text })}</div>`;
    } else if (line.type === "basmala") {
      html += `<div class="quran-mushaf-line quran-line-basmala"><div class="quran-bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div></div>`;
    } else if (line.type === "text") {
      const wordsHtml = (line.words || []).map(renderMushafWordHtml).join("");
      html += `<div class="quran-mushaf-line quran-line-text">${wordsHtml}</div>`;
    }
  });

  html += "</div>";
  return html;
}

// A short label describing what's on the page, for the bookmarks list.
function computeQuranPageContextLabel(data) {
  const header = (data?.lines || []).find((l) => l.type === "surah-header");
  if (header) return header.text;
  const firstText = (data?.lines || []).find((l) => l.type === "text");
  return firstText?.verseRange || "";
}

function firstWordSurahOnPage(data) {
  const textLine = (data?.lines || []).find((l) => l.type === "text" && l.words && l.words.length);
  if (!textLine) return null;
  const n = parseInt((textLine.words[0].location || "").split(":")[0], 10);
  return Number.isFinite(n) ? n : null;
}

// Prefers the surah of the currently-highlighted ayah (set when the
// page was reached via search — see quranHighlightAyahKey) since
// that's the actual ayah the person is looking at; only falls back
// to "whatever surah starts this page" when nothing is highlighted.
function currentPageSurahNumber() {
  if (quranHighlightAyahKey) {
    const n = parseInt(quranHighlightAyahKey.split(":")[0], 10);
    if (Number.isFinite(n)) return n;
  }
  return firstWordSurahOnPage(quranMushafPageCache.get(currentQuranPage));
}

// Finds exactly where a surah starts and ends using the same
// locally-derived ayah index (quran-index/ayahs.json — see app.js's
// fetchLocalAyahIndex) that already powers solo/offline quiz
// generation and search. This used to walk outward from the current
// page one mushaf-layout page at a time (fetchMushafPageLayout per
// page) — for a large surah like Al-Baqarah (48 pages) that meant up
// to 48 sequential network round-trips, which is exactly why it felt
// slow the first time and fast afterwards (only once the browser's
// own HTTP cache had warmed up for every one of those pages). This
// instead does a single in-memory filter over the already-loaded flat
// ayah index — instant on every run, first or not, since
// fetchLocalAyahIndex() only ever fetches its one JSON file once and
// reuses it from then on for the rest of the session.
async function quranQuizRangeForSurahLocal(surahNumber) {
  const all = await fetchLocalAyahIndex();
  let minPage = null;
  let maxPage = null;
  for (const a of all) {
    if (a.surah !== surahNumber) continue;
    if (minPage == null || a.page < minPage) minPage = a.page;
    if (maxPage == null || a.page > maxPage) maxPage = a.page;
  }
  if (minPage == null) return null;
  return { minP: minPage, maxP: maxPage };
}

function quranQuizRangeForJuz(juzNumber) {
  const startPage = JUZ_START_PAGE[juzNumber - 1];
  const nextStart = JUZ_START_PAGE[juzNumber] || 605;
  return { minP: startPage, maxP: nextStart - 1 };
}

function quranQuizRangeAround(spread) {
  return { minP: clamp(currentQuranPage - spread, 1, 604), maxP: clamp(currentQuranPage + spread, 1, 604) };
}

// The Tests screen no longer has any session concept — signed-in
// users and guests share the exact same range picker now — so this
// always just sets the custom range there and jumps to the quiz tab,
// regardless of sign-in state. suggestedTitle is unused now that
// sessions aren't named, but kept as a param so callers don't need
// updating.
async function startQuizFromQuranRange(range, suggestedTitle) {
  if (!range || range.minP > range.maxP) {
    alert("تعذّر تحديد نطاق صالح لهذا الاختيار.");
    return;
  }
  rangeSelect.value = "custom";
  customMinEl.value = range.minP;
  customMaxEl.value = range.maxP;
  showHideCustomRange();
  await refreshQuestionTypeAvailability();
  switchView("home");
}

// -------- navigation --------
let quranNavToken = 0;

async function quranGoToPage(page, options) {
  options = options || {};
  page = clamp(parseInt(page, 10) || 1, 1, 604); // clamp() reused from app.js
  const myToken = ++quranNavToken;
  currentQuranPage = page;
  quranStopAudio();
  if (!options.preserveHighlight) {
    quranHighlightAyahKey = null;
    quranHighlightQuery = null;
  }
  try { localStorage.setItem(QURAN_LAST_PAGE_KEY, String(page)); } catch (e) { /* ignore */ }

  quranPageInput.value = page;
  quranPageIndicator.textContent = `الصفحة ${toArabicDigits(page)} من ٦٠٤`;
  quranPrevBtn.disabled = page <= 1;
  quranNextBtn.disabled = page >= 604;

  quranPageContent.innerHTML = '<div class="status">جاري التحميل...</div>';
  try {
    const data = await fetchMushafPageLayout(page);
    if (myToken !== quranNavToken) return; // the user already moved to another page
    quranCurrentPageContextLabel = computeQuranPageContextLabel(data);
    quranPageContent.innerHTML = buildMushafPageHtml(data);
    applyQuranPlayingHighlight();
  } catch (e) {
    if (myToken !== quranNavToken) return;
    quranCurrentPageContextLabel = "";
    quranPageContent.innerHTML =
      '<div class="status">تعذّر تحميل الصفحة. تأكد من رفع مجلد mushaf-layout بشكل صحيح، ثم حاول مرة أخرى.</div>';
  }
  resizeQuranShell(); // re-measures defensively and re-fits the text

  if (quranHighlightAyahKey) {
    const targetEl = quranPageContent.querySelector(".quran-ayah-target");
    // Normally the whole page is visible at once (that's the point of
    // the auto-fit sizing), so this only actually moves anything in
    // the rare case a page fell back to its internal scroll mode.
    if (targetEl) requestAnimationFrame(() => targetEl.scrollIntoView({ block: "center" }));
  }
}


quranGoPageBtn.addEventListener("click", () => {
  quranGoToPage(quranPageInput.value);
  closeQuranModal("quranGoToModal");
});
quranPageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    quranGoToPage(quranPageInput.value);
    closeQuranModal("quranGoToModal");
  }
});
quranPrevBtn.addEventListener("click", () => quranGoToPage(currentQuranPage - 1));
quranNextBtn.addEventListener("click", () => quranGoToPage(currentQuranPage + 1));

// -------- swipe navigation (mobile) --------
// Swipe right = next page, swipe left = previous page — same
// direction as the ◀/▶ quranNextBtn/quranPrevBtn buttons.
(function setupQuranSwipeNav() {
  const SWIPE_MIN_DISTANCE = 50; // px — how far counts as an intentional swipe, not a tap
  const SWIPE_MAX_VERTICAL = 60; // px — keeps a mostly-vertical gesture from triggering a page turn

  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  quranPageViewportEl.addEventListener("touchstart", (e) => {
    touchActive = e.touches.length === 1;
    if (!touchActive) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  quranPageViewportEl.addEventListener("touchend", (e) => {
    if (!touchActive) return;
    touchActive = false;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaY) > SWIPE_MAX_VERTICAL) return;
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) return;

    if (deltaX > 0) {
      if (currentQuranPage < 604) quranGoToPage(currentQuranPage + 1);
    } else {
      if (currentQuranPage > 1) quranGoToPage(currentQuranPage - 1);
    }
  }, { passive: true });
})();

quranJuzSelect.addEventListener("change", () => {
  const num = parseInt(quranJuzSelect.value, 10);
  quranJuzSelect.value = "";
  if (!num) return;
  const page = JUZ_START_PAGE[num - 1]; // reused from app.js
  if (page) { closeQuranModal("quranGoToModal"); quranGoToPage(page); }
});

// fetchSurahCatalog() (reused from app.js) is backed by our own
// derived index now, which already carries each surah's startPage —
// no API call needed, and it's already cached by that function itself.
async function resolveSurahStartPage(surahNumber) {
  const catalog = await fetchSurahCatalog();
  const entry = catalog.find((s) => s.number === surahNumber);
  return entry ? entry.startPage : null;
}

function setQuranStatus(msg) {
  quranStatus.textContent = msg || "";
  quranStatus.style.display = msg ? "block" : "none";
}

quranSurahSelect.addEventListener("change", async () => {
  const num = parseInt(quranSurahSelect.value, 10);
  quranSurahSelect.value = "";
  if (!num) return;
  setQuranStatus("جاري الانتقال...");
  const page = await resolveSurahStartPage(num);
  setQuranStatus(page ? "" : "تعذّر تحديد صفحة هذه السورة. حاول مرة أخرى.");
  if (page) { closeQuranModal("quranGoToModal"); await quranGoToPage(page); }
});

// -------- search --------
// Runs entirely against the local ayah index (see fetchLocalAyahIndex
// in app.js — same data source the quiz and offline challenges use).
// No network round-trip beyond the one-time index download, so this
// never depends on alquran.cloud or any other API being reachable —
// and every entry always has a surahName, so results never come back
// with a missing surah the way the old API-backed search sometimes did.
let quranSearchDebounceTimer = null;
let quranSearchAllMatches = [];   // full match list (from the local index) for the current query
let quranSearchQueryCurrent = "";
let quranSearchRenderedCount = 0;
const QURAN_SEARCH_PAGE_SIZE = 20;

quranSearchInput.addEventListener("input", () => {
  clearTimeout(quranSearchDebounceTimer);
  const q = quranSearchInput.value.trim();
  if (q.length < 2) {
    quranSearchResults.innerHTML = "";
    quranSearchResultsSummary.style.display = "none";
    quranSearchAllMatches = [];
    return;
  }
  quranSearchDebounceTimer = setTimeout(() => runQuranSearch(q), 300);
});

let quranSearchRunToken = 0;

async function runQuranSearch(keyword) {
  const myToken = ++quranSearchRunToken;
  const normQuery = normalizeArabicQuery(keyword);
  if (normQuery.length < 2) {
    quranSearchResults.innerHTML = normQuery ? '<div class="status">اكتب حرفين على الأقل.</div>' : "";
    quranSearchResultsSummary.style.display = "none";
    quranSearchAllMatches = [];
    return;
  }
  quranSearchResultsSummary.style.display = "none";
  quranSearchResults.innerHTML = '<div class="status">جاري البحث...</div>';
  try {
    const allAyahs = await fetchLocalAyahIndex(); // from app.js — cached after the first call
    if (myToken !== quranSearchRunToken) return; // a newer search started meanwhile
    const filtered = allAyahs.filter((a) => findArabicMatches(a.text || "", normQuery, a).length > 0);

    quranSearchAllMatches = filtered;
    quranSearchQueryCurrent = normQuery;
    quranSearchRenderedCount = 0;
    quranSearchResults.innerHTML = "";

    if (!filtered.length) {
      quranSearchResultsSummary.style.display = "none";
      quranSearchResults.innerHTML = '<div class="status">لا توجد نتائج تحتوي على هذا النص.</div>';
      return;
    }

    quranSearchResultsSummary.style.display = "block";
    quranSearchResultsSummary.textContent = `عدد النتائج: ${toArabicDigits(filtered.length)}`;

    appendNextQuranSearchResultsBatch();
  } catch (e) {
    quranSearchResultsSummary.style.display = "none";
    quranSearchResults.innerHTML = '<div class="status">تعذّر تحميل فهرس القرآن (quran-index). تحقق من إعداد المشروع.</div>';
  }
}

// Renders the next QURAN_SEARCH_PAGE_SIZE matches starting at
// quranSearchRenderedCount and wires up their click handlers — called
// once right after a search, then again whenever the results list is
// scrolled near its bottom (see the scroll listener below), so a
// large result set loads progressively instead of being capped.
function appendNextQuranSearchResultsBatch() {
  const start = quranSearchRenderedCount;
  const end = Math.min(quranSearchAllMatches.length, start + QURAN_SEARCH_PAGE_SIZE);
  if (start >= end) return;

  const normQuery = quranSearchQueryCurrent;
  const batch = quranSearchAllMatches.slice(start, end);
  const html = batch.map((a, i) => {
    const globalIdx = start + i;
    return `
      <div class="quran-search-result" data-idx="${globalIdx}" data-surah="${a.surah}" data-ayah-in-surah="${a.ayah}" data-page="${a.page}">
        <div class="quran-search-result-loc">${escapeQuranHtml(a.surahName)} — آية ${toArabicDigits(a.ayah)}</div>
        <div class="quran-search-result-text">${highlightArabicText(a.text || "", normQuery, a)}</div>
      </div>`;
  }).join("");

  quranSearchResults.insertAdjacentHTML("beforeend", html);
  quranSearchRenderedCount = end;

  Array.from(quranSearchResults.querySelectorAll(".quran-search-result")).slice(start).forEach((row) => {
    wireQuranSearchResultRow(row, normQuery);
  });
}

function wireQuranSearchResultRow(row, normQuery) {
  row.addEventListener("click", () => {
    const surahNumber = parseInt(row.dataset.surah, 10) || null;
    const ayahInSurah = parseInt(row.dataset.ayahInSurah, 10) || null;
    const page = parseInt(row.dataset.page, 10) || null;

    quranSearchInput.value = "";
    quranSearchResults.innerHTML = "";
    quranSearchResultsSummary.style.display = "none";
    closeQuranModal("quranSearchModal");

    if (page && surahNumber && ayahInSurah) {
      quranHighlightAyahKey = `${surahNumber}:${ayahInSurah}`;
      quranHighlightQuery = normQuery;
      quranGoToPage(page, { preserveHighlight: true });
    }
  });
}

// Infinite scroll: once the person scrolls within ~80px of the
// bottom of the fixed-height, internally-scrolling results list (see
// .quran-search-results in styles.css), load the next batch if there
// is one left.
quranSearchResults.addEventListener("scroll", () => {
  if (quranSearchRenderedCount >= quranSearchAllMatches.length) return;
  const nearBottom = quranSearchResults.scrollTop + quranSearchResults.clientHeight >= quranSearchResults.scrollHeight - 80;
  if (nearBottom) appendNextQuranSearchResultsBatch();
});

// -------- bookmarks (multiple, named — localStorage only, guest-friendly) --------
const QURAN_BOOKMARKS_MAX = 100;

// localStorage is user-editable, so every entry is validated before use.
function loadQuranBookmarks() {
  try {
    const raw = localStorage.getItem(QURAN_BOOKMARKS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((b) =>
      b && typeof b.id === "string" && Number.isInteger(b.page) && b.page >= 1 && b.page <= 604
    ).map((b) => ({ ...b, label: String(b.label || `صفحة ${b.page}`).slice(0, 40), context: String(b.context || "") }));
  } catch (e) {
    return [];
  }
}

function saveQuranBookmarks(list) {
  try { localStorage.setItem(QURAN_BOOKMARKS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

function renderQuranBookmarksList() {
  const list = loadQuranBookmarks();
  if (!list.length) {
    quranBookmarksList.innerHTML = '<div class="status">لا توجد علامات محفوظة بعد.</div>';
    return;
  }

  quranBookmarksList.innerHTML = list.map((b) => `
    <div class="quran-bookmark-row" data-id="${escapeQuranHtml(b.id)}">
      <div class="quran-bookmark-info">
        <div class="quran-bookmark-name">${escapeQuranHtml(b.label)}</div>
        <div class="quran-bookmark-loc">صفحة ${toArabicDigits(b.page)}${b.context ? " — " + escapeQuranHtml(b.context) : ""}</div>
      </div>
      <div class="quran-bookmark-actions">
        <button type="button" class="btn small ghost quran-bookmark-go-btn">اذهب</button>
        <button type="button" class="btn small ghost danger quran-bookmark-delete-btn">حذف</button>
      </div>
    </div>`).join("");

  quranBookmarksList.querySelectorAll(".quran-bookmark-go-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".quran-bookmark-row").dataset.id;
      const b = loadQuranBookmarks().find((x) => x.id === id);
      closeQuranModal("quranBookmarksModal");
      if (b) quranGoToPage(b.page);
    });
  });
  quranBookmarksList.querySelectorAll(".quran-bookmark-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".quran-bookmark-row").dataset.id;
      saveQuranBookmarks(loadQuranBookmarks().filter((x) => x.id !== id));
      renderQuranBookmarksList();
    });
  });
}

quranAddBookmarkBtn.addEventListener("click", () => {
  const label = quranBookmarkNameInput.value.replace(/\s+/g, " ").trim().slice(0, 40) || `صفحة ${currentQuranPage}`;
  const list = loadQuranBookmarks().slice(0, QURAN_BOOKMARKS_MAX - 1);
  list.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    page: currentQuranPage,
    context: quranCurrentPageContextLabel,
    createdAt: Date.now(),
  });
  saveQuranBookmarks(list);
  quranBookmarkNameInput.value = "";
  renderQuranBookmarksList();
});

// -------- reciter choice --------
function renderQuranReciterList() {
  quranReciterList.innerHTML = QURAN_RECITERS.map((r) => `
    <div class="quran-reciter-row${r.id === quranSelectedReciter ? " selected" : ""}" data-id="${r.id}">
      <span>${escapeQuranHtml(r.name)}${QuranAudioStore.count(r.folder) ? ` <span class="dl-size">📥 ${toArabicDigits(QuranAudioStore.count(r.folder))}</span>` : ""}</span>
      ${r.id === quranSelectedReciter ? '<span class="quran-reciter-check">✓</span>' : ""}
    </div>`).join("");

  quranReciterList.querySelectorAll(".quran-reciter-row").forEach((row) => {
    row.addEventListener("click", () => {
      quranSelectedReciter = row.dataset.id;
      try { localStorage.setItem(QURAN_RECITER_KEY, quranSelectedReciter); } catch (e) { /* ignore */ }
      renderQuranReciterList();
    });
  });
}

// -------- per-ayah audio (tap a single ayah while reading) --------
let quranAudioEl = null;
let quranPlayingAyahKey = null; // "surah:ayah"

function quranStopAudio() {
  if (quranAudioEl) {
    quranAudioEl.pause();
    quranAudioEl.currentTime = 0;
    quranAudioEl = null;
  }
  quranPlayingAyahKey = null;
  updateQuranAudioButtons();
}

// An ayah's 🔊 shows ⏸️ while that single ayah is what the player is
// reciting (tapping an ayah plays it through the same player as a page
// or range, so it gets pause / stop / 🔁 repeat too).
function updateQuranAudioButtons() {
  const singleKey = (typeof quranRangeQueue !== "undefined" && quranRangeQueue.length === 1) ? quranRangePlayingKey : null;
  const pageBtn = document.getElementById("quranPageListenBtn");
  const anyPlaying = typeof quranRangeQueue !== "undefined" && quranRangeQueue.length > 0;
  if (pageBtn && pageBtn.classList.contains("playing") !== anyPlaying) {
    // only when it changes: re-creating it under a finger would lose the tap
    pageBtn.classList.toggle("playing", anyPlaying);
    pageBtn.innerHTML = anyPlaying ? '<span class="eq"><i></i><i></i><i></i></span>' : "🎧";
    pageBtn.setAttribute("aria-label", anyPlaying ? "مشغّل التلاوة" : "استمع لهذه الصفحة");
  }
  quranPageContent.querySelectorAll(".quran-ayah-audio-btn").forEach((btn) => {
    const key = `${btn.dataset.surah}:${btn.dataset.ayah}`;
    const isPlaying = key === quranPlayingAyahKey || key === singleKey;
    btn.textContent = isPlaying ? "⏸️" : "🔊";
    btn.classList.toggle("playing", isPlaying);
  });
}

// Delegated (rather than per-button) since the page's whole content
// is re-rendered on every navigation.
quranPageContent.addEventListener("click", async (e) => {
  const btn = e.target.closest(".quran-ayah-audio-btn");
  if (!btn || btn.disabled) return;
  const key = `${btn.dataset.surah}:${btn.dataset.ayah}`;

  // Tapping the ayah that's playing stops it.
  if (quranRangeQueue.length === 1 && quranRangePlayingKey === key) {
    quranRangeStop();
    return;
  }
  const surah = parseInt(btn.dataset.surah, 10);
  const ayah = parseInt(btn.dataset.ayah, 10);
  if (!surah || !ayah) return;
  btn.disabled = true;
  try {
    await quranStartRangePlayback(surah, ayah, surah, ayah, 1, 1);
  } finally {
    btn.disabled = false;
  }
});

// -------- listen to a range (surah+ayah to surah+ayah, continuous) --------
async function populateQuranListenSurahSelects() {
  try {
    const catalog = await fetchSurahCatalog();
    if (!catalog || !catalog.length) throw new Error("empty catalog");
    const opts = catalog.map((s) => `<option value="${s.number}">${s.number}. ${escapeQuranHtml(s.name)}</option>`).join("");
    quranListenFromSurah.innerHTML = opts;
    quranListenToSurah.innerHTML = opts;
    return true;
  } catch (e) {
    return false;
  }
}

let quranCatalogByNumber = null;
async function getQuranCatalogMap() {
  if (quranCatalogByNumber) return quranCatalogByNumber;
  const catalog = await fetchSurahCatalog();
  quranCatalogByNumber = new Map(catalog.map((s) => [s.number, s]));
  return quranCatalogByNumber;
}

function compareSurahAyah(s1, a1, s2, a2) {
  return s1 !== s2 ? s1 - s2 : a1 - a2;
}

async function buildQuranRangeQueue(fromSurah, fromAyah, toSurah, toAyah) {
  const catalogMap = await getQuranCatalogMap();
  const queue = [];
  let s = fromSurah, a = fromAyah, guard = 0;
  while (guard++ < 6300) { // hard ceiling — total ayahs in the whole Quran
    queue.push({ surah: s, ayah: a });
    if (s === toSurah && a === toAyah) break;
    const info = catalogMap.get(s);
    if (!info) break;
    if (a < info.numberOfAyahs) {
      a += 1;
    } else {
      s += 1;
      a = 1;
      if (!catalogMap.has(s)) break; // ran past surah 114
    }
  }
  return queue;
}

let quranRangeQueue = [];
let quranRangeIndex = -1;
let quranRangeFailures = 0; // consecutive failed ayahs — stops the loop when offline
let quranRangeAudioEl = null;
let quranRangePaused = false;
// Repetition: each ayah plays quranRepeatEach times in a row; the whole
// range plays quranRepeatRange times (0 = endlessly, until ⏹️).
let quranRepeatEach = 1;
let quranRepeatRange = 1;
let quranRangeAyahRep = 1; // which repetition of the current ayah is playing
let quranRangeLoop = 1;    // which pass over the whole range
let quranRangePlayingKey = null; // "surah:ayah" highlighted on the page
let quranRangeIsCurrentPage = false; // playing came from 🎧 (this page)
const QURAN_REPEAT_KEY = "qf_quran_repeat";

// ---- playback positions ----
// A position is { index, rep, loop }: which ayah of the queue, which of
// its repetitions, which pass over the whole queue. quranNextPos() is the
// single place that knows the order (each-ayah repeats, then the next
// ayah, then the next pass — or the end).
function quranNextPos(pos) {
  if (!pos) return quranRangeQueue.length ? { index: 0, rep: 1, loop: 1 } : null;
  if (pos.rep < quranRepeatEach) return { index: pos.index, rep: pos.rep + 1, loop: pos.loop };
  if (pos.index + 1 < quranRangeQueue.length) return { index: pos.index + 1, rep: 1, loop: pos.loop };
  if (quranRepeatRange === 0 || pos.loop < quranRepeatRange) return { index: 0, rep: 1, loop: pos.loop + 1 };
  return null;
}
const quranPosKey = (p) => `${p.loop}:${p.index}:${p.rep}`;

// ---- playback speed (🐢/🐇 on the mini player) ----
const QURAN_SPEEDS = [0.75, 1, 1.25, 1.5];
const QURAN_SPEED_KEY = "qf_quran_speed";
let quranPlaybackRate = 1;
try {
  const savedSpeed = parseFloat(localStorage.getItem(QURAN_SPEED_KEY));
  if (QURAN_SPEEDS.includes(savedSpeed)) quranPlaybackRate = savedSpeed;
} catch (e) { /* ignore */ }

function quranApplyRate(el) {
  if (!el) return;
  el.defaultPlaybackRate = quranPlaybackRate; // survives a new src / load()
  el.playbackRate = quranPlaybackRate;
  try { el.preservesPitch = true; } catch (e) { /* older browsers */ }
}

// ---- audio elements: the downloaded copy when there is one ----
function quranReciterFolder() {
  return (QURAN_RECITERS.find((r) => r.id === quranSelectedReciter) || QURAN_RECITERS[0]).folder;
}

// Quiz / challenge audio plays single ayah files, so a one-file-per-surah
// reciter falls back to the default reciter there.
function quranQuizAudioFolder() {
  const r = QURAN_RECITERS.find((x) => x.id === quranSelectedReciter) || QURAN_RECITERS[0];
  return r.surahServer ? QURAN_RECITERS[0].folder : r.folder;
}

function quranClipFor(timings, ayah) {
  const row = timings && timings[ayah - 1];
  if (!row) return null;
  return { start: row[0] / 1000, end: row[1] / 1000, last: ayah === timings.length };
}

let quranCreateAudio = async function (step) {
  const folder = quranReciterFolder();
  let timings = null, clip = null;
  if (QuranAudioStore.isSurahSource(folder)) {
    timings = await QuranAudioStore.getTimings(folder, step.surah); // throws offline if never saved
    clip = quranClipFor(timings, step.ayah);
    if (!clip) throw new Error("no timing for ayah");
  }
  const src = await QuranAudioStore.resolve(folder, step.surah, step.ayah);
  const el = new Audio();
  el.preload = "auto";
  el._itqan = { url: src.url, local: src.local, folder, surah: step.surah, ayah: step.ayah, timings, clip };
  quranApplyRate(el);
  if (clip) el.addEventListener("loadedmetadata", () => { el.currentTime = el._itqan.clip.start; }, { once: true });
  el.src = src.url;
  el.load();
  return el;
};

function quranDisposeAudio(el) {
  if (!el) return;
  el.onended = null;
  el.onerror = null;
  try { el.pause(); } catch (e) { /* ignore */ }
  const url = el._itqan && el._itqan.url;
  el.removeAttribute("src");
  try { el.load(); } catch (e) { /* ignore */ }
  QuranAudioStore.release(url);
}

// Sliding preload window — while one ayah plays, the next
// QURAN_RANGE_PRELOAD_AHEAD positions are already loading, so each can
// start the instant the previous one ends (see the hand-over below).
const QURAN_RANGE_PRELOAD_AHEAD = 3;
let quranRangePreloadCache = new Map(); // posKey -> Promise<Audio>

function quranRangeClearPreload() {
  quranRangePreloadCache.forEach((p) => p.then(quranDisposeAudio, () => {}));
  quranRangePreloadCache.clear();
}

function quranRefreshPreload() {
  const wanted = new Map();
  let p = quranCurrentPos;
  const surahFiles = QuranAudioStore.isSurahSource(quranReciterFolder());
  const curSurah = quranCurrentPos ? quranRangeQueue[quranCurrentPos.index]?.surah : null;
  for (let i = 0; i < (surahFiles ? 400 : QURAN_RANGE_PRELOAD_AHEAD); i++) {
    p = quranNextPos(p);
    if (!p) break;
    // one file per surah: the same element keeps playing inside a surah,
    // so only the first ayah of the NEXT surah file needs preparing
    if (surahFiles) {
      if (quranRangeQueue[p.index]?.surah === curSurah) continue;
      wanted.set(quranPosKey(p), p);
      break;
    }
    wanted.set(quranPosKey(p), p);
  }
  for (const [key, promise] of quranRangePreloadCache) {
    if (!wanted.has(key)) { promise.then(quranDisposeAudio, () => {}); quranRangePreloadCache.delete(key); }
  }
  wanted.forEach((pos, key) => {
    if (quranRangePreloadCache.has(key)) return;
    const step = quranRangeQueue[pos.index];
    if (step) quranRangePreloadCache.set(key, quranCreateAudio(step));
  });
}

// ---- which page each ayah is on (for following along in the reader) ----
let quranAyahPageMapPromise = null;
function getQuranAyahPageMap() {
  if (!quranAyahPageMapPromise) {
    quranAyahPageMapPromise = fetchLocalAyahIndex() // reused from app.js
      .then((list) => new Map(list.map((a) => [`${a.surah}:${a.ayah}`, { page: a.page, endPage: a.endPage || a.page }])))
      .catch((e) => { quranAyahPageMapPromise = null; return new Map(); });
  }
  return quranAyahPageMapPromise;
}

function applyQuranPlayingHighlight() {
  updateQuranAudioButtons();
  quranPageContent.querySelectorAll(".quran-ayah-playing").forEach((el) => el.classList.remove("quran-ayah-playing"));
  if (!quranRangePlayingKey) return;
  quranPageContent.querySelectorAll(`.quran-word[data-k="${quranRangePlayingKey}"]`)
    .forEach((el) => el.classList.add("quran-ayah-playing"));
}

// Turns the reader's page so the recited ayah stays in view — but only
// while the person is "following along" (they're on the page of the
// previous ayah, or it's the first ayah). If they browsed to another
// page meanwhile, the recitation doesn't yank them back.
async function quranRangeFollow(step, previousStep) {
  const pages = await getQuranAyahPageMap();
  const here = pages.get(`${step.surah}:${step.ayah}`);
  if (!here) return;
  let following = !previousStep;
  if (previousStep) {
    const prev = pages.get(`${previousStep.surah}:${previousStep.ayah}`);
    following = !!prev && currentQuranPage >= prev.page && currentQuranPage <= prev.endPage;
  }
  const alreadyVisible = currentQuranPage >= here.page && currentQuranPage <= here.endPage;
  if (following && !alreadyVisible) await quranGoToPage(here.page);
}

function quranRangeStatusText(step, surahName) {
  const shortName = String(surahName).replace(/^سُورَةُ\s*/, ""); // "سُورَةُ ٱلْبَقَرَةِ" → "ٱلْبَقَرَةِ"
  let text = `🎧 ${shortName} ${toArabicDigits(step.ayah)}`;
  if (quranRangeQueue.length > 1) {
    text += ` (${toArabicDigits(quranRangeIndex + 1)}/${toArabicDigits(quranRangeQueue.length)})`;
  }
  if (quranRepeatEach > 1) text += ` · 🔁 ${toArabicDigits(quranRangeAyahRep)}/${toArabicDigits(quranRepeatEach)}`;
  if (quranRepeatRange !== 1) {
    // one ayah: "تكرار ٢/٥"; a page or range: "دورة ٢/٥" (a full pass)
    const word = quranRangeQueue.length === 1 ? "تكرار" : "دورة";
    text += quranRepeatRange === 0
      ? ` · ${word} ${toArabicDigits(quranRangeLoop)}`
      : ` · ${word} ${toArabicDigits(quranRangeLoop)}/${toArabicDigits(quranRepeatRange)}`;
  }
  return text;
}

// ---- playing, and the hand-over between ayahs ----
// Each ayah is its own file, so a range is a chain of files. To make it
// sound like one continuous recitation, the next file is started a
// moment BEFORE the current one ends (QURAN_GAPLESS_LEAD_S — the last
// fraction of a second of an ayah file is silence), instead of waiting
// for "ended" and then starting a new file, which left an audible gap.
// The hand-over only happens early when the next file is already
// buffered; otherwise it waits for "ended" as before.
const QURAN_GAPLESS_LEAD_S = 0.18;
let quranCurrentPos = null;
let quranRangeTailEls = new Set(); // previous ayahs still finishing their last milliseconds
let quranHandoffTimer = null;
let quranHandingOff = false;
let quranPlaySession = 0;          // bumps on stop/restart — stale async work checks it

function quranStartHandoffWatch() {
  if (quranHandoffTimer) return;
  quranHandoffTimer = setInterval(() => {
    const el = quranRangeAudioEl;
    if (!el || quranRangePaused || quranHandingOff || el.paused) return;
    const clip = el._itqan && el._itqan.clip;
    if (clip) {
      if (el.currentTime >= clip.end - 0.03) quranClipBoundary(el);
      return;
    }
    const d = el.duration;
    if (!isFinite(d) || d <= 0) return;
    if ((d - el.currentTime) / (el.playbackRate || 1) <= QURAN_GAPLESS_LEAD_S) quranAdvanceFrom(el, false);
  }, 40);
}
function quranStopHandoffWatch() {
  if (quranHandoffTimer) { clearInterval(quranHandoffTimer); quranHandoffTimer = null; }
}

// A one-file-per-surah ayah reached its end time. Inside the same surah
// the SAME element simply carries on (or jumps back for a repeat) — no new
// file, no gap at all; a new surah goes through the normal hand-over.
function quranClipBoundary(el) {
  if (el !== quranRangeAudioEl || quranHandingOff || !quranRangeQueue.length) return;
  const next = quranNextPos(quranCurrentPos);
  if (!next) { el.pause(); quranRangeFinished(); return; }
  const cur = quranRangeQueue[quranCurrentPos.index];
  const nxt = quranRangeQueue[next.index];
  const clip = nxt && nxt.surah === cur.surah ? quranClipFor(el._itqan.timings, nxt.ayah) : null;
  if (!clip) { quranAdvanceFrom(el, true); return; }
  const contiguous = Math.abs(clip.start - el._itqan.clip.end) < 0.06;
  el._itqan.clip = clip;
  el._itqan.ayah = nxt.ayah;
  if (!contiguous) el.currentTime = clip.start;
  quranMarkPosition(next, cur);
  quranRefreshPreload();
}

async function quranAdvanceFrom(el, ended) {
  if (el !== quranRangeAudioEl || quranHandingOff || !quranRangeQueue.length) return;
  const next = quranNextPos(quranCurrentPos);
  if (!next) {
    if (ended) quranRangeFinished();
    return; // the last ayah: let it play out
  }
  const pending = quranRangePreloadCache.get(quranPosKey(next));
  if (!ended) {
    // early hand-over only when the next file can start right now
    const ready = pending && pending._resolved && pending._resolved.readyState >= 3;
    if (!ready) return;
  }
  quranHandingOff = true;
  try { await quranPlayPos(next); } finally { quranHandingOff = false; }
}

// On a connection that's "up" but carries no data, play() can wait forever
// instead of failing — give up after a while so the person gets told.
function quranPlayWithTimeout(el) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(t); el.removeEventListener("error", onErr); fn(v); } };
    const onErr = () => finish(reject, new Error("audio error"));
    const t = setTimeout(() => finish(reject, new Error("audio timeout")), el._itqan && el._itqan.local ? 8000 : 12000);
    el.addEventListener("error", onErr);
    el.play().then(() => finish(resolve), (e) => finish(reject, e));
  });
}

// Status text, the highlighted ayah, and the page following along.
function quranMarkPosition(pos, previousStep) {
  const step = quranRangeQueue[pos.index];
  if (!step) return;
  quranCurrentPos = pos;
  quranRangeIndex = pos.index;
  quranRangeAyahRep = pos.rep;
  quranRangeLoop = pos.loop;
  quranRangePlayingKey = `${step.surah}:${step.ayah}`;
  getQuranCatalogMap().then((m) => {
    if (quranCurrentPos === pos) quranListenNowPlaying.textContent = quranRangeStatusText(step, m.get(step.surah)?.name || step.surah);
  });
  applyQuranPlayingHighlight();
  quranRangeFollow(step, previousStep).then(applyQuranPlayingHighlight);
}

async function quranPlayPos(pos) {
  const session = quranPlaySession;
  const step = quranRangeQueue[pos.index];
  if (!step) return;
  const previousStep = quranCurrentPos ? quranRangeQueue[quranCurrentPos.index] : null;
  quranCurrentPos = pos;
  quranRangeIndex = pos.index;
  quranRangeAyahRep = pos.rep;
  quranRangeLoop = pos.loop;

  // the audio element — from the preload window, or made now
  const key = quranPosKey(pos);
  let elPromise = quranRangePreloadCache.get(key);
  quranRangePreloadCache.delete(key);
  if (!elPromise) elPromise = quranCreateAudio(step);
  let el;
  try { el = await elPromise; } catch (e) { el = null; }
  if (session !== quranPlaySession) { quranDisposeAudio(el); return; }

  // Couldn't even prepare it (e.g. a surah reciter's verse times were
  // never saved and there's no internet): say so instead of failing quietly.
  // Streaming is otherwise always TRIED — the audio site may be reachable
  // even when the app's own server isn't; failures are handled below.
  if (!el) {
    quranDisposeAudio(el);
    quranShowOfflineAudioMessage();
    return;
  }

  const previous = quranRangeAudioEl;
  quranRangeAudioEl = el;
  quranApplyRate(el);
  el.onended = () => {
    if (el === quranRangeAudioEl) quranAdvanceFrom(el, true);
    else { quranRangeTailEls.delete(el); quranDisposeAudio(el); }
  };
  if (previous && previous !== el) {
    // let the previous ayah finish its last few milliseconds by itself
    quranRangeTailEls.add(previous);
    previous.onended = () => { quranRangeTailEls.delete(previous); quranDisposeAudio(previous); };
    setTimeout(() => { if (quranRangeTailEls.delete(previous)) quranDisposeAudio(previous); }, 1500);
  }

  quranMarkPosition(pos, previousStep);

  try {
    if (!quranRangePaused) await quranPlayWithTimeout(el);
    if (session !== quranPlaySession) return;
    quranRangeFailures = 0;
    quranStartHandoffWatch();
    quranRefreshPreload();
    quranMaybeOfferDownload();
  } catch (e) {
    if (session !== quranPlaySession) return;
    if (el._itqan.local) QuranAudioStore.forget(el._itqan.folder, step.surah, step.ayah); // file vanished
    // a stream that won't load may simply mean "no internet" — check for real
    if (!el._itqan.local && typeof Net !== "undefined") await Net.probeNow();
    if (session !== quranPlaySession) return;
    if (!QuranAudioStore.isOnline()) { quranShowOfflineAudioMessage(); return; }
    quranRangeFailures += 1;
    if (quranRangeFailures >= 3) {
      quranListenNowPlaying.textContent = "تعذّر تشغيل التلاوة. تحقق من اتصالك بالإنترنت.";
      quranRangeFailures = 0;
      quranRangePaused = true;
      quranListenPauseBtn.textContent = "▶️";
      quranListenPauseBtn.setAttribute("aria-label", "متابعة");
      return;
    }
    quranListenNowPlaying.textContent = "تعذّر تشغيل أحد المقاطع، جارٍ المتابعة...";
    quranAdvanceFrom(el, true); // skip the failed ayah and continue
  }
}

// Every preload promise remembers its element once ready, so the
// hand-over check above can look at it synchronously.
const _quranCreateAudio = quranCreateAudio;
quranCreateAudio = function (step) {
  const p = _quranCreateAudio(step);
  p.then((el) => { p._resolved = el; }, () => {});
  return p;
};

function quranShowOfflineAudioMessage() {
  const session = quranPlaySession;
  quranRangeStop({ keepPlayer: true });
  quranShowMiniPlayer(true);
  quranSetPlayerOpen(true);
  quranListenNowPlaying.textContent = "📴 أنت غير متصل بالإنترنت — الاستماع يحتاج اتصالًا، أو حمّل التلاوة مسبقًا (⋮ ← 📥).";
  setTimeout(() => {
    if (session + 1 === quranPlaySession && !quranRangeQueue.length) quranShowMiniPlayer(false);
  }, 7000);
}

// ---- 🔁 on the mini player: repeat whatever is playing ----
// Cycles how many times the whole queue plays — for a tapped ayah that
// repeats the ayah, for 🎧 the page, for the dialog's range the range.
// Changes apply immediately, mid-recitation.
const QURAN_REPEAT_STEPS = [1, 2, 3, 5, 10, 0]; // 0 = endlessly, until ⏹️
const quranListenRepeatBtn = document.getElementById("quranListenRepeatBtn");

function updateQuranRepeatButton() {
  if (!quranListenRepeatBtn) return;
  const n = quranRepeatRange;
  quranListenRepeatBtn.classList.toggle("on", n !== 1);
  quranListenRepeatBtn.textContent = n === 1 ? "🔁" : (n === 0 ? "🔁 ∞" : `🔁 ${toArabicDigits(n)}`);
  quranListenRepeatBtn.setAttribute("aria-label", n === 1 ? "التكرار: مرة واحدة"
    : n === 0 ? "التكرار: بلا توقف" : `التكرار: ${toArabicDigits(n)} مرات`);
}

if (quranListenRepeatBtn) {
  quranListenRepeatBtn.addEventListener("click", () => {
    const i = QURAN_REPEAT_STEPS.indexOf(quranRepeatRange);
    quranRepeatRange = QURAN_REPEAT_STEPS[(i + 1) % QURAN_REPEAT_STEPS.length];
    // already past the new count (e.g. on pass 3, switched to ×2): finish this pass
    if (quranRepeatRange !== 0 && quranRangeLoop > quranRepeatRange) {
      quranRangeLoop = quranRepeatRange;
      if (quranCurrentPos) quranCurrentPos = { ...quranCurrentPos, loop: quranRepeatRange };
    }
    updateQuranRepeatButton();
    const step = quranRangeQueue[quranRangeIndex];
    if (step) {
      getQuranCatalogMap().then((m) => {
        if (quranRangeQueue[quranRangeIndex] === step) {
          quranListenNowPlaying.textContent = quranRangeStatusText(step, m.get(step.surah)?.name || step.surah);
        }
      });
      quranRefreshPreload(); // the next pass may now wrap around
    }
  });
}

// ---- speed button ----
const quranListenSpeedBtn = document.getElementById("quranListenSpeedBtn");
function updateQuranSpeedButton() {
  if (!quranListenSpeedBtn) return;
  quranListenSpeedBtn.textContent = "×" + toArabicDigits(String(quranPlaybackRate));
  quranListenSpeedBtn.classList.toggle("on", quranPlaybackRate !== 1);
  quranListenSpeedBtn.setAttribute("aria-label", `سرعة التلاوة: ${quranPlaybackRate}`);
}
if (quranListenSpeedBtn) {
  updateQuranSpeedButton();
  quranListenSpeedBtn.addEventListener("click", () => {
    const i = QURAN_SPEEDS.indexOf(quranPlaybackRate);
    quranPlaybackRate = QURAN_SPEEDS[(i + 1) % QURAN_SPEEDS.length];
    try { localStorage.setItem(QURAN_SPEED_KEY, String(quranPlaybackRate)); } catch (e) { /* ignore */ }
    updateQuranSpeedButton();
    quranApplyRate(quranRangeAudioEl);
    quranRangeTailEls.forEach(quranApplyRate);
    quranRangePreloadCache.forEach((p) => p.then(quranApplyRate, () => {}));
  });
}

// ---- 📥 offline recitation ----
function quranCurrentReciter() {
  return QURAN_RECITERS.find((r) => r.id === quranSelectedReciter) || QURAN_RECITERS[0];
}
function quranFormatMB(mb) {
  if (mb >= 1000) return `${toArabicDigits((mb / 1000).toFixed(1))} غ.ب`;
  return `${toArabicDigits(String(Math.max(1, Math.round(mb))))} م.ب`;
}

// The ayahs of the page / surah / juz open in the reader, or of the whole Quran.
async function quranAyahsFor(scope) {
  const all = await fetchLocalAyahIndex(); // [{surah, ayah, page, endPage}] — reused from app.js
  if (scope === "all") return all;
  if (scope === "page") return all.filter((a) => currentQuranPage >= a.page && currentQuranPage <= (a.endPage || a.page));
  if (scope === "surah") {
    const s = currentPageSurahNumber();
    return all.filter((a) => a.surah === s);
  }
  if (scope === "juz") {
    const juz = (typeof juzForPage === "function") ? juzForPage(currentQuranPage) : null;
    const r = juz && typeof quranQuizRangeForJuz === "function" ? quranQuizRangeForJuz(juz) : null;
    if (!r) return [];
    return all.filter((a) => a.page >= r.minP && a.page <= r.maxP);
  }
  return [];
}

// How many ayahs' worth of audio still needs downloading — for a
// one-file-per-surah reciter that's every ayah of each surah touched.
async function quranMissingAyahCount(folder, items) {
  const missing = items.filter((a) => !QuranAudioStore.has(folder, a.surah, a.ayah));
  if (!QuranAudioStore.isSurahSource(folder)) return missing.length;
  const cat = await getQuranCatalogMap();
  return [...new Set(missing.map((a) => a.surah))].reduce((n, sNum) => n + (cat.get(sNum)?.numberOfAyahs || 0), 0);
}

let quranDlRunning = false;
let quranDlCancel = false;

async function renderQuranDownloads() {
  const r = quranCurrentReciter();
  document.getElementById("dlReciterName").textContent = r.name;
  const n = QuranAudioStore.count(r.folder);
  const bySurah = QuranAudioStore.isSurahSource(r.folder); // counted in whole surahs
  document.getElementById("dlSummary").textContent = !n
    ? "لم يُحمَّل شيء بصوت هذا القارئ بعد."
    : bySurah
      ? `محمّل على هذا الجهاز: ${toArabicDigits(n)} من ١١٤ سورة.`
      : `محمّل على هذا الجهاز: ${toArabicDigits(n)} من ٦٢٣٦ آية (≈ ${quranFormatMB(QuranAudioStore.estimateMB(r.folder, n))}).`;
  document.getElementById("dlDeleteBtn").style.display = n ? "" : "none";
  const msg = document.getElementById("dlMessage");
  if (!QuranAudioStore.canDownload()) {
    msg.textContent = QuranAudioStore.isNative
      ? "التحميل غير متاح في هذه النسخة من التطبيق."
      : "متصفحك لا يسمح بتحميل التلاوة من موقع التلاوات — هذه الميزة متاحة في تطبيق إتقان على الهاتف.";
  }
  for (const btn of document.querySelectorAll("#dlChoices [data-dl]")) {
    const items = await quranAyahsFor(btn.dataset.dl).catch(() => []);
    const missing = await quranMissingAyahCount(r.folder, items);
    const size = btn.querySelector(".dl-size");
    btn.classList.toggle("done", items.length > 0 && missing === 0);
    size.textContent = !items.length ? "" : missing === 0 ? "✓ محمّلة" : `≈ ${quranFormatMB(QuranAudioStore.estimateMB(r.folder, missing))}`;
    btn.disabled = quranDlRunning || !QuranAudioStore.canDownload() || !items.length || missing === 0;
  }
}

// Downloads `items` for the current reciter, showing progress in the
// 📥 dialog (opened if needed).
async function quranDownloadAyahs(items, label) {
  if (quranDlRunning) return;
  const r = quranCurrentReciter();
  quranDlRunning = true;
  quranDlCancel = false;
  const prog = document.getElementById("dlProgress");
  const bar = document.getElementById("dlProgressBar");
  const text = document.getElementById("dlProgressText");
  const msg = document.getElementById("dlMessage");
  msg.textContent = "";
  prog.style.display = "flex";
  renderQuranDownloads();
  const result = await QuranAudioStore.downloadMany(r.folder, items, (done, total, failed) => {
    bar.style.width = (total ? (done / total) * 100 : 100) + "%";
    text.textContent = `📥 ${label}: ${toArabicDigits(done)} / ${toArabicDigits(total)}` + (failed ? ` · تعذّر ${toArabicDigits(failed)}` : "");
  }, () => quranDlCancel);
  quranDlRunning = false;
  prog.style.display = "none";
  if (result.error === "web_blocked") {
    msg.textContent = "متصفحك لا يسمح بتحميل التلاوة من موقع التلاوات — هذه الميزة متاحة في تطبيق إتقان على الهاتف.";
  } else if (result.error === "offline") {
    msg.textContent = "📴 انقطع الاتصال بالإنترنت — حمّلنا ما استطعنا، أكمل لاحقًا.";
  } else if (result.cancelled) {
    msg.textContent = "أُوقف التحميل. ما حُمِّل يبقى محفوظًا.";
  } else if (result.failed) {
    msg.textContent = `تم، لكن تعذّر تحميل ${toArabicDigits(result.failed)} آية — أعد المحاولة لإكمالها.`;
  } else {
    msg.textContent = `✅ تم تحميل ${label} — يمكنك الاستماع إليها دون إنترنت.`;
  }
  renderQuranDownloads();
}

const QURAN_DL_LABELS = { page: "هذه الصفحة", surah: "هذه السورة", juz: "هذا الجزء", all: "المصحف كاملًا" };
document.querySelectorAll("#dlChoices [data-dl]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const scope = btn.dataset.dl;
    const items = await quranAyahsFor(scope);
    if (scope === "all") {
      const r = quranCurrentReciter();
      const missing = await quranMissingAyahCount(r.folder, items);
      if (!confirm(`تحميل المصحف كاملًا بصوت ${r.name}: حوالي ${quranFormatMB(QuranAudioStore.estimateMB(r.folder, missing))}. يُفضَّل استخدام شبكة Wi-Fi. هل تريد المتابعة؟`)) return;
    }
    quranDownloadAyahs(items, QURAN_DL_LABELS[scope]);
  });
});
document.getElementById("dlCancelBtn").addEventListener("click", () => { quranDlCancel = true; });
document.getElementById("dlChangeReciterBtn").addEventListener("click", () => {
  closeQuranModal("quranDownloadsModal");
  openQuranModal("quranReciterModal");
});
document.getElementById("dlDeleteBtn").addEventListener("click", async () => {
  const r = quranCurrentReciter();
  if (!confirm(`حذف كل التلاوات المحمّلة بصوت ${r.name} من هذا الجهاز؟`)) return;
  await QuranAudioStore.deleteAll(r.folder);
  document.getElementById("dlMessage").textContent = "🗑 حُذفت التحميلات.";
  renderQuranDownloads();
});

// While listening online, offer (once per surah per visit) to keep the
// surah for offline. «لاحقًا» doesn't say no for good — it just waits:
// the same surah + reciter is offered again from the next day.
const QURAN_DL_SNOOZE_KEY = "qf_audio_offer_snooze"; // { "folder:surah": until-ms }
const QURAN_DL_SNOOZE_MS = 20 * 60 * 60 * 1000;
function quranDlSnoozes() {
  try { return JSON.parse(localStorage.getItem(QURAN_DL_SNOOZE_KEY) || "{}"); } catch (e) { return {}; }
}
const quranDlOffered = new Set();
let quranDlOfferKey = null;
let quranDlOfferItems = null;
async function quranMaybeOfferDownload() {
  if (!QuranAudioStore.canDownload() || quranDlRunning || !quranCurrentPos) return;
  const el = quranRangeAudioEl;
  if (!el || el._itqan.local) return; // already playing from the device
  const step = quranRangeQueue[quranCurrentPos.index];
  const r = quranCurrentReciter();
  const key = `${r.folder}:${step.surah}`;
  if (quranDlOffered.has(key)) return;
  quranDlOffered.add(key);
  if ((quranDlSnoozes()[key] || 0) > Date.now()) return; // «لاحقًا» was chosen recently
  const all = await fetchLocalAyahIndex().catch(() => []);
  const items = all.filter((a) => a.surah === step.surah);
  const missing = items.filter((a) => !QuranAudioStore.has(r.folder, a.surah, a.ayah));
  if (!missing.length) return;
  // don't interrupt someone who is in another dialog
  if (QURAN_MODAL_IDS.some((id) => document.getElementById(id)?.style.display === "flex")) return;
  const name = (await getQuranCatalogMap()).get(step.surah)?.name || "";
  quranDlOfferItems = items;
  quranDlOfferKey = key;
  document.getElementById("dlOfferText").textContent =
    `هل تريد تحميل ${name} بصوت ${r.name} على هذا الجهاز، لتستمع إليها لاحقًا دون إنترنت؟ الحجم التقريبي ${quranFormatMB(QuranAudioStore.estimateMB(r.folder, missing.length))}.`;
  openQuranModal("quranDownloadOfferModal");
}
document.getElementById("dlOfferYesBtn").addEventListener("click", () => {
  closeQuranModal("quranDownloadOfferModal");
  openQuranModal("quranDownloadsModal");
  if (quranDlOfferItems) quranDownloadAyahs(quranDlOfferItems, "السورة");
});
document.getElementById("dlOfferLaterBtn").addEventListener("click", () => {
  if (quranDlOfferKey) {
    const snoozes = quranDlSnoozes();
    const now = Date.now();
    Object.keys(snoozes).forEach((k) => { if (snoozes[k] < now) delete snoozes[k]; }); // tidy old ones
    snoozes[quranDlOfferKey] = now + QURAN_DL_SNOOZE_MS;
    try { localStorage.setItem(QURAN_DL_SNOOZE_KEY, JSON.stringify(snoozes)); } catch (e) { /* ignore */ }
  }
  closeQuranModal("quranDownloadOfferModal");
});

// ---- the floating player: open (panel) / closed (🎧 / round button) ----
const quranPlayerPanel = document.getElementById("quranPlayerPanel");
let quranPlayerOpen = false;
let quranPlayerAutoHide = null;
let quranPlayerOpenedAt = 0; // the tap that opened it (e.g. an ayah's 🔊) must not close it again

function quranPositionPlayer() {
  const nav = document.getElementById("bottomNav");
  const navH = nav ? nav.offsetHeight : 64;
  let bottom = navH + 8;
  // on 📖, float just above the page-turn row so the controls never cover it
  const onQuran = document.getElementById("view-quran")?.classList.contains("active");
  const pageNav = document.querySelector(".quran-page-nav");
  if (onQuran && pageNav) bottom = Math.max(bottom, window.innerHeight - pageNav.getBoundingClientRect().top + 6);
  quranPlayerPanel.style.bottom = bottom + "px";
  document.getElementById("quranPlayerFab").style.bottom = (navH + 12) + "px";
  quranListenPlayer.classList.toggle("on-quran", !!onQuran);
}

// open: show the panel; autoHideMs: close again by itself after that long
function quranSetPlayerOpen(open, autoHideMs) {
  clearTimeout(quranPlayerAutoHide);
  if (open && !quranPlayerOpen) quranPlayerOpenedAt = Date.now();
  quranPlayerOpen = !!open;
  quranListenPlayer.classList.toggle("open", quranPlayerOpen);
  if (quranPlayerOpen) quranPositionPlayer();
  if (quranPlayerOpen && autoHideMs) quranPlayerAutoHide = setTimeout(() => quranSetPlayerOpen(false), autoHideMs);
  updateQuranAudioButtons();
}

function quranShowMiniPlayer(show) {
  quranListenPlayer.style.display = show ? "block" : "none";
  document.body.classList.toggle("quran-player-on", !!show);
  if (show) { quranPositionPlayer(); quranSetPlayerOpen(true, 3500); }
  else quranSetPlayerOpen(false);
}

document.getElementById("quranPlayerHideBtn").addEventListener("click", () => quranSetPlayerOpen(false));
document.getElementById("quranPlayerFab").addEventListener("click", () => quranSetPlayerOpen(true, 6000));
// using the controls keeps it open a little longer
quranPlayerPanel.addEventListener("click", (e) => {
  if (e.target.closest("#quranPlayerHideBtn")) return;
  quranSetPlayerOpen(true, 6000);
});
// a tap anywhere else closes it (the page stays fully readable)
document.addEventListener("click", (e) => {
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (!quranPlayerOpen || Date.now() - quranPlayerOpenedAt < 500) return;
  if (path.includes(quranListenPlayer) || path.some((n) => n.id === "quranPageListenBtn")) return;
  quranSetPlayerOpen(false);
});
window.addEventListener("resize", () => { if (quranPlayerOpen) quranPositionPlayer(); });

function quranRangeFinished() {
  quranRangeStop({ keepPlayer: true });
  quranListenNowPlaying.textContent = "✅ انتهى الاستماع.";
  quranSetPlayerOpen(true);
  setTimeout(() => {
    if (!quranRangeQueue.length && quranListenNowPlaying.textContent === "✅ انتهى الاستماع.") quranShowMiniPlayer(false);
  }, 2500);
}

function quranRangeStop(options) {
  quranPlaySession += 1;
  quranStopHandoffWatch();
  if (quranRangeAudioEl) { quranDisposeAudio(quranRangeAudioEl); quranRangeAudioEl = null; }
  quranRangeTailEls.forEach(quranDisposeAudio);
  quranRangeTailEls.clear();
  quranRangeClearPreload();
  quranCurrentPos = null;
  quranHandingOff = false;
  quranRangeQueue = [];
  quranRangeIndex = -1;
  quranRangeFailures = 0;
  quranRangePaused = false;
  quranRangeAyahRep = 1;
  quranRangeLoop = 1;
  quranRangePlayingKey = null;
  quranRangeIsCurrentPage = false;
  applyQuranPlayingHighlight();
  quranListenPauseBtn.textContent = "⏸️";
  quranListenPauseBtn.setAttribute("aria-label", "إيقاف مؤقت");
  if (!(options && options.keepPlayer)) {
    quranListenNowPlaying.textContent = "";
    quranShowMiniPlayer(false);
  }
}

// Starts playing fromSurah:fromAyah … toSurah:toAyah with the chosen
// repetition. Shared by the dialog and the ⋮ → «استماع لهذه الصفحة» item.
async function quranStartRangePlayback(fromSurah, fromAyah, toSurah, toAyah, repeatEach, repeatRange, opts) {
  quranStopAudio();
  quranRangeStop();
  quranRangeIsCurrentPage = !!(opts && opts.isPage);
  quranRepeatEach = Math.max(1, repeatEach || 1);
  quranRepeatRange = Math.max(0, repeatRange == null ? 1 : repeatRange);
  quranRangeQueue = await buildQuranRangeQueue(fromSurah, fromAyah, toSurah, toAyah);
  quranRangeIndex = -1;
  quranRangeFailures = 0;
  quranRangePaused = false;
  quranRangeLoop = 1;
  updateQuranRepeatButton();
  updateQuranSpeedButton();
  quranListenNowPlaying.textContent = "⏳ جارٍ التحميل...";
  quranShowMiniPlayer(true);
  quranPlayPos(quranNextPos(null));
}

// First and last ayah printed on a Mushaf page (an ayah that started on
// the previous page counts — its end is on this one).
async function quranPageAyahBounds(page) {
  const data = await fetchMushafPageLayout(page);
  const words = (data?.lines || [])
    .filter((l) => l.type === "text")
    .flatMap((l) => l.words || [])
    .map((w) => (w.location || "").split(":").map((n) => parseInt(n, 10)))
    .filter(([sNum, aNum]) => sNum && aNum);
  if (!words.length) return null;
  const [fs, fa] = words[0];
  const [ls, la] = words[words.length - 1];
  return { fromSurah: fs, fromAyah: fa, toSurah: ls, toAyah: la };
}

async function quranListenToCurrentPage() {
  try {
    const b = await quranPageAyahBounds(currentQuranPage);
    if (!b) throw new Error("no ayahs on page");
    await quranStartRangePlayback(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah, 1, 1, { isPage: true });
  } catch (e) {
    alert("تعذّر تحديد آيات هذه الصفحة.");
  }
}

// ---- the dialog ----
function loadQuranRepeatPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(QURAN_REPEAT_KEY) || "null");
    if (saved) {
      if (saved.each != null) quranRepeatEachSelect.value = String(saved.each);
      if (saved.range != null) quranRepeatRangeSelect.value = String(saved.range);
    }
  } catch (e) { /* ignore */ }
}
function saveQuranRepeatPrefs(each, range) {
  try { localStorage.setItem(QURAN_REPEAT_KEY, JSON.stringify({ each, range })); } catch (e) { /* ignore */ }
}
const quranRepeatEachSelect = document.getElementById("quranRepeatEach");
const quranRepeatRangeSelect = document.getElementById("quranRepeatRange");
loadQuranRepeatPrefs();

async function quranFillListenRange(fromSurah, fromAyah, toSurah, toAyah) {
  if (!quranListenSurahsLoaded) {
    quranListenSurahsLoaded = await populateQuranListenSurahSelects();
  }
  quranListenFromSurah.value = String(fromSurah);
  quranListenToSurah.value = String(toSurah);
  quranListenFromAyah.value = String(fromAyah);
  quranListenToAyah.value = String(toAyah);
  await syncListenAyahMax(quranListenFromSurah, quranListenFromAyah);
  await syncListenAyahMax(quranListenToSurah, quranListenToAyah);
}

document.querySelectorAll("[data-listen-preset]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    quranListenError.textContent = "";
    try {
      if (btn.dataset.listenPreset === "page") {
        const b = await quranPageAyahBounds(currentQuranPage);
        if (b) await quranFillListenRange(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah);
      } else {
        const surahNum = currentPageSurahNumber();
        const info = surahNum ? (await getQuranCatalogMap()).get(surahNum) : null;
        if (info) await quranFillListenRange(surahNum, 1, surahNum, info.numberOfAyahs);
      }
    } catch (e) {
      quranListenError.textContent = "تعذّر تحديد الآيات.";
    }
  });
});

quranListenStartBtn.addEventListener("click", async () => {
  quranListenError.textContent = "";
  const fromSurah = parseInt(quranListenFromSurah.value, 10);
  const fromAyah = parseInt(quranListenFromAyah.value, 10);
  const toSurah = parseInt(quranListenToSurah.value, 10);
  const toAyah = parseInt(quranListenToAyah.value, 10);

  if (!fromSurah || !toSurah || !fromAyah || !toAyah) {
    quranListenError.textContent = "الرجاء اختيار سورة ورقم آية للبداية والنهاية.";
    return;
  }
  if (compareSurahAyah(fromSurah, fromAyah, toSurah, toAyah) > 0) {
    quranListenError.textContent = "نقطة البداية يجب أن تكون قبل نقطة النهاية.";
    return;
  }

  const catalogMap = await getQuranCatalogMap();
  const fromInfo = catalogMap.get(fromSurah);
  const toInfo = catalogMap.get(toSurah);
  if (fromInfo && fromAyah > fromInfo.numberOfAyahs) {
    quranListenError.textContent = `سورة البداية تحتوي على ${fromInfo.numberOfAyahs} آية فقط.`;
    return;
  }
  if (toInfo && toAyah > toInfo.numberOfAyahs) {
    quranListenError.textContent = `سورة النهاية تحتوي على ${toInfo.numberOfAyahs} آية فقط.`;
    return;
  }

  const each = parseInt(quranRepeatEachSelect.value, 10) || 1;
  const range = parseInt(quranRepeatRangeSelect.value, 10);
  saveQuranRepeatPrefs(each, Number.isFinite(range) ? range : 1);
  closeQuranModal("quranListenModal"); // the mini player takes over — read along on the page
  await quranStartRangePlayback(fromSurah, fromAyah, toSurah, toAyah, each, Number.isFinite(range) ? range : 1);
});

quranListenPauseBtn.addEventListener("click", () => {
  if (!quranRangeQueue.length) return;
  if (quranRangePaused) {
    quranRangePaused = false;
    quranListenPauseBtn.textContent = "⏸️";
    quranListenPauseBtn.setAttribute("aria-label", "إيقاف مؤقت");
    if (quranRangeAudioEl) {
      quranRangeAudioEl.play().catch(() => quranAdvanceFrom(quranRangeAudioEl, true));
    } else if (quranCurrentPos) {
      quranPlayPos(quranCurrentPos); // playback had stopped on an error — retry the same ayah
    }
  } else {
    quranRangePaused = true;
    if (quranRangeAudioEl) quranRangeAudioEl.pause();
    quranRangeTailEls.forEach((el) => el.pause());
    quranListenPauseBtn.textContent = "▶️";
    quranListenPauseBtn.setAttribute("aria-label", "متابعة");
  }
});

quranListenStopBtn.addEventListener("click", () => quranRangeStop());

// 🎧 next to the page number: recite this page (tap again while this
// page is playing to stop).
// 🎧 next to the page number: recite this page. While something is
// playing it opens / closes the floating player instead (⏹️ is there).
document.getElementById("quranPageListenBtn").addEventListener("click", () => {
  if (quranRangeQueue.length) { quranSetPlayerOpen(!quranPlayerOpen, quranPlayerOpen ? 0 : 6000); return; }
  quranListenToCurrentPage();
});

document.querySelectorAll("[data-listen-action='page']").forEach((btn) => {
  btn.addEventListener("click", () => {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
    quranListenToCurrentPage();
  });
});

// Keeps each "الآية" number input's max in step with its surah, so the
// browser's own spinner can't go past the last ayah.
async function syncListenAyahMax(surahSelect, ayahInput) {
  const n = parseInt(surahSelect.value, 10);
  if (!n) return;
  const info = (await getQuranCatalogMap()).get(n);
  if (!info) return;
  ayahInput.max = String(info.numberOfAyahs);
  const v = parseInt(ayahInput.value, 10);
  if (!v || v < 1) ayahInput.value = 1;
  else if (v > info.numberOfAyahs) ayahInput.value = info.numberOfAyahs;
}
quranListenFromSurah.addEventListener("change", () => syncListenAyahMax(quranListenFromSurah, quranListenFromAyah));
quranListenToSurah.addEventListener("change", () => syncListenAyahMax(quranListenToSurah, quranListenToAyah));

// -------- ⋮ menu + modals --------
const QURAN_MODAL_IDS = ["quranSearchModal", "quranGoToModal", "quranBookmarksModal", "quranReciterModal", "quranListenModal", "quranDownloadsModal", "quranDownloadOfferModal"];

function openQuranModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "flex";
  if (id === "quranBookmarksModal") {
    renderQuranBookmarksList();
  } else if (id === "quranReciterModal") {
    renderQuranReciterList();
  } else if (id === "quranDownloadsModal") {
    if (!quranDlRunning) document.getElementById("dlMessage").textContent = "";
    renderQuranDownloads();
  } else if (id === "quranListenModal") {
    quranListenError.textContent = "";
    if (!quranListenSurahsLoaded) {
      // first opening: start from the page that's open in the reader
      quranPageAyahBounds(currentQuranPage)
        .then((b) => b && quranFillListenRange(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah))
        .catch(() => {});
    }
  }
}

function closeQuranModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "none";
}

QURAN_MODAL_IDS.forEach((id) => {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeQuranModal(id); });
  overlay.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeQuranModal(btn.dataset.closeModal));
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  QURAN_MODAL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.style.display !== "none") closeQuranModal(id);
  });
  if (quranMenuDropdown.style.display === "flex") {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
  }
});

quranMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = quranMenuDropdown.style.display === "flex";
  quranMenuDropdown.style.display = isOpen ? "none" : "flex";
  quranMenuBtn.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (e) => {
  if (quranMenuDropdown.style.display === "flex" && !quranMenuDropdown.contains(e.target) && e.target !== quranMenuBtn) {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
  }
});

quranMenuDropdown.querySelectorAll(".quran-menu-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
    openQuranModal(btn.dataset.modal);
  });
});

quranMenuDropdown.querySelectorAll(".quran-menu-item[data-quiz-action]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
    const action = btn.dataset.quizAction;

    if (action === "page") {
      await startQuizFromQuranRange({ minP: currentQuranPage, maxP: currentQuranPage }, `اختبار صفحة ${currentQuranPage}`);
    } else if (action === "surah") {
      const surahNum = currentPageSurahNumber();
      if (!surahNum) { alert("تعذّر تحديد السورة الحالية."); return; }
      const range = await quranQuizRangeForSurahLocal(surahNum);
      const catalog = await fetchSurahCatalog();
      const name = catalog.find((s) => s.number === surahNum)?.name || `سورة ${surahNum}`;
      await startQuizFromQuranRange(range, `اختبار ${name}`);
    } else if (action === "juz") {
      const juzNum = juzForPage(currentQuranPage);
      await startQuizFromQuranRange(quranQuizRangeForJuz(juzNum), `اختبار الجزء ${juzNum}`);
    } else if (action === "around5") {
      await startQuizFromQuranRange(quranQuizRangeAround(5), `اختبار حول صفحة ${currentQuranPage}`);
    } else if (action === "around10") {
      await startQuizFromQuranRange(quranQuizRangeAround(10), `اختبار حول صفحة ${currentQuranPage}`);
    }
  });
});

// القرآن is now the default landing view (see index.html's initial
// classes) — this actually initializes it the same way clicking the
// 📖 القرآن tab would, since the HTML's static classes alone don't
// run enterQuranTab().
// Opens the tab named in the URL (#profile etc. — see switchView()), so a
// refresh or a shared link lands on the same tab; Quran otherwise.
if (typeof switchView === "function") {
  // #delete-account (the link given to Google Play) opens the profile
  // tab; auth-ui.js then opens the delete dialog.
  const VIEW_ALIASES = { "delete-account": "profile" };
  const initialView = VIEW_ALIASES[location.hash.slice(1)] || location.hash.slice(1);
  const known = typeof appViews === "object" && appViews[initialView];
  switchView(known ? initialView : "quran", { fromHistory: true });
  // Leave the URL alone when it carries Supabase auth parameters (from a
  // password-reset or email-confirmation link: #access_token=…&type=…) —
  // supabase-js reads them and cleans the URL itself; overwriting them
  // here first would silently break those links.
  if (!/[=&]/.test(initialView)) {
    try { history.replaceState({ view: known ? initialView : "quran" }, "", "#" + (known ? initialView : "quran")); } catch (e) { /* ignore */ }
  }
}