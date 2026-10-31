#!/usr/bin/env node
// Finds the متشابهات — ayahs whose wording is almost, but not exactly,
// the same as an ayah somewhere else (e.g. البقرة 48 and البقرة 123,
// which swap «شَفَاعَةٌ» and «عَدْلٌ»). Used by the «🔀 المتشابهات»
// question type: the right answer is the ayah, the wrong answers are its
// look-alikes from other places.
//
// Usage (from the repo root, after quran-index/ayahs.json exists):
//
//   node derive-mutashabihat.js
//
// Produces quran-index/mutashabihat.json:
//   { "2:48": ["2:123"], "2:123": ["2:48"], ... }
// — for every ayah that has look-alikes, the list of them (most similar
// first, at most 5). Safe to re-run; it overwrites its own output.
//
// How "look-alike" is decided (no hand-made list needed):
//   • text is compared word by word, ignoring tashkeel / Quranic marks
//     and the different alef / hamza spellings;
//   • both ayahs have at least MIN_WORDS words;
//   • similarity = 2 × (longest common word subsequence) / (total words)
//     is at least MIN_SIMILARITY — i.e. most of the words are the same,
//     in the same order;
//   • the two texts are NOT identical (identical repeated ayahs, like
//     «فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ», can't be told apart, so
//     they're no use as a question).

const fs = require("fs");
const path = require("path");

const MIN_WORDS = 4;
const MIN_SIMILARITY = 0.6;
const MAX_LOOKALIKES = 5;

const ayahs = JSON.parse(fs.readFileSync(path.join(__dirname, "quran-index", "ayahs.json"), "utf8"));

// Same normalisation as app.js's normalizeArabic().
function normalizeArabic(s) {
  return (s || "")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

const items = ayahs.map((a) => {
  const words = normalizeArabic(a.text).split(" ").filter(Boolean);
  return { key: `${a.surah}:${a.ayah}`, words, joined: words.join(" ") };
});

// Candidate pairs: ayahs sharing at least one 3-word sequence (cheap
// pre-filter so not all 19 million pairs need the full comparison).
const byTrigram = new Map();
items.forEach((it, i) => {
  if (it.words.length < MIN_WORDS) return;
  const seen = new Set();
  for (let k = 0; k + 3 <= it.words.length; k++) {
    const tri = it.words.slice(k, k + 3).join(" ");
    if (seen.has(tri)) continue;
    seen.add(tri);
    if (!byTrigram.has(tri)) byTrigram.set(tri, []);
    byTrigram.get(tri).push(i);
  }
});

function lcs(a, b) {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[b.length];
}

const result = new Map(); // key -> [{ key, sim }]
const compared = new Set();
for (const list of byTrigram.values()) {
  if (list.length > 400) continue; // very common phrases («إِنَّ اللَّهَ عَلَىٰ ...») — not informative
  for (let x = 0; x < list.length; x++) {
    for (let y = x + 1; y < list.length; y++) {
      const i = list[x], j = list[y];
      const pairKey = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (compared.has(pairKey)) continue;
      compared.add(pairKey);
      const A = items[i], B = items[j];
      if (A.joined === B.joined) continue;
      const lenRatio = Math.min(A.words.length, B.words.length) / Math.max(A.words.length, B.words.length);
      if (lenRatio < MIN_SIMILARITY) continue;
      const sim = (2 * lcs(A.words, B.words)) / (A.words.length + B.words.length);
      if (sim < MIN_SIMILARITY) continue;
      if (!result.has(A.key)) result.set(A.key, []);
      if (!result.has(B.key)) result.set(B.key, []);
      result.get(A.key).push({ key: B.key, sim });
      result.get(B.key).push({ key: A.key, sim });
    }
  }
}

const out = {};
for (const it of items) {
  const list = result.get(it.key);
  if (!list) continue;
  // drop look-alikes that are identical to each other (one of them is enough)
  const seenText = new Set([it.joined]);
  const picked = [];
  list.sort((p, q) => q.sim - p.sim);
  for (const c of list) {
    const text = items.find((z) => z.key === c.key).joined;
    if (seenText.has(text)) continue;
    seenText.add(text);
    picked.push(c.key);
    if (picked.length >= MAX_LOOKALIKES) break;
  }
  if (picked.length) out[it.key] = picked;
}

const file = path.join(__dirname, "quran-index", "mutashabihat.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log(`✅ ${Object.keys(out).length} ayahs with look-alikes → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
