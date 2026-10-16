#!/usr/bin/env node
// Sets the cache-busting version in index.html (data-asset-version and
// every ?v= on <link>/<script>) to today's date — run before each deploy:
//   npm run bump
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "index.html");
const today = new Date().toISOString().slice(0, 10);
let html = fs.readFileSync(file, "utf8");
const before = html;
html = html.replace(/data-asset-version="[^"]*"/, `data-asset-version="${today}"`);
html = html.replace(/\?v=[0-9A-Za-z._-]+/g, `?v=${today}`);
if (html === before) {
  console.log(`index.html already at version ${today}`);
} else {
  fs.writeFileSync(file, html, "utf8");
  console.log(`index.html version -> ${today}`);
}
