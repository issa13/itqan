#!/usr/bin/env node
// Builds quran-index/tafsir/NNN.json (one file per surah) for the
// "tap a word" sheet in 📖 القرآن — so meanings and tafsir work offline
// and in the phone app with no internet at all.
//
// Sources (Arabic, from the open spa5k/tafsir_api collection on GitHub):
//   • التفسير الميسر — one short explanation per ayah
//     (tafsir/ar-tafsir-muyassar)
//   • الميسر في غريب القرآن — meanings of the uncommon words of each ayah,
//     written as «﴿word﴾: meaning» (tafsir/al-muyassar-fi-al-gharib)
//
// Usage, from the repo root (needs Node 18+ and internet, run once):
//   node scripts/build-tafsir.js
// or, from an already-downloaded copy laid out as <dir>/<edition>/<n>.json:
//   node scripts/build-tafsir.js --from <dir>
//
// Each output file: {
//   "intro": "about the surah (name, aims)" | "",
//   "t": { "<ayah>": "التفسير الميسر" },
//   "g": { "<ayah>": [["the word / phrase", "its meaning"], ...] }
// }

const fs = require("fs");
const path = require("path");

const BASE = "https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir";
const TAFSIR = "ar-tafsir-muyassar";
const GHARIB = "al-muyassar-fi-al-gharib";
const OUT = path.join(__dirname, "..", "quran-index", "tafsir");

const fromIdx = process.argv.indexOf("--from");
const FROM = fromIdx > 0 ? process.argv[fromIdx + 1] : null;

async function load(edition, surah) {
  if (FROM) return JSON.parse(fs.readFileSync(path.join(FROM, edition, `${surah}.json`), "utf8"));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/${edition}/${surah}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw new Error(`${edition}/${surah}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// The first ayah's entry also carries an introduction to the surah
// («تسمية السورة … من مقاصد السورة …»), usually followed by "[التفسير]".
function splitIntro(text) {
  const marker = text.indexOf("[التفسير]");
  if (marker >= 0) return { intro: text.slice(0, marker).trim(), body: text.slice(marker + "[التفسير]".length).trim() };
  if (!text.startsWith("تسمية السورة")) return { intro: "", body: text.trim() };
  // no marker: the intro is the heading/bullet paragraphs, the tafsir is what follows
  const parts = text.split(/\n\n+/);
  let i = 0;
  while (i < parts.length && (i === 0 || /^(•|من مقاصد السورة|تسمية السورة)/.test(parts[i].trim()) || parts[i].trim().length < 40)) i++;
  return { intro: parts.slice(0, i).join("\n\n").trim(), body: parts.slice(i).join("\n\n").trim() };
}

function parseGharib(text) {
  const out = [];
  for (const part of text.split(/\n\n+/)) {
    const m = part.trim().match(/^﴿([^﴾]+)﴾\s*:?\s*([\s\S]*)$/);
    if (m && m[2].trim()) out.push([m[1].trim(), m[2].replace(/\s+/g, " ").trim()]);
  }
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let bytes = 0;
  for (let s = 1; s <= 114; s++) {
    const [tafsir, gharib] = await Promise.all([load(TAFSIR, s), load(GHARIB, s)]);
    const file = { intro: "", t: {}, g: {} };
    for (const row of tafsir) {
      let text = String(row.text || "");
      if (row.ayah === 1) {
        const split = splitIntro(text);
        file.intro = split.intro;
        text = split.body;
      }
      file.t[row.ayah] = text.trim();
    }
    for (const row of gharib) {
      const list = parseGharib(String(row.text || ""));
      if (list.length) file.g[row.ayah] = list;
    }
    const json = JSON.stringify(file);
    fs.writeFileSync(path.join(OUT, `${String(s).padStart(3, "0")}.json`), json);
    bytes += Buffer.byteLength(json);
    process.stdout.write(`\r${s}/114`);
  }
  console.log(`\n✅ quran-index/tafsir/ — 114 files, ${(bytes / 1048576).toFixed(1)} MB`);
})().catch((e) => { console.error("\n❌", e.message); process.exit(1); });
