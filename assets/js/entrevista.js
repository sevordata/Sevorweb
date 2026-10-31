/* SEVOR Data — "Mirá": entrevista de preselección grabada en video.
   - Voz de Mirá: Web Speech API (speechSynthesis) del propio dispositivo. Gratis, sin claves.
   - Cámara + micrófono obligatorios: toda la entrevista se graba con MediaRecorder (~3 MB/min).
   - El video se sube en partes a un Google Apps Script (Drive privado de SEVOR Data) y se avisa por email.
   - Copia de respaldo de las respuestas por FormSubmit (AJAX).
   - El puntaje es solo un filtro preliminar: la decisión la toma Demian, que envía el link de aprobación. */
(function () {
  "use strict";

  /* ======== CONFIGURACIÓN ========
     URL del Web App de Google Apps Script (termina en /exec). Ver tools/apps-script/LEEME.md.
     Si está vacía, la entrevista funciona igual pero el video NO se sube (solo llega el email de respaldo). */
  var UPLOAD_URL = "";

  var FORMSUBMIT = "https://formsubmit.co/ajax/contacto.sevor@gmail.com";
  var SITE = "https://sevordata.dev.ar";
  var PASS_PCT = 70;              // filtro preliminar (no habilita el registro)
  var RETRY_DAYS = 7;
  var MAX_REC_MS = 12 * 60 * 1000; // tope de grabación: 12 minutos
  var CHUNK_BYTES = 5 * 1024 * 1024;
  var K_DONE = "sevor_mira_done";
  var K_MUTE = "sevor_mira_mute";
  var DAY = 864e5;

  /* ---------- Preguntas ----------
     type: "single" (opciones con puntos), "multi-select" (varias sub-preguntas), "open" (texto).
     knockout: si la opción tiene ko:true, la entrevista termina sin aprobar. */
  var Q = [
    {
      id: "basicos", title: "Requisitos básicos",
      say: "Arranquemos por lo básico. ¿Tenés dieciocho años o más, y vivís en Argentina?",
      type: "group",
      parts: [
        { id: "edad", label: "¿Tenés 18 años o más?", options: [
          { v: "Sí, tengo 18 o más", pts: 0 }, { v: "No, soy menor de 18", pts: 0, ko: "edad" } ] },
        { id: "pais", label: "¿Vivís en Argentina?", options: [
          { v: "Sí, vivo en Argentina", pts: 0 }, { v: "No, vivo en otro país", pts: 0, ko: "pais" } ] }
      ], max: 0
    },
    {
      id: "celular", title: "Tu celular",
      say: "Contame qué celular tenés y cuánto espacio libre le queda, más o menos.",
      hint: "La app de grabación funciona con iPhone 12 a 18 (no modelos “e”, iOS 17.4 o superior), Google Pixel 6 a 10 y Samsung Galaxy S21 a S26.",
      type: "group",
      parts: [
        { id: "modelo", label: "Modelo", options: [
          { v: "iPhone 12 a 18 (no “e”)", pts: 10, ok: true },
          { v: "Google Pixel 6 a 10", pts: 10, ok: true },
          { v: "Samsung Galaxy S21 a S26", pts: 10, ok: true },
          { v: "Otro Android", pts: 0 },
          { v: "Otro iPhone (11 o anterior, o modelo “e”)", pts: 0 } ] },
        { id: "espacio", label: "Espacio libre", options: [
          { v: "Más de 64 GB", pts: 5 }, { v: "Entre 16 y 64 GB", pts: 3 }, { v: "Menos de 16 GB", pts: 0 }, { v: "No sé", pts: 1 } ] }
      ], max: 15
    },
    {
      id: "vincha", title: "Vincha de cabeza",
      say: "Para grabar en primera persona usamos el celular en una vincha de cabeza. ¿Tenés una, o podrías conseguirla?",
      type: "single",
      options: [ { v: "Ya tengo una", pts: 10 }, { v: "No, pero puedo comprar una", pts: 8 }, { v: "No puedo conseguirla", pts: 0 } ],
      max: 10
    },
    {
      id: "horas", title: "Disponibilidad",
      say: "No hay horario fijo. ¿Cuántas horas por semana podrías dedicarle, aproximadamente?",
      type: "single",
      options: [ { v: "Menos de 5 horas", pts: 3 }, { v: "De 5 a 10 horas", pts: 7 }, { v: "De 10 a 20 horas", pts: 10 }, { v: "Más de 20 horas", pts: 10 } ],
      max: 10
    },
    {
      id: "comodidad", title: "Grabarte las manos",
      say: "En los videos se ven tus manos haciendo tareas del hogar o de tu trabajo: cocinar, limpiar, ordenar. ¿Te sentís cómodo o cómoda grabándolo?",
      type: "single",
      options: [ { v: "Sí, sin problema", pts: 10 }, { v: "Sí, aunque tengo algunas dudas", pts: 5 }, { v: "No me siento cómodo/a", pts: 0 } ],
      max: 10
    },
    {
      id: "consentimiento", title: "Situación de práctica",
      say: "Una situación. Estás grabando cómo cocinás y entra a la cocina otra persona de tu casa, que no firmó ningún consentimiento. ¿Qué hacés?",
      type: "single",
      options: [
        { v: "Sigo grabando: es mi casa y no pasa nada", pts: 0 },
        { v: "Pauso la grabación y retomo cuando ya no aparece en cuadro", pts: 15, correct: true },
        { v: "Sigo grabando y después le aviso", pts: 0 },
        { v: "Aprovecho y filmo también la mesada con unas boletas y papeles del banco", pts: 0 } ],
      explain: "Nunca grabamos caras ni personas sin su consentimiento, ni menores, ni documentos o datos privados.",
      max: 15
    },
    {
      id: "facturacion", title: "Facturación",
      say: "Trabajás como contratista independiente, así que hace falta poder facturar. ¿Sos monotributista, o te podrías inscribir?",
      type: "single",
      options: [ { v: "Ya soy monotributista", pts: 10 }, { v: "No, pero me puedo inscribir", pts: 8 }, { v: "No sé cómo, pero quiero aprender", pts: 5 }, { v: "No quiero facturar", pts: 0 } ],
      max: 10
    },
    {
      id: "wifi", title: "Conexión para subir videos",
      say: "Los videos pesan bastante. ¿Tenés Wi-Fi estable para subirlos?",
      type: "single",
      options: [ { v: "Sí, Wi-Fi estable", pts: 10 }, { v: "Tengo Wi-Fi pero a veces se corta", pts: 5 }, { v: "No tengo Wi-Fi, solo datos móviles", pts: 2 } ],
      max: 10
    },
    {
      id: "tareas", title: "Tu día a día",
      say: "Ahora respondé en voz alta, mirando a la cámara. Describí tres tareas de tu día que podrías grabar.",
      type: "open", placeholder: "Opcional: escribí un resumen (por ej.: preparar el desayuno, doblar la ropa, regar las plantas…)",
      minChars: 15, full: 40, max: 10
    },
    {
      id: "motivo", title: "Tu motivación",
      say: "Última pregunta, también en voz alta. ¿Por qué querés sumarte a SEVOR Data?",
      type: "open", placeholder: "Opcional: escribí un resumen en pocas líneas",
      minChars: 10, full: 30, max: 10
    }
  ];
  var MAX = Q.reduce(function (a, q) { return a + (q.max || 0); }, 0); // 100

  /* ---------- Utilidades ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (k === K_MUTE && window.SEVOR_CONSENT && !window.SEVOR_CONSENT.allows("functional")) return; localStorage.setItem(k, v); } catch (e) {} }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString("es-AR", { day: "numeric", month: "long" }); }
    catch (e) { return new Date(ts).toDateString(); }
  }
  function fmtClock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function fmtMB(b) { return (b / 1048576).toFixed(1).replace(".", ",") + " MB"; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function approvalCode(email) { return window.SEVOR_MIRA_CODE ? window.SEVOR_MIRA_CODE.fromEmail(email) : ""; }
  function approvalLink(code) { return SITE + "/registro.html?codigo=" + encodeURIComponent(code); }

  /* ---------- Puntaje preliminar (puro, testeable) ---------- */
  function scoreOpen(q, a) {
    var t = String((a && a.text) || "").trim();
    if (t.length >= q.full && t.split(/\s+/).length >= 5) return q.max;
    if (t.length >= q.minChars) return Math.round(q.max / 2);
    if (a && a.voice) return Math.round(q.max / 2); // respondió en voz: lo evalúa Demian en el video
    return 0;
  }
  function evaluate(answers) {
    var pts = 0, ko = null, detail = {}, phoneOk = true, consentOk = false;
    Q.forEach(function (q) {
      var a = answers[q.id];
      var p = 0;
      if (q.type === "group") {
        q.parts.forEach(function (part) {
          var idx = a ? a[part.id] : null;
          var o = idx != null ? part.options[idx] : null;
          if (o) { p += o.pts; if (o.ko && !ko) ko = o.ko; }
          if (part.id === "modelo") phoneOk = !!(o && o.ok);
        });
      } else if (q.type === "single") {
        var o = a != null ? q.options[a] : null;
        if (o) { p = o.pts; if (q.id === "consentimiento") consentOk = !!o.correct; }
      } else if (q.type === "open") {
        p = scoreOpen(q, a);
      }
      detail[q.id] = p;
      pts += p;
    });
    var pct = MAX ? Math.round((pts / MAX) * 100) : 0;
    return { points: pts, max: MAX, pct: pct, knockout: ko, passed: !ko && pct >= PASS_PCT, phoneOk: phoneOk, consentOk: consentOk, detail: detail };
  }

  function answerText(q, a) {
    if (q.type === "group") return q.parts.map(function (p) { return p.label + ": " + (a && a[p.id] != null ? p.options[a[p.id]].v : "—"); }).join(" | ");
    if (q.type === "single") return a != null ? q.options[a].v : "—";
    var t = String((a && a.text) || "").trim();
    return (t || "(sin texto)") + (a && a.voice ? " · Respondió en voz alta (ver video)" : "");
  }
  function buildPayload(cand, answers, r, extra) {
    extra = extra || {};
    var estado = r.passed ? "APROBADO" : "NO APROBADO";
    var code = approvalCode(cand.email);
    var p = {
      _subject: "Entrevista Mirá - " + cand.name + " - " + estado + " (preliminar)",
      _template: "table",
      _captcha: "false",
      _replyto: cand.email,
      "Nombre": cand.name,
      "Email": cand.email,
      "Filtro automático (preliminar)": estado + " · " + r.points + " / " + r.max + " (" + r.pct + "%) · mínimo " + PASS_PCT + "%",
      "Descarte automático": r.knockout ? (r.knockout === "edad" ? "Menor de 18" : "No vive en Argentina") : "No",
      "Celular compatible": r.phoneOk ? "Sí" : "No",
      "Consentimiento (respuesta correcta)": r.consentOk ? "Sí" : "No",
      "Código de aprobación": code,
      "Link de aprobación (reenviar SOLO si aprobás)": r.knockout ? "No corresponde (descarte automático)" : approvalLink(code),
      "Video": extra.video || "—",
      "Sesión": extra.session || "—"
    };
    Q.forEach(function (q, i) {
      if (r.knockout && q.id !== "basicos" && answers[q.id] == null) return;
      p[(i + 1) + ". " + q.title] = answerText(q, answers[q.id]) + (q.max ? "  [" + (r.detail[q.id] || 0) + "/" + q.max + "]" : "");
    });
    p["Consentimiento de grabación (Ley 25.326)"] = "Aceptado " + (cand.consentAt || "");
    p["Fecha"] = new Date().toISOString();
    p["Navegador"] = (navigator.userAgent || "").slice(0, 180);
    return p;
  }

  /* ---------- Voz de Mirá ---------- */
  var synth = window.speechSynthesis || null;
  var voice = null;
  var muted = lsGet(K_MUTE) === "1";
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    function find(fn) { for (var i = 0; i < vs.length; i++) if (fn(vs[i])) return vs[i]; return null; }
    var lang = function (v) { return String(v.lang || "").toLowerCase().replace("_", "-"); };
    voice = find(function (v) { return lang(v) === "es-ar"; }) ||
            find(function (v) { return lang(v) === "es-419" || lang(v) === "es-us" || lang(v) === "es-mx"; }) ||
            find(function (v) { return lang(v).indexOf("es") === 0 && /google|natural|neural|premium|enhanced/i.test(v.name); }) ||
            find(function (v) { return lang(v).indexOf("es") === 0; }) || null;
  }
  if (synth) {
    pickVoice();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", pickVoice);
    else synth.onvoiceschanged = pickVoice;
  }
  var lastSay = "";
  function speak(text) {
    lastSay = text;
    if (!synth || muted || !text) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "es-AR"; }
      u.rate = 1; u.pitch = 1.05;
      u.onstart = function () { setTalking(true); };
      u.onend = u.onerror = function () { setTalking(false); };
      synth.speak(u);
    } catch (e) { setTalking(false); }
  }
  function stopSpeak() { try { if (synth) synth.cancel(); } catch (e) {} setTalking(false); }
  function setTalking(on) { var av = $("#mira-avatar"); if (av) av.classList.toggle("is-talking", !!on); }

  /* ---------- Cámara y grabación ---------- */
  var stream = null, recorder = null, recChunks = [], recMime = "", recStart = 0, recTimer = null, recCapped = false, recStopped = null;
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var c = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4;codecs=avc1,mp4a", "video/mp4"];
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return "";
  }
  function mediaSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
  function openCamera() {
    return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: true }).then(function (s) {
      stream = s;
      var v = $("#mira-cam-video");
      v.srcObject = s; v.muted = true; v.setAttribute("playsinline", ""); 
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      $("#mira-cam").hidden = false;
      // Si el usuario apaga la cámara desde el sistema.
      s.getTracks().forEach(function (t) { t.addEventListener("ended", function () { if (step >= 0 && step < Q.length) camLost(); }); });
      return s;
    });
  }
  function startRecording() {
    recMime = pickMime();
    var opts = { videoBitsPerSecond: 400000, audioBitsPerSecond: 48000 };
    if (recMime) opts.mimeType = recMime;
    try { recorder = new MediaRecorder(stream, opts); }
    catch (e) { recorder = new MediaRecorder(stream); }
    recMime = recorder.mimeType || recMime || "video/webm";
    recChunks = [];
    recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) recChunks.push(ev.data); };
    recStopped = new Promise(function (res) { recorder.onstop = function () { res(); }; });
    recorder.start(1000);
    recStart = Date.now();
    $("#mira-cam").classList.add("is-rec");
    recTimer = setInterval(function () {
      var el = Date.now() - recStart;
      $("#mira-rec-t").textContent = fmtClock(el);
      if (el >= MAX_REC_MS && !recCapped) { recCapped = true; stopRecording(); $("#mira-rec-note").hidden = false; }
    }, 500);
  }
  function stopRecording() {
    clearInterval(recTimer);
    $("#mira-cam").classList.remove("is-rec");
    if (recorder && recorder.state !== "inactive") { try { recorder.requestData(); } catch (e) {} recorder.stop(); }
    return recStopped || Promise.resolve();
  }
  function closeCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    var v = $("#mira-cam-video"); if (v) v.srcObject = null;
    $("#mira-cam").hidden = true;
  }
  function camLost() {
    $("#m-err") && ($("#m-err").textContent = "Se apagó la cámara o el micrófono. La entrevista necesita la grabación: recargá la página para empezar de nuevo.");
    var nx = $("#m-next"); if (nx) nx.disabled = true;
  }

  /* ---------- Subida a Google Apps Script ---------- */
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res(s.slice(s.indexOf(",") + 1)); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function post(body) {
    // text/plain evita el preflight CORS (Apps Script no responde OPTIONS).
    return fetch(UPLOAD_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || "upload"); return j; });
  }
  function withRetry(fn, tries) {
    var n = 0;
    function go() { return fn().catch(function (e) { n++; if (n >= tries) throw e; return sleep(1500 * n).then(go); }); }
    return go();
  }
  function uploadVideo(blob, session, meta, onProgress) {
    var total = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
    var i = meta.resumeFrom || 0;
    function nextChunk() {
      if (i >= total) {
        onProgress(1, "Guardando la entrevista…");
        return withRetry(function () { return post({ action: "finish", session: session, total: total, mime: blob.type, size: blob.size, meta: meta.info }); }, 3);
      }
      var part = blob.slice(i * CHUNK_BYTES, Math.min(blob.size, (i + 1) * CHUNK_BYTES));
      return blobToB64(part).then(function (b64) {
        return withRetry(function () { return post({ action: "chunk", session: session, index: i, total: total, size: blob.size, chunkBytes: CHUNK_BYTES, mime: blob.type, name: meta.info.name, data: b64 }); }, 3);
      }).then(function () { i++; meta.resumeFrom = i; onProgress(i / total, "Subiendo tu entrevista… " + Math.round((i / total) * 100) + "%"); return nextChunk(); });
    }
    onProgress(i / total, "Subiendo tu entrevista… " + Math.round((i / total) * 100) + "%");
    return nextChunk();
  }

  /* ---------- Estado / UI ---------- */
  var root, stage, bar, barTxt;
  var step = -1;
  var cand = { name: "", email: "", consentAt: "" };
  var answers = {};
  var sentBackup = false, uploading = false;

  function setProgress() {
    var total = Q.length;
    var done = step < 0 ? 0 : Math.min(step, total);
    bar.style.transform = "scaleX(" + (done / total) + ")";
    barTxt.textContent = step < 0 ? "Antes de empezar" : (step >= total ? "Listo" : "Pregunta " + (step + 1) + " de " + total);
    $(".mira-progress").setAttribute("aria-valuenow", String(done));
  }
  function bubble(text) { $("#mira-say").textContent = text; }
  function focusFirst() {
    var el = stage.querySelector("h2");
    if (el) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
    var top = root.getBoundingClientRect().top + window.pageYOffset - 90;
    if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: "smooth" });
  }
  function choiceList(name, options, selected) {
    return '<div class="mira-options" role="radiogroup">' + options.map(function (o, i) {
      return '<label class="mira-opt"><input type="radio" name="' + name + '" value="' + i + '"' + (selected === i ? " checked" : "") + '><span>' + esc(o.v) + "</span></label>";
    }).join("") + "</div>";
  }

  var PERM_HELP =
    '<ul class="mira-help small">' +
    "<li><strong>Android (Chrome):</strong> tocá el candado o el ícono junto a la dirección › Permisos › activá Cámara y Micrófono, y recargá.</li>" +
    "<li><strong>iPhone (Safari):</strong> tocá “aA” en la barra › Configuración del sitio web › Cámara y Micrófono: Permitir. También en Ajustes › Safari › Cámara/Micrófono.</li>" +
    "<li><strong>Computadora:</strong> hacé clic en el candado junto a la dirección, permití Cámara y Micrófono y recargá la página.</li>" +
    "</ul>";

  function renderIntro() {
    step = -1; setProgress();
    var say = "¡Hola! Soy Mirá, de SEVOR Data. Te voy a hacer diez preguntas cortas. La entrevista se graba en video, así que vas a necesitar la cámara y el micrófono. Primero, decime tu nombre y tu email.";
    bubble(say);
    stage.innerHTML =
      "<h2>Antes de empezar</h2>" +
      '<p class="muted">Son 10 preguntas cortas (unos 5 a 10 minutos). No hace falta tener la vincha todavía. La entrevista <strong>se graba con tu cámara y tu micrófono</strong> para que el responsable de SEVOR Data la revise.</p>' +
      '<div class="fields mira-fields">' +
      '<div class="field full"><label for="m-name">Nombre y apellido</label><input type="text" id="m-name" autocomplete="name" maxlength="80" value="' + esc(cand.name) + '"><p class="err" id="m-name-err"></p></div>' +
      '<div class="field full"><label for="m-email">Email</label><input type="email" id="m-email" autocomplete="email" inputmode="email" maxlength="120" value="' + esc(cand.email) + '"><p class="err" id="m-email-err"></p></div>' +
      "</div>" +
      '<label class="check mira-consent"><input type="checkbox" id="m-consent"><span>Acepto que la entrevista se grabe en <strong>video y audio</strong>. SEVOR Data guarda la grabación y mis respuestas en forma privada, solo para evaluar mi postulación, y las borra si lo pido a <a class="link" href="mailto:contacto.sevor@gmail.com">contacto.sevor@gmail.com</a> (Ley 25.326 de Protección de Datos Personales). Leí la <a class="link" href="/legal/privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a> y los <a class="link" href="/legal/terminos.html" target="_blank" rel="noopener">Términos y Condiciones</a>.</span></label>' +
      '<p class="err" id="m-consent-err"></p>' +
      '<div id="m-cam-msg"></div>' +
      '<div class="mira-actions"><span class="spacer"></span><button type="button" class="btn btn-primary btn-lg" id="m-start">Activar cámara y micrófono</button></div>' +
      '<p class="small muted">Nunca te vamos a pedir dinero.</p>';
    var started = false;
    $("#m-start").addEventListener("click", function () {
      var btn = this;
      if (started && stream) return beginInterview();
      var n = $("#m-name").value.trim(), e = $("#m-email").value.trim(), ok = true;
      ["name", "email"].forEach(function (k) { $("#m-" + k + "-err").textContent = ""; $("#m-" + k).closest(".field").classList.remove("invalid"); });
      $("#m-consent-err").textContent = "";
      if (n.length < 3) { $("#m-name-err").textContent = "Escribí tu nombre y apellido."; $("#m-name").closest(".field").classList.add("invalid"); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { $("#m-email-err").textContent = "Revisá tu email."; $("#m-email").closest(".field").classList.add("invalid"); ok = false; }
      if (!$("#m-consent").checked) { $("#m-consent-err").textContent = "Para hacer la entrevista tenés que aceptar la grabación."; ok = false; }
      if (!ok) return;
      cand.name = n; cand.email = e; cand.consentAt = new Date().toISOString();
      var msg = $("#m-cam-msg");
      if (!mediaSupported()) {
        msg.innerHTML = '<p class="callout is-warn"><span>Tu navegador no permite grabar video. Probá con Chrome (Android o computadora) o Safari actualizado (iPhone).</span></p>';
        speak("Tu navegador no permite grabar video. Probá con Chrome o Safari actualizado.");
        return;
      }
      btn.disabled = true; btn.textContent = "Pidiendo permiso…";
      openCamera().then(function () {
        started = true;
        msg.innerHTML = '<p class="callout is-info"><span>¡Listo! Te vemos y te escuchamos. Ubicate con buena luz y mirá a la cámara.</span></p>';
        btn.disabled = false; btn.textContent = "Empezar la entrevista";
        speak("¡Perfecto! Ya te veo. Cuando quieras, empezamos.");
        $("#m-name").disabled = true; $("#m-email").disabled = true; $("#m-consent").disabled = true;
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = "Probar de nuevo";
        var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
        var nodev = err && (err.name === "NotFoundError" || err.name === "OverconstrainedError");
        msg.innerHTML = '<div class="callout is-warn"><span><strong>' +
          (nodev ? "No encontramos cámara o micrófono en este dispositivo." : denied ? "Necesitamos permiso para usar la cámara y el micrófono." : "No pudimos abrir la cámara (puede estar en uso por otra app).") +
          "</strong> La entrevista no puede seguir sin la grabación. Cómo habilitarlo:" + PERM_HELP + "</span></div>";
        speak("No pude acceder a la cámara o al micrófono. Te dejo en pantalla cómo habilitarlos.");
      });
    });
    speak(say);
  }

  function beginInterview() {
    try { startRecording(); } catch (e) {
      $("#m-cam-msg").innerHTML = '<p class="callout is-warn"><span>Tu navegador no pudo iniciar la grabación. Probá con Chrome o Safari actualizado.</span></p>';
      return;
    }
    window.addEventListener("beforeunload", warnLeave);
    renderQ(0);
  }
  function warnLeave(e) { if ((step >= 0 && step < Q.length) || uploading) { e.preventDefault(); e.returnValue = ""; } }

  function renderQ(i) {
    step = i; setProgress();
    var q = Q[i];
    var first = cand.name.split(/\s+/)[0];
    var say = (i === 0 ? "Gracias, " + first + ". " : "") + q.say;
    bubble(say);
    var html = '<p class="eyebrow">Pregunta ' + (i + 1) + " de " + Q.length + "</p><h2>" + esc(q.title) + "</h2>";
    if (q.hint) html += '<p class="small muted mira-hint">' + esc(q.hint) + "</p>";
    if (q.type === "group") {
      var a = answers[q.id] || {};
      q.parts.forEach(function (p) {
        html += '<fieldset class="mira-part"><legend>' + esc(p.label) + "</legend>" + choiceList(q.id + "-" + p.id, p.options, a[p.id]) + "</fieldset>";
      });
    } else if (q.type === "single") {
      html += '<fieldset class="mira-part"><legend class="visually-hidden">' + esc(q.title) + "</legend>" + choiceList(q.id, q.options, answers[q.id]) + "</fieldset>";
    } else {
      var oa = answers[q.id] || {};
      html += '<p class="callout is-info mira-speak"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2"/></svg><span><strong>Respondé en voz alta, mirando a la cámara.</strong> Queda en la grabación. Si querés, también podés escribir un resumen.</span></p>' +
        '<div class="field full mira-open"><label for="m-open" class="visually-hidden">' + esc(q.title) + '</label>' +
        '<textarea id="m-open" rows="4" maxlength="800" placeholder="' + esc(q.placeholder || "") + '">' + esc(oa.text || "") + "</textarea></div>" +
        '<label class="check"><input type="checkbox" id="m-voice"' + (oa.voice ? " checked" : "") + '><span>Ya respondí en voz alta</span></label>';
    }
    html += '<p class="err" id="m-err" role="alert"></p>';
    html += '<div class="mira-actions">' +
      (i > 0 ? '<button type="button" class="btn btn-quiet" id="m-prev">Atrás</button>' : "") +
      '<span class="spacer"></span><button type="button" class="btn btn-primary" id="m-next">' + (i === Q.length - 1 ? "Terminar" : "Siguiente") +
      '<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>';
    stage.innerHTML = html;
    stage.querySelectorAll("input, textarea").forEach(function (r) { r.addEventListener(r.tagName === "TEXTAREA" ? "input" : "change", function () { $("#m-err").textContent = ""; }); });
    var prev = $("#m-prev");
    if (prev) prev.addEventListener("click", function () { collect(q); renderQ(i - 1); });
    $("#m-next").addEventListener("click", function () { next(q, i); });
    focusFirst();
    speak(say);
  }

  function collect(q) {
    if (q.type === "group") {
      var a = {}, all = true;
      q.parts.forEach(function (p) {
        var c = stage.querySelector('input[name="' + q.id + "-" + p.id + '"]:checked');
        if (c) a[p.id] = +c.value; else all = false;
      });
      answers[q.id] = a;
      return all ? true : "Elegí una opción en cada pregunta.";
    }
    if (q.type === "single") {
      var c = stage.querySelector('input[name="' + q.id + '"]:checked');
      if (c) { answers[q.id] = +c.value; return true; }
      return "Elegí una opción.";
    }
    var v = $("#m-open").value.trim(), voiced = $("#m-voice").checked;
    answers[q.id] = { text: v, voice: voiced };
    return (voiced || v.length >= q.minChars) ? true : "Respondé en voz alta y marcá “Ya respondí en voz alta”, o escribí tu respuesta.";
  }

  function next(q, i) {
    var ok = collect(q);
    if (ok !== true) { $("#m-err").textContent = ok; speak(ok); return; }
    if (q.type === "group") {
      var ko = null;
      q.parts.forEach(function (p) { var o = p.options[answers[q.id][p.id]]; if (o && o.ko && !ko) ko = o.ko; });
      if (ko) return finish();
    }
    if (i < Q.length - 1) renderQ(i + 1); else finish();
  }

  /* ---------- Final ---------- */
  function sendBackup(r, extra) {
    if (sentBackup) return Promise.resolve(true);
    sentBackup = true;
    return fetch(FORMSUBMIT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(buildPayload(cand, answers, r, extra))
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function finish() {
    var r = evaluate(answers);
    step = Q.length; setProgress();
    var first = cand.name.split(/\s+/)[0];
    var now = Date.now();
    lsSet(K_DONE, JSON.stringify({ ts: now, ko: r.knockout || null }));
    var session = "mira-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var say, html;
    if (r.knockout) {
      var why = r.knockout === "edad" ? "Por ahora solo podemos sumar a personas mayores de 18 años." : "Por ahora solo podemos sumar a personas que viven en Argentina.";
      say = "Gracias por tu tiempo, " + first + ". " + why;
      html = '<div class="mira-result is-no"><p class="eyebrow">Entrevista terminada</p><h2>Gracias por tu tiempo, ' + esc(first) + "</h2>" +
        '<p class="muted">' + esc(why) + "</p>" +
        '<div class="cta-row"><a class="btn btn-primary" href="/guias/">Leer las guías</a><a class="btn btn-secondary" href="/">Volver al inicio</a></div>';
    } else {
      say = "¡Gracias! Demian, el responsable de SEVOR Data, va a revisar tu entrevista y te vamos a escribir por email.";
      html = '<div class="mira-result is-ok"><div class="result-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.4 2.9 2.9 6-6.3"/></svg></div>' +
        '<p class="eyebrow">Entrevista completa</p><h2>¡Gracias, ' + esc(first) + "!</h2>" +
        '<p class="muted">Demian, el responsable de SEVOR Data, va a revisar tu entrevista y te vamos a escribir por email a <strong>' + esc(cand.email) + "</strong>. Si tu postulación avanza, te mandamos el link para el registro y el contrato.</p>" +
        '<div class="cta-row"><a class="btn btn-secondary" href="/guias/">Mientras tanto, leé las guías</a></div>';
    }
    html += '<div class="mira-upload" id="m-up"><div class="mira-bar"><i id="m-up-bar"></i></div><p class="small muted" id="m-up-t" aria-live="polite">Preparando tu entrevista…</p>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="m-up-retry" hidden>Reintentar subida</button></div>' +
      '<p class="small muted mira-upnote">No cierres esta página hasta que diga “Entrevista enviada”.</p></div>';
    bubble(say);
    stage.innerHTML = html;
    focusFirst();
    speak(say);

    var upBar = $("#m-up-bar"), upT = $("#m-up-t"), retry = $("#m-up-retry");
    function prog(f, t) { upBar.style.transform = "scaleX(" + Math.max(0, Math.min(1, f)) + ")"; if (t) upT.textContent = t; }
    uploading = true;
    stopRecording().then(function () {
      closeCamera();
      var blob = new Blob(recChunks, { type: (recMime || "video/webm").split(";")[0] });
      var dur = recStart ? Math.round((Date.now() - recStart) / 1000) : 0;
      var code = approvalCode(cand.email);
      var info = {
        name: cand.name, email: cand.email, ko: r.knockout || "", pct: r.pct, passed: r.passed,
        durationSec: dur, capped: recCapped, approvalCode: code,
        approvalLink: r.knockout ? "" : approvalLink(code),
        summary: buildPayload(cand, answers, r, { session: session })
      };
      var videoNote = UPLOAD_URL ? ("Subido a Google Drive (carpeta “SEVOR Data - Entrevistas Mirá”), sesión " + session + " · " + fmtMB(blob.size) + " · " + fmtClock(dur * 1000) + (recCapped ? " (cortado a los 12 min)" : "")) : "NO subido: falta configurar UPLOAD_URL (Apps Script)";
      sendBackup(r, { video: videoNote, session: session });
      if (!UPLOAD_URL || !blob.size) {
        uploading = false;
        prog(1, blob.size ? "Entrevista enviada." : "Entrevista enviada (sin video).");
        $(".mira-upnote").hidden = true;
        return;
      }
      var meta = { info: info, resumeFrom: 0 };
      function attempt() {
        retry.hidden = true;
        uploadVideo(blob, session, meta, prog).then(function () {
          uploading = false;
          prog(1, "Entrevista enviada. ¡Gracias!");
          $(".mira-upnote").hidden = true;
        }).catch(function () {
          upT.textContent = "Se cortó la subida. Revisá tu conexión (mejor Wi-Fi) y tocá “Reintentar subida”.";
          retry.hidden = false;
        });
      }
      retry.addEventListener("click", attempt);
      attempt();
    });
  }

  function renderLocked(done) {
    step = -1; setProgress();
    var when = fmtDate(done.ts + RETRY_DAYS * DAY);
    var say = done.ko
      ? "¡Hola de nuevo! Ya hiciste la entrevista hace poco. Vas a poder repetirla desde el " + when + "."
      : "¡Hola de nuevo! Ya recibimos tu entrevista. Demian la va a revisar y te vamos a escribir por email.";
    var html = done.ko
      ? '<h2>Ya hiciste la entrevista</h2><p class="muted">Vas a poder repetirla desde el <strong>' + esc(when) + "</strong>.</p>"
      : '<h2>Ya recibimos tu entrevista</h2><p class="muted">Demian, el responsable de SEVOR Data, la va a revisar y te vamos a escribir por email. Si tu postulación avanza, te mandamos el link para el registro.</p>';
    html += '<div class="cta-row"><a class="btn btn-primary" href="/guias/">Leer las guías</a><a class="btn btn-secondary" href="/">Volver al inicio</a></div>';
    bubble(say); lastSay = say;
    stage.innerHTML = html;
  }

  // Expuesto para pruebas offline.
  window.SEVOR_MIRA = { Q: Q, MAX: MAX, PASS_PCT: PASS_PCT, evaluate: evaluate, buildPayload: buildPayload, scoreOpen: scoreOpen, uploadUrl: function () { return UPLOAD_URL; }, _setUploadUrl: function (u) { UPLOAD_URL = u; } };

  function init() {
    root = $("#mira");
    if (!root) return;
    stage = $("#mira-stage"); bar = $("#mira-bar"); barTxt = $("#mira-progress-t");
    $(".mira-progress").setAttribute("aria-valuemax", String(Q.length));
    var muteBtn = $("#mira-mute"), replay = $("#mira-replay");
    function syncMute() {
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      muteBtn.querySelector("span").textContent = muted ? "Activar voz" : "Silenciar";
    }
    if (!synth) { muteBtn.hidden = true; replay.hidden = true; $("#mira-novoice").hidden = false; }
    else {
      syncMute();
      muteBtn.addEventListener("click", function () { muted = !muted; lsSet(K_MUTE, muted ? "1" : "0"); syncMute(); if (muted) stopSpeak(); else speak(lastSay); });
      replay.addEventListener("click", function () { if (muted) { muted = false; lsSet(K_MUTE, "0"); syncMute(); } speak(lastSay); });
    }
    window.addEventListener("pagehide", stopSpeak);
    var done = null;
    try { done = JSON.parse(lsGet(K_DONE) || "null"); } catch (e) { done = null; }
    if (done && done.ts && Date.now() - done.ts < RETRY_DAYS * DAY && !/[?&]repetir=1/.test(location.search)) return renderLocked(done);
    renderIntro();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
