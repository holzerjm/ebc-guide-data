/* Red Hat EBC Boston — data.js validation core.
   Dependency-free. Works as a browser global (window.EBCValidate) and as a Node/CommonJS module
   (require("./validate-core.js")). validate.js (browser UI) and publish.mjs (CLI) both use this.

   Parsing a data.js never needs code execution: the file is `window.EBC_DATA = <JSON>;` (admin.js exports
   with JSON.stringify), so parseDataJs reads it with JSON.parse first and only falls back to evaluating the
   text when that fails. The fallback evaluator is sandboxed: node:vm in Node, `new Function` in the browser
   (where the page is already the trust boundary). Callers can pass their own via parseDataJs(text, evaluate). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(function (text) {
      var vm = require("vm"), fake = {};
      vm.runInNewContext(text + "\n;", { window: fake }, { timeout: 2000 });
      return fake;
    });
  } else {
    root.EBCValidate = factory(function (text) {
      var fake = {};
      (new Function("window", text + "\n;return window;"))(fake);
      return fake;
    });
  }
})(typeof self !== "undefined" ? self : this, function (defaultEvaluate) {
  "use strict";
  var PRICES = ["$", "$$", "$$$", "$$$$"];
  var MICHELIN = ["star", "bib", "selected"]; /* item.michelin — the guide shows a badge, a ★ pin and a filter chip */
  var BBOX = { latMin: 42.20, latMax: 42.45, lngMin: -71.25, lngMax: -70.90 };
  var CANON = ["dining", "activities", "hotels", "travel"];
  /* text fields that must never carry raw HTML (they are rendered into the guide) */
  var TEXT_FIELDS = ["name", "kind", "blurb", "hours", "address", "phone", "linksLabel"];

  function isHex(s) { return typeof s === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s); }
  function isHttp(s) { return typeof s === "string" && /^https?:\/\//i.test(s); }
  /* a URL the guide may put into an href: http(s), no whitespace, and none of " ' < > (app.js interpolates
     website into an attribute, so those characters would break out of it) */
  function isUrl(s) { return isHttp(s) && /^\S+$/.test(s) && !/["'<>]/.test(s); }
  function urlProblem(s) {
    if (!isHttp(s)) return "must start with http:// or https://.";
    if (!isUrl(s)) return "must not contain spaces, quotes or angle brackets (\" ' < >).";
    return null;
  }
  function hasAngle(s) { return typeof s === "string" && /[<>]/.test(s); }
  function isIsoDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split("-"), y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  /* ---------- parse a data.js (or JSON) file into the EBC_DATA object ---------- */
  function pickData(j) {
    if (!isObj(j)) return null;
    if (j.sections) return j;
    if (isObj(j.EBC_DATA)) return j.EBC_DATA;
    return null;
  }
  /* strip leading comments and the `window.EBC_DATA =` prefix / trailing `;` so the remainder is plain JSON */
  function jsonBody(text) {
    var t = text.replace(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*/, "");
    var m = /^window\.EBC_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(t);
    return m ? m[1] : t;
  }
  function parseDataJs(text, evaluate) {
    text = (text || "").trim();
    if (!text) return { error: "Nothing to validate — paste or drop a file first." };
    /* 1. safe path: the file is JSON after the prefix (this is what the editor exports) */
    try { var d = pickData(JSON.parse(jsonBody(text))); if (d) return { data: d }; } catch (e0) { /* not plain JSON */ }
    /* 2. fallback: hand-edited data.js with JS syntax (trailing commas, comments, unquoted keys) — sandboxed */
    var ev = evaluate || defaultEvaluate;
    if (ev) {
      try { var w = ev(text); if (w && isObj(w.EBC_DATA)) return { data: w.EBC_DATA }; } catch (e1) { /* fall through */ }
    }
    return { error: "Couldn't read this as a data.js file. It should contain `window.EBC_DATA = { … }`." };
  }

  /* ---------- validation ---------- */
  function validate(D) {
    var errors = [], warnings = [], seen = {}, items = 0;
    function err(where, msg) { errors.push({ where: where, msg: msg }); }
    function warn(where, msg) { warnings.push({ where: where, msg: msg }); }

    if (!isObj(D)) { err("file", "No EBC_DATA object found."); return { errors: errors, warnings: warnings, stats: {} }; }
    if (!D.meta || typeof D.meta.version !== "number") warn("meta", "No numeric meta.version — the editor's conflict detection relies on it.");
    if (!D.center || typeof D.center.lat !== "number" || typeof D.center.lng !== "number") err("center", "center.lat and center.lng must be numbers.");
    if (!isObj(D.sections)) { err("sections", "Missing the sections object."); return { errors: errors, warnings: warnings, stats: {} }; }

    CANON.forEach(function (k) { if (!D.sections[k]) warn("sections", 'expected section "' + k + '" is missing — its tab would be empty.'); });

    Object.keys(D.sections).forEach(function (sk) {
      var sec = D.sections[sk], W = 'section "' + sk + '"';
      if (!isObj(sec)) { err(W, "is not an object."); return; }
      if (!sec.label) warn(W, "missing label.");
      if (!isObj(sec.categories) || !Object.keys(sec.categories).length) err(W, "has no categories.");
      var cats = isObj(sec.categories) ? sec.categories : {};
      Object.keys(cats).forEach(function (ck) {
        var c = cats[ck];
        if (!c || !c.label) warn(W + ' › category "' + ck + '"', "missing label.");
        /* colours are concatenated into style="" attributes by the app — anything but a hex value is rejected here
           as well as neutralised at render time (app.js safeColor), so a crafted colour can never reach the page */
        if (!c || !isHex(c.color)) err(W + ' › category "' + ck + '"', 'color "' + (c && c.color) + '" is not a hex value like #2f7ed8.');
      });
      if (!Array.isArray(sec.items)) { err(W, "items is not an array."); return; }

      sec.items.forEach(function (it, idx) {
        items++;
        if (!isObj(it)) { err(sk + " › item #" + idx, "entry is not an object."); return; }
        var nm = it.name || it.id || "(unnamed)", W2 = sk + " › " + nm;
        if (!it.id) err(W2, "missing id.");
        else {
          if (seen[it.id]) err(W2, 'duplicate id "' + it.id + '" (already used in ' + seen[it.id] + ").");
          else seen[it.id] = sk;
          if (!/^[a-z0-9-]+$/.test(it.id)) warn(W2, 'id "' + it.id + '" should be lowercase letters, numbers and dashes only.');
        }
        if (!it.name) err(W2, "missing name.");
        if (!it.cat) err(W2, "missing cat (category).");
        else if (!cats[it.cat]) err(W2, 'cat "' + it.cat + '" is not one of this section\'s categories (' + Object.keys(cats).join(", ") + ").");
        if (!it.address) warn(W2, "missing address.");
        if (typeof it.lat !== "number" || typeof it.lng !== "number") err(W2, "lat and lng must be numbers (use Geocode in the editor).");
        else if (it.lat < BBOX.latMin || it.lat > BBOX.latMax || it.lng < BBOX.lngMin || it.lng > BBOX.lngMax) err(W2, "coordinates (" + it.lat + ", " + it.lng + ") are outside the Boston area — they look wrong.");
        if (!it.blurb) warn(W2, "missing blurb (description).");
        if (it.price !== undefined && it.price !== "") {
          if (PRICES.indexOf(it.price) === -1) err(W2, 'price "' + it.price + '" must be one of $, $$, $$$, $$$$.');
          if (!sec.hasPrice) warn(W2, 'has a price, but section "' + sk + "\" doesn't show prices (it'll be ignored).");
        } else if (sec.hasPrice) warn(W2, "no price set (this section shows prices).");
        if (it.website) { var wp = urlProblem(it.website); if (wp) err(W2, 'website "' + it.website + '" ' + wp); }
        if (!it.hours && sk !== "hotels") warn(W2, "no hours set.");
        if (it.tags !== undefined) {
          if (!Array.isArray(it.tags)) err(W2, "tags must be an array.");
          else it.tags.forEach(function (t) {
            if (hasAngle(t)) err(W2, 'tag "' + t + '" contains "<" or ">" — HTML is not allowed in tags.');
            if (!sec.tagLabels || !sec.tagLabels[t]) warn(W2, 'tag "' + t + "\" isn't in this section's tagLabels, so it won't be a filter option.");
          });
        }

        /* no raw HTML in text fields */
        TEXT_FIELDS.forEach(function (f) {
          if (hasAngle(it[f])) err(W2, f + ' contains "<" or ">" — HTML is not allowed in text fields.');
        });

        /* links[] — labels are text, urls must be clean http(s) */
        if (it.links !== undefined) {
          if (!Array.isArray(it.links)) err(W2, "links must be an array of {label, url}.");
          else it.links.forEach(function (l, i) {
            var lw = W2 + " › links[" + i + "]";
            if (!isObj(l)) { err(lw, "must be an object with label and url."); return; }
            if (hasAngle(l.label)) err(lw, 'label "' + l.label + '" contains "<" or ">" — HTML is not allowed in link labels.');
            var lp = urlProblem(l.url);
            if (lp) err(lw, 'url "' + (l.url === undefined ? "" : l.url) + '" ' + lp);
          });
        }

        /* "new" badge: addedOn (YYYY-MM-DD) replaces the legacy isNew boolean. app.js shows the badge for 90 days
           after addedOn and still honours isNew:true (forever) — hence a warning, not an error. */
        if (it.addedOn !== undefined && !isIsoDate(it.addedOn)) err(W2, 'addedOn "' + it.addedOn + '" must be a date string in YYYY-MM-DD form.');
        if (it.isNew !== undefined) warn(W2, "legacy isNew — use addedOn (YYYY-MM-DD); the New-pick badge now expires 90 days after addedOn.");
        if (it.michelin !== undefined) {
          if (MICHELIN.indexOf(it.michelin) === -1) err(W2, 'michelin "' + it.michelin + '" must be one of star, bib, selected.');
          else if (!D.meta || !D.meta.michelinEdition) warn(W2, "has a MICHELIN distinction but meta.michelinEdition is not set — the badge won't say which year's selection.");
        }
      });

      if (sec.collections !== undefined && !Array.isArray(sec.collections)) err(W, "collections must be an array.");
      else (sec.collections || []).forEach(function (col, ci) {
        if (!isObj(col)) { err(sk + " › collection #" + ci, "is not an object."); return; }
        var W3 = sk + ' › collection "' + (col.label || col.key || "?") + '"';
        if (!col.key) warn(W3, "missing key.");
        if (col.ids !== undefined && !Array.isArray(col.ids)) err(W3, "ids must be an array of entry ids.");
        else if (col.ids) col.ids.forEach(function (id) { if (!sec.items.some(function (x) { return isObj(x) && x.id === id; })) err(W3, 'lists id "' + id + '" which is not an entry in this section.'); });
        if (col.maxWalk !== undefined && typeof col.maxWalk !== "number") warn(W3, "maxWalk should be a number.");
        if (!col.ids && col.maxWalk === undefined) warn(W3, "has neither ids nor maxWalk — it will match nothing.");
      });
    });

    var coords = {};
    Object.keys(D.sections).forEach(function (sk) {
      var sec = D.sections[sk];
      if (!isObj(sec) || !Array.isArray(sec.items)) return;
      sec.items.forEach(function (it) {
        if (isObj(it) && typeof it.lat === "number" && typeof it.lng === "number") { var key = it.lat.toFixed(5) + "," + it.lng.toFixed(5); (coords[key] = coords[key] || []).push(sk + " › " + (it.name || it.id)); }
      });
    });
    Object.keys(coords).forEach(function (k) { if (coords[k].length > 1) warnings.push({ where: "coordinates", msg: "identical coordinates " + k + " shared by " + coords[k].join(", ") + " — their map pins will overlap." }); });

    return { errors: errors, warnings: warnings, stats: { items: items, sections: Object.keys(D.sections).length } };
  }

  /* ---------- diff vs the live guide ---------- */
  function indexItems(D) {
    var m = {};
    if (isObj(D) && isObj(D.sections)) Object.keys(D.sections).forEach(function (sk) {
      var sec = D.sections[sk];
      if (!isObj(sec) || !Array.isArray(sec.items)) return;
      sec.items.forEach(function (it) { if (isObj(it) && it.id) m[it.id] = { sec: sk, it: it }; });
    });
    return m;
  }
  function changedFields(a, b) { var keys = {}, out = []; Object.keys(a).forEach(function (k) { keys[k] = 1; }); Object.keys(b).forEach(function (k) { keys[k] = 1; }); Object.keys(keys).forEach(function (k) { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k); }); return out; }
  function diff(base, cand) {
    var b = indexItems(base), c = indexItems(cand), added = [], removed = [], changed = [];
    Object.keys(c).forEach(function (id) {
      if (!b[id]) { added.push({ id: id, sec: c[id].sec, name: c[id].it.name }); return; }
      var fields = changedFields(b[id].it, c[id].it);
      if (b[id].sec !== c[id].sec) fields.unshift("section (" + b[id].sec + " → " + c[id].sec + ")");
      if (fields.length) changed.push({ id: id, sec: c[id].sec, name: c[id].it.name, fields: fields });
    });
    Object.keys(b).forEach(function (id) { if (!c[id]) removed.push({ id: id, sec: b[id].sec, name: b[id].it.name }); });
    return { added: added, removed: removed, changed: changed };
  }

  /* ---------- version guard: the candidate must be exactly live + 1 ---------- */
  function checkVersion(liveMeta, candMeta) {
    var lv = liveMeta && liveMeta.version, cv = candMeta && candMeta.version;
    if (typeof lv !== "number") return { ok: false, message: "The live file has no numeric meta.version (found " + JSON.stringify(lv) + "), so the version guard can't run." };
    if (typeof cv !== "number") return { ok: false, message: "The candidate has no numeric meta.version (found " + JSON.stringify(cv) + "); live is v" + lv + ", so it should be v" + (lv + 1) + "." };
    if (cv === lv + 1) return { ok: true, message: "Version OK: live v" + lv + " → candidate v" + cv + "." };
    if (cv === lv) return { ok: false, message: "Version was not increased: live is v" + lv + " and the candidate is also v" + cv + ". Bump meta.version to " + (lv + 1) + "." };
    if (cv < lv) return { ok: false, message: "Candidate is older than live: candidate v" + cv + " < live v" + lv + ". It was probably exported before someone else published — reload the live guide and redo the edits, then use v" + (lv + 1) + "." };
    return { ok: false, message: "Candidate skips ahead: candidate v" + cv + " but live is v" + lv + " (expected v" + (lv + 1) + "). Either a version in between was never published or the number was typed by hand — set meta.version to " + (lv + 1) + "." };
  }

  return { parseDataJs: parseDataJs, validate: validate, diff: diff, checkVersion: checkVersion };
});
