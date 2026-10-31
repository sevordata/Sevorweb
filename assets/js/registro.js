/* SEVOR Data — multi-step contractor registration.
   No backend: images are compressed and the PDF is generated in the browser,
   then everything is POSTed (multipart) to FormSubmit. Nothing is stored locally. */
(function () {
  "use strict";
  var CFG = window.SEVOR_CONFIG || {};
  var JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
  var MAX_BYTES = 1000 * 1000; // < 1 MB per image
  var PROVINCIAS = ["Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"];

  var T = function (k) { return window.SEVOR ? window.SEVOR.t(k) : k; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = { step: 1, images: { dniF: null, dniB: null }, sig: null, errors: {} };

  /* ---------- validation helpers ---------- */
  function digits(v) { return String(v || "").replace(/\D/g, ""); }
  function validCUIT(v) {
    var d = digits(v);
    if (d.length !== 11) return false;
    var w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0;
    for (var i = 0; i < 10; i++) s += parseInt(d[i], 10) * w[i];
    var r = 11 - (s % 11);
    if (r === 11) r = 0;
    if (r === 10) return false; // AFIP never issues these (re-prefixed with 23/24/33)
    return r === parseInt(d[10], 10);
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()); }

  /* ---------- supported phones (rules of our recording app) ----------
     iPhone 12–18 (mini, Plus, Pro, Pro Max; NOT 16e/17e/18e; iOS 17.4+),
     Google Pixel 6–10 (incl. Pro), Samsung Galaxy S21–S26 (incl. Plus, Ultra).
     Any other phone is rejected. */
  var PHONES = { iphone: [12, 18], pixel: [6, 10], galaxy: [21, 26] };
  function phoneFamily(v) {
    var m = /^iPhone (\d+)$/.exec(v);
    if (m) return { brand: "iphone", n: +m[1] };
    m = /^Google Pixel (\d+)$/.exec(v);
    if (m) return { brand: "pixel", n: +m[1] };
    m = /^Samsung Galaxy S(\d+)$/.exec(v);
    if (m) return { brand: "galaxy", n: +m[1] };
    return null;
  }
  function supportedFamily(v) {
    var f = phoneFamily(v);
    return !!(f && f.n >= PHONES[f.brand][0] && f.n <= PHONES[f.brand][1]);
  }
  // The exact model typed must belong to the chosen family and not be an excluded variant.
  function supportedModel(family, model) {
    var f = phoneFamily(family);
    if (!f) return false;
    var m = " " + String(model || "").toLowerCase().replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").trim() + " ";
    var num = String(f.n);
    if (f.brand === "iphone") {
      if (/pixel|galaxy|samsung|google/.test(m)) return false;
      if (!new RegExp("(^|[^0-9])" + num + "([^0-9]|$)").test(m)) return false;
      if (new RegExp("(^|[^0-9])" + num + " ?e ").test(m)) return false;          // 16e, 17e, 18e
      if (/ (se|air|xr|xs) /.test(m)) return false;
      return true;
    }
    if (f.brand === "pixel") {
      if (/iphone|apple|galaxy|samsung/.test(m)) return false;
      if (!new RegExp("(^|[^0-9])" + num + "([^0-9]|$)").test(m)) return false;
      if (new RegExp("(^|[^0-9])" + num + " ?a ").test(m)) return false;          // 6a, 7a, 8a…
      if (/ fold /.test(m)) return false;
      return true;
    }
    if (/iphone|apple|pixel|google/.test(m)) return false;
    if (!new RegExp("(^|[^0-9])" + num + "([^0-9]|$)").test(m)) return false;
    if (/ (fe|edge) /.test(m) || new RegExp(" s?" + num + " ?fe ").test(m)) return false; // FE / Edge not listed
    return true;
  }
  function isIphone(v) { var f = phoneFamily(v); return !!(f && f.brand === "iphone"); }

  function setErr(key, msgKey) {
    state.errors[key] = msgKey || null;
    var el = $('[data-err="' + key + '"]');
    if (el) el.textContent = msgKey ? T(msgKey) : "";
    var field = el && el.closest(".field, .sigwrap");
    if (field) {
      field.classList.toggle("invalid", !!msgKey);
      field.querySelectorAll("input:not([type=file]), select").forEach(function (c) {
        if (msgKey) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid");
      });
    }
  }
  function refreshErrors() {
    Object.keys(state.errors).forEach(function (k) { setErr(k, state.errors[k]); });
  }

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function radio(name) { var el = $('input[name="' + name + '"]:checked'); return el ? el.value : ""; }

  function data() {
    return {
      name: val("name"), email: val("email"), cuit: digits(val("cuit")), dni: digits(val("dni")),
      provincia: val("provincia"), ciudad: val("ciudad"), dispositivo: val("dispositivo"), modelo: val("modelo"),
      vincha: radio("vincha"), horas: val("horas"), rol: "Grabador POV",
      ios: isIphone(val("dispositivo")) ? (document.getElementById("ios").checked ? "Sí" : "No") : "",
      get domicilio() { return [this.ciudad, this.provincia, "Argentina"].filter(Boolean).join(", "); }
    };
  }

  function validateStep1() {
    var d = data(), ok = true;
    function req(key, v, extra) {
      if (!v) { setErr(key, "err.required"); ok = false; return; }
      if (extra) { var e = extra(v); if (e) { setErr(key, e); ok = false; return; } }
      setErr(key, null);
    }
    req("name", d.name, function (v) { return v.length < 5 || v.indexOf(" ") === -1 ? "err.required" : null; });
    req("email", d.email, function (v) { return validEmail(v) ? null : "err.email"; });
    req("cuit", d.cuit, function (v) { return validCUIT(v) ? null : "err.cuit"; });
    req("dni", d.dni, function (v) { return v.length >= 7 && v.length <= 8 ? null : "err.dni"; });
    req("provincia", d.provincia);
    req("ciudad", d.ciudad);
    req("dispositivo", d.dispositivo, function (v) { return supportedFamily(v) ? null : "err.device"; });
    req("modelo", d.modelo, function (v) { return !supportedFamily(d.dispositivo) || supportedModel(d.dispositivo, v) ? null : "err.model"; });
    if (isIphone(d.dispositivo)) {
      if (d.ios !== "Sí") { setErr("ios", "err.ios"); ok = false; } else setErr("ios", null);
    } else setErr("ios", null);
    req("vincha", d.vincha);
    req("horas", d.horas, function (v) { var n = Number(v); return n >= 1 && n <= 80 && Math.floor(n) === n ? null : "err.hours"; });
    ["dniF", "dniB"].forEach(function (k) {
      if (!state.images[k]) { setErr(k, state.errors[k] === "err.img" ? "err.img" : "err.required"); ok = false; }
      else setErr(k, null);
    });
    if (!ok) {
      var first = $(".field.invalid input, .field.invalid select, .field.invalid");
      if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); if (first.focus) first.focus({ preventScroll: true }); }
    }
    return ok;
  }

  /* ---------- image compression (canvas) ---------- */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  function toBlob(canvas, q) {
    return new Promise(function (res) {
      if (canvas.toBlob) canvas.toBlob(function (b) { res(b); }, "image/jpeg", q);
      else {
        var du = canvas.toDataURL("image/jpeg", q), bin = atob(du.split(",")[1]), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res(new Blob([arr], { type: "image/jpeg" }));
      }
    });
  }
  async function compress(file) {
    var loaded = await loadImage(file);
    var img = loaded.img;
    var maxSide = 2000, w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("decode");
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    var blob = null;
    for (var pass = 0; pass < 6; pass++) {
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var qs = [0.86, 0.76, 0.66, 0.56];
      for (var i = 0; i < qs.length; i++) {
        blob = await toBlob(canvas, qs[i]);
        if (blob && blob.size < MAX_BYTES) break;
      }
      if (blob && blob.size < MAX_BYTES) break;
      scale *= 0.75;
    }
    URL.revokeObjectURL(loaded.url);
    if (!blob || blob.size >= MAX_BYTES) throw new Error("size");
    return { blob: blob, dataUrl: canvas.toDataURL("image/jpeg", 0.6), w: canvas.width, h: canvas.height };
  }
  function fmtSize(n) { return n > 1e6 ? (n / 1e6).toFixed(2) + " MB" : Math.round(n / 1e3) + " KB"; }

  function bindFile(key) {
    var input = document.getElementById(key);
    var status = $('[data-status="' + key + '"]');
    var drop = $('[data-drop="' + key + '"]');
    var thumb = $(".thumb", drop);
    input.addEventListener("change", async function () {
      var file = input.files && input.files[0];
      state.images[key] = null;
      thumb.classList.remove("has"); thumb.style.backgroundImage = "";
      drop.classList.remove("has-file");
      if (!file) { status.textContent = ""; return; }
      status.removeAttribute("data-i18n");
      drop.classList.add("is-busy");
      status.textContent = T("st.compress");
      try {
        var r = await compress(file);
        state.images[key] = r;
        thumb.classList.add("has");
        thumb.style.backgroundImage = "url(" + URL.createObjectURL(r.blob) + ")";
        drop.classList.add("has-file");
        status.textContent = "✓ " + T("st.ready") + " · " + fmtSize(r.blob.size);
        status.dataset.size = r.blob.size;
        setErr(key, null);
      } catch (e) {
        status.textContent = "";
        setErr(key, "err.img");
      }
      drop.classList.remove("is-busy");
    });
  }

  /* ---------- signature pad ---------- */
  function SigPad(canvas) {
    var ctx = canvas.getContext("2d"), strokes = [], cur = null, dpr = 1;
    function size() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      redraw();
    }
    function style() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0c1a33"; ctx.lineWidth = 2.2;
    }
    function drawStroke(s) {
      if (!s.length) return;
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
      if (s.length === 1) { ctx.lineTo(s[0][0] + 0.1, s[0][1] + 0.1); }
      for (var i = 1; i < s.length - 1; i++) {
        var mx = (s[i][0] + s[i + 1][0]) / 2, my = (s[i][1] + s[i + 1][1]) / 2;
        ctx.quadraticCurveTo(s[i][0], s[i][1], mx, my);
      }
      if (s.length > 1) ctx.lineTo(s[s.length - 1][0], s[s.length - 1][1]);
      ctx.stroke();
    }
    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      style(); strokes.forEach(drawStroke);
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      cur = [pt(e)]; strokes.push(cur); redraw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!cur) return; e.preventDefault();
      var p = pt(e), l = cur[cur.length - 1];
      if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 1.2) return;
      cur.push(p); redraw();
    });
    function end() { if (cur) { cur = null; api.onchange && api.onchange(); } }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", function () { if (cur && !canvas.hasPointerCapture) end(); });
    window.addEventListener("resize", size, { passive: true });
    var api = {
      size: size,
      clear: function () { strokes = []; redraw(); api.onchange && api.onchange(); },
      undo: function () { strokes.pop(); redraw(); api.onchange && api.onchange(); },
      isEmpty: function () {
        var n = 0; strokes.forEach(function (s) { n += s.length; }); return n < 8;
      },
      toDataURL: function () {
        // Export trimmed, transparent PNG at 1x scale for the PDF/preview.
        var out = document.createElement("canvas"); out.width = canvas.width; out.height = canvas.height;
        var o = out.getContext("2d"); o.drawImage(canvas, 0, 0);
        return out.toDataURL("image/png");
      },
      ratio: function () { return canvas.width / Math.max(1, canvas.height); }
    };
    return api;
  }

  /* ---------- contract ---------- */
  var pad;
  function renderContract() {
    var d = data();
    var box = document.getElementById("contract");
    box.innerHTML = window.SEVOR_CONTRACT.render({
      name: d.name, dni: d.dni, cuit: formatCUIT(d.cuit), domicilio: d.domicilio, email: d.email,
      signatureDataUrl: state.sig
    });
  }
  function formatCUIT(c) { return c.length === 11 ? c.slice(0, 2) + "-" + c.slice(2, 10) + "-" + c.slice(10) : c; }

  /* ---------- steps ---------- */
  function stepCount() {
    var sc = document.getElementById("step-count");
    if (sc) sc.textContent = T("reg.stepof").replace("{n}", state.step);
  }
  function docProgress() {
    var box = document.getElementById("contract"), bar = document.getElementById("doc-progress");
    if (!box || !bar) return;
    var max = box.scrollHeight - box.clientHeight;
    bar.style.width = (max > 0 ? Math.min(100, (box.scrollTop / max) * 100) : 100) + "%";
  }
  function go(n) {
    state.step = n;
    stepCount();
    $$("[data-step]").forEach(function (s) { s.hidden = String(n) !== s.getAttribute("data-step"); });
    $$("[data-step-ind]").forEach(function (li) {
      var i = Number(li.getAttribute("data-step-ind"));
      li.classList.toggle("active", i === n); li.classList.toggle("done", i < n);
      if (i === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (n === 2) { renderContract(); requestAnimationFrame(function () { pad.size(); docProgress(); }); }
    if (n === 3) renderSummary();
    var top = $(".form-card");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (top) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 84, behavior: reduced ? "auto" : "smooth" });
    var h = $('[data-step="' + n + '"] h2');
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  function validateStep2() {
    var ok = true;
    if (!$("#accept").checked) { setErr("accept", "err.accept"); ok = false; } else setErr("accept", null);
    if (pad.isEmpty()) { setErr("sign", "err.sign"); ok = false; } else setErr("sign", null);
    if (ok) { state.sig = pad.toDataURL(); renderContract(); }
    return ok;
  }

  function devLabel(v) {
    var sel = document.getElementById("dispositivo"), o = sel && sel.options[sel.selectedIndex];
    return o && o.value === v ? o.textContent : v;
  }
  function summaryRows() {
    var d = data();
    var rows = [
      ["f.name", d.name], ["f.email", d.email], ["f.cuit", formatCUIT(d.cuit)], ["f.dni", d.dni],
      ["f.prov", d.provincia], ["f.city", d.ciudad],
      ["f.device", devLabel(d.dispositivo)], ["f.model", d.modelo]
    ];
    if (d.ios) rows.push(["f.ios", d.ios === "Sí" ? T("yes") : T("no")]);
    return rows.concat([
      ["f.strap", d.vincha === "Sí" ? T("yes") : T("no")], ["f.hours", d.horas],
      ["f.dniF", state.images.dniF ? "✓ " + fmtSize(state.images.dniF.blob.size) : "—"],
      ["f.dniB", state.images.dniB ? "✓ " + fmtSize(state.images.dniB.blob.size) : "—"],
      ["c.sign", state.sig ? "✓" : "—"]
    ]);
  }
  // Review step: rows grouped into cards, each with an "Edit" shortcut back to its step.
  var SUMMARY_GROUPS = [
    ["g.personal", 1, ["f.name", "f.email", "f.cuit", "f.dni"]],
    ["g.location", 1, ["f.prov", "f.city"]],
    ["g.work", 1, ["f.device", "f.model", "f.ios", "f.strap", "f.hours"]],
    ["g.docs", 1, ["f.dniF", "f.dniB"]],
    ["reg.s2", 2, ["c.sign"]]
  ];
  function renderSummary() {
    var box = document.getElementById("summary");
    box.innerHTML = "";
    var rows = {};
    summaryRows().forEach(function (r) { rows[r[0]] = r[1]; });
    SUMMARY_GROUPS.forEach(function (g) {
      var card = document.createElement("section"); card.className = "sum-card";
      var head = document.createElement("header");
      var h = document.createElement("h3"); h.textContent = T(g[0]);
      var edit = document.createElement("button"); edit.type = "button"; edit.textContent = T("s3.edit");
      edit.setAttribute("aria-label", T("s3.edit") + ": " + T(g[0]));
      edit.addEventListener("click", function () { go(g[1]); });
      head.appendChild(h); head.appendChild(edit); card.appendChild(head);
      var dl = document.createElement("dl");
      g[2].forEach(function (k) {
        if (!(k in rows)) return;
        var dt = document.createElement("dt"); dt.textContent = T(k);
        var dd = document.createElement("dd");
        if (k === "c.sign" && state.sig) {
          var img = document.createElement("img"); img.src = state.sig; img.alt = T("c.sign"); img.className = "sig-preview";
          dd.appendChild(img);
        } else dd.textContent = rows[k];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl); box.appendChild(card);
    });
  }

  /* ---------- PDF ---------- */
  var jspdfPromise;
  function loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jspdfPromise) {
      jspdfPromise = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = JSPDF_URL; s.async = true; s.crossOrigin = "anonymous";
        s.onload = function () { window.jspdf && window.jspdf.jsPDF ? res(window.jspdf.jsPDF) : rej(new Error("jspdf")); };
        s.onerror = function () { jspdfPromise = null; rej(new Error("jspdf")); };
        document.head.appendChild(s);
      });
    }
    return jspdfPromise;
  }
  async function sha256(text) {
    try {
      var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    } catch (e) { return "no disponible"; }
  }
  // Keep text inside WinAnsi (standard PDF fonts).
  function pdfSafe(s) {
    return String(s).replace(/[\u2212\u2013]/g, "-").replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")
      .replace(/\u2026/g, "...").replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u2014\u20ac]/g, "?");
  }

  async function buildPDF() {
    var JsPDF = await loadJsPDF();
    var d = data();
    var doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
    var W = 210, M = 18, y = 20, LH = 5.2, maxW = W - 2 * M;
    var now = new Date();
    var ts = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "medium" }).format(now) + " (hora de Argentina, UTC-3) · " + now.toISOString();
    function need(h) { if (y + h > 297 - 18) { doc.addPage(); y = 20; } }
    function text(str, opts) {
      opts = opts || {};
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 10);
      var lines = doc.splitTextToSize(pdfSafe(str), maxW);
      lines.forEach(function (ln) { need(LH); doc.text(ln, opts.center ? W / 2 : M, y, opts.center ? { align: "center" } : undefined); y += (opts.lh || LH); });
    }
    var ES = (window.SEVOR_I18N || {}).es || {};

    doc.setDrawColor(29, 92, 147); doc.setLineWidth(1.2); doc.line(M, 12, W - M, 12);
    text("SEVOR Data — Registro de contratista", { bold: true, size: 15, lh: 7 });
    text("Generado: " + ts, { size: 8.5 });
    y += 3;
    text("1. Datos del prestador", { bold: true, size: 12, lh: 6.5 });
    summaryRows().forEach(function (r) {
      var label = ES[r[0]] || r[0];
      var v = r[1];
      if (r[0] === "f.device") v = d.dispositivo;
      if (r[0] === "f.ios") v = d.ios;
      if (r[0] === "f.strap") v = d.vincha;
      if (r[0] === "f.dniF" || r[0] === "f.dniB") v = state.images[r[0].slice(2)] ? "adjunta (" + fmtSize(state.images[r[0].slice(2)].blob.size) + ")" : "-";
      if (r[0] === "c.sign") v = state.sig ? "sí (ver sección 3)" : "-";
      text(label + ": " + v, { size: 10 });
    });
    text("Rol: Grabador POV (video en primera persona)", { size: 10 });
    text("Idioma de la interfaz: " + (window.SEVOR ? window.SEVOR.lang() : "es"), { size: 10 });
    y += 4;

    text("2. Contrato aceptado", { bold: true, size: 12, lh: 6.5 });
    var blocks = window.SEVOR_CONTRACT.blocks(document.getElementById("contract"));
    var plain = blocks.map(function (b) { return b.text; }).join("\n");
    blocks.forEach(function (b) {
      if (!b.text) { y += 2; return; }
      if (b.type === "h2") { y += 2; text(b.text, { bold: true, size: 11.5, center: true, lh: 6 }); y += 1; }
      else if (b.type === "h3") { y += 2; text(b.text, { bold: true, size: 10.2 }); }
      else { text(b.text, { size: 9.6, lh: 4.7 }); y += 1.4; }
    });
    y += 5;

    text("3. Aceptación y firma electrónica del prestador", { bold: true, size: 12, lh: 6.5 });
    text("Casilla \"Leí y acepto el contrato\": marcada. Consentimiento de datos personales (Ley 25.326): aceptado.", { size: 9.6 });
    if (state.sig) {
      var r = pad.ratio(), sw = 80, sh = sw / r;
      need(sh + 6);
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(M, y, sw, sh);
      doc.addImage(state.sig, "PNG", M, y, sw, sh);
      y += sh + 5;
    }
    text("Firmante: " + d.name + " · DNI " + d.dni + " · CUIT " + formatCUIT(d.cuit), { size: 9.6 });
    text("Fecha y hora de firma: " + ts, { size: 9.6 });
    var hash = await sha256(plain);
    text("Huella SHA-256 del texto del contrato: " + hash, { size: 8.5 });
    text("Dispositivo: " + navigator.userAgent, { size: 7.5, lh: 3.8 });

    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
      doc.text("SEVOR Data · " + (CFG.EMAIL || "") + " · " + i + "/" + pages, W / 2, 290, { align: "center" });
      doc.setTextColor(0);
    }
    var safeName = d.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "registro";
    return { blob: doc.output("blob"), filename: "contrato-sevor-" + safeName + ".pdf" };
  }

  /* ---------- submit ---------- */
  function setStatus(msg, isErr, busy, ok) {
    var s = document.getElementById("status");
    s.className = "status" + (isErr ? " error" : "") + (ok ? " success" : "");
    s.innerHTML = "";
    if (busy) { var sp = document.createElement("span"); sp.className = "spinner"; s.appendChild(sp); s.appendChild(document.createTextNode(" ")); }
    s.appendChild(document.createTextNode(msg || ""));
  }

  function hidden(form, name, value) {
    var i = document.createElement("input"); i.type = "hidden"; i.name = name; i.value = value; form.appendChild(i);
  }

  function filesSupported() {
    try { var dt = new DataTransfer(); dt.items.add(new File(["x"], "x.txt")); return dt.files.length === 1; }
    catch (e) { return false; }
  }

  async function submit() {
    if (!$("#privacy").checked) { setErr("privacy", "err.privacy"); return; }
    setErr("privacy", null);
    var btn = $("#submit"), dl = $("#dlpdf");
    btn.disabled = true; dl.disabled = true;
    btn.setAttribute("aria-busy", "true");
    var label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + T("s3.submit") + "</span>";
    setStatus(T("s3.sending"), false, true);
    try {
      var d = data();
      var pdf = await buildPDF();
      var next = new URL("gracias.html", location.href).href;
      var fields = [
        ["_subject", "Nuevo registro SEVOR Data \u2013 " + d.name],
        ["_template", "table"],
        ["_captcha", "false"],
        ["_next", next],
        ["_honey", ""],
        ["_autoresponse", T("th.title") + ". " + T("th.lead")],
        ["Nombre y apellido", d.name], ["email", d.email], ["CUIT", formatCUIT(d.cuit)], ["DNI", d.dni],
        ["Provincia", d.provincia], ["Ciudad", d.ciudad], ["Rol", d.rol],
        ["Celular (familia)", d.dispositivo], ["Modelo exacto", d.modelo], ["Celular compatible", "Sí"],
        ["iOS 17.4 o posterior", d.ios || "No aplica (Android)"],
        ["Tiene vincha de cabeza", d.vincha === "Sí" ? "Sí" : "No (debe conseguirla antes de grabar)"], ["Horas por semana", d.horas],
        ["Contrato aceptado", "Sí"], ["Consentimiento Ley 25.326", "Sí"],
        ["Fecha y hora (UTC)", new Date().toISOString()], ["Idioma", window.SEVOR ? window.SEVOR.lang() : "es"]
      ];
      var files = [
        ["contrato_pdf", new File([pdf.blob], pdf.filename, { type: "application/pdf" })],
        ["dni_frente", new File([state.images.dniF.blob], "dni-frente.jpg", { type: "image/jpeg" })],
        ["dni_dorso", new File([state.images.dniB.blob], "dni-dorso.jpg", { type: "image/jpeg" })]
      ];
      var endpoint = CFG.FORM_ENDPOINT || ("https://formsubmit.co/" + (CFG.EMAIL || ""));

      if (filesSupported()) {
        // Native multipart POST (navigates to FormSubmit, which redirects to _next).
        var form = document.getElementById("fs");
        form.innerHTML = ""; form.action = endpoint;
        fields.forEach(function (f) { hidden(form, f[0], f[1]); });
        form.querySelector('[name="_honey"]').className = "hp";
        files.forEach(function (f) {
          var inp = document.createElement("input"); inp.type = "file"; inp.name = f[0];
          var dt = new DataTransfer(); dt.items.add(f[1]); inp.files = dt.files;
          form.appendChild(inp);
        });
        setStatus(T("s3.sent"), false, false, true);
        form.submit();
      } else {
        // Fallback for old browsers: opaque fetch, then go to the thank-you page.
        var fd = new FormData();
        fields.forEach(function (f) { fd.append(f[0], f[1]); });
        files.forEach(function (f) { fd.append(f[0], f[1], f[1].name); });
        await fetch(endpoint, { method: "POST", body: fd, mode: "no-cors" });
        setStatus(T("s3.sent"), false, false, true);
        setTimeout(function () { location.href = next; }, 600);
      }
    } catch (e) {
      btn.disabled = false; dl.disabled = false;
      btn.removeAttribute("aria-busy"); btn.innerHTML = label;
      setStatus(T("s3.err"), true);
    }
  }

  async function download() {
    var dl = $("#dlpdf");
    dl.disabled = true; dl.setAttribute("aria-busy", "true");
    try {
      var pdf = await buildPDF();
      var a = document.createElement("a");
      a.href = URL.createObjectURL(pdf.blob); a.download = pdf.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      setStatus("");
    } catch (e) { setStatus(T("s3.err"), true); }
    dl.disabled = false; dl.removeAttribute("aria-busy");
  }

  /* ---------- init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var sel = document.getElementById("provincia");
    PROVINCIAS.forEach(function (p) { var o = document.createElement("option"); o.value = p; o.textContent = p; sel.appendChild(o); });

    bindFile("dniF"); bindFile("dniB");
    pad = SigPad(document.getElementById("sigpad"));
    pad.onchange = function () {
      var signed = !pad.isEmpty();
      $("#sigwrap").classList.toggle("signed", signed);
      if (signed) setErr("sign", null);
    };
    $("#sigclear").addEventListener("click", function () { pad.clear(); state.sig = null; });
    $("#sigundo").addEventListener("click", function () { pad.undo(); state.sig = null; });
    $("#contract").addEventListener("scroll", docProgress, { passive: true });
    stepCount();
    $("#accept").addEventListener("change", function () { if (this.checked) setErr("accept", null); });
    $("#privacy").addEventListener("change", function () { if (this.checked) setErr("privacy", null); });

    // Clear a field's error as the user fixes it
    $$("#reg input, #reg select").forEach(function (el) {
      el.addEventListener(el.type === "radio" || el.tagName === "SELECT" ? "change" : "input", function () {
        var k = el.name || el.id;
        if (state.errors[k] && el.type !== "file") setErr(k, null);
      });
    });
    // Phone family → iOS checkbox; vincha "No" → note
    function syncPhone() {
      var iphone = isIphone(val("dispositivo"));
      document.getElementById("ios-field").hidden = !iphone;
      if (!iphone) setErr("ios", null);
    }
    $("#dispositivo").addEventListener("change", function () {
      syncPhone();
      if (state.errors.modelo && val("modelo")) setErr("modelo", null);
    });
    $("#ios").addEventListener("change", function () { if (this.checked) setErr("ios", null); });
    $$('input[name="vincha"]').forEach(function (r) {
      r.addEventListener("change", function () { $("#strap-note").hidden = radio("vincha") !== "No"; });
    });
    syncPhone();

    // Format CUIT as digits only
    $("#cuit").addEventListener("blur", function () { this.value = digits(this.value); });
    $("#dni").addEventListener("blur", function () { this.value = digits(this.value); });

    $$("[data-next]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = Number(b.getAttribute("data-next"));
        if (n === 2 && !validateStep1()) return;
        if (n === 3 && !validateStep2()) return;
        go(n);
      });
    });
    $$("[data-prev]").forEach(function (b) {
      b.addEventListener("click", function () { go(Number(b.getAttribute("data-prev"))); });
    });
    $("#submit").addEventListener("click", submit);
    $("#dlpdf").addEventListener("click", download);
    $("#reg").addEventListener("submit", function (e) { e.preventDefault(); });

    document.addEventListener("sevor:lang", function () {
      refreshErrors();
      stepCount();
      if (state.step === 3) renderSummary();
      ["dniF", "dniB"].forEach(function (k) {
        var st = $('[data-status="' + k + '"]');
        if (state.images[k] && st) st.textContent = "✓ " + T("st.ready") + " · " + fmtSize(state.images[k].blob.size);
      });
    });
    // Warm up jsPDF in the background once the user is on the form.
    setTimeout(function () { loadJsPDF().catch(function () {}); }, 2500);
  });
})();
