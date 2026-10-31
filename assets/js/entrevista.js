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
          { v: "Sí, tengo 18 o más", pts: 0, yes: true, kw: ["mayor( de edad)?", "tengo (1[89]|[2-9]\\d)", "(1[89]|[2-9]\\d) anos", "18 o mas", "mas de 18"] },
          { v: "No, soy menor de 18", pts: 0, ko: "edad", no: true, kw: ["(soy )?menor( de edad)?", "tengo (1[0-7]|[1-9])( anos)?", "(1[0-7]) anos"] } ] },
        { id: "pais", label: "¿Vivís en Argentina?", options: [
          { v: "Sí, vivo en Argentina", pts: 0, yes: true, kw: ["(vivo en )?argentina", "vivo aca", "~buenos aires", "~bahia blanca", "~cordoba", "~rosario", "~mendoza", "~tucuman", "~salta", "~neuquen", "~la plata", "~mar del plata"] },
          { v: "No, vivo en otro país", pts: 0, ko: "pais", no: true, kw: ["no vivo en argentina", "(vivo en )?otro pais", "afuera", "(en el )?exterior", "uruguay", "chile", "paraguay", "bolivia", "peru", "brasil", "espana", "venezuela", "colombia", "mexico", "estados unidos"] } ] }
      ], max: 0
    },
    {
      id: "celular", title: "Tu celular",
      say: "Contame qué celular tenés y cuánto espacio libre le queda, más o menos.",
      hint: "La app de grabación funciona con iPhone 12 a 18 (no modelos “e”, iOS 17.4 o superior), Google Pixel 6 a 10 y Samsung Galaxy S21 a S26.",
      type: "group",
      parts: [
        { id: "modelo", label: "Modelo", options: [
          { v: "iPhone 12 a 18 (no “e”)", pts: 10, ok: true, kw: ["(un )?iphone (1[2-8]|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho)( pro| plus| max| mini)*"] },
          { v: "Google Pixel 6 a 10", pts: 10, ok: true, kw: ["(google )?pixel ([6-9]|10|seis|siete|ocho|nueve|diez)( pro| xl| a| fold)*"] },
          { v: "Samsung Galaxy S21 a S26", pts: 10, ok: true, kw: ["((samsung|galaxy) )*(s|ese) ?(2[1-6]|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis)( ultra| plus| fe| mas)*"] },
          { v: "Otro Android", pts: 0, kw: ["otro android", "~android", "~samsung", "~galaxy", "~motorola", "~moto", "~xiaomi", "~redmi", "~huawei", "~lg", "~nokia", "~tcl", "~oppo", "~realme", "~honor", "~zte", "~poco", "pixel [1-5]", "(samsung |galaxy )*(a|m|j) ?\\d+"] },
          { v: "Otro iPhone (11 o anterior, o modelo “e”)", pts: 0, kw: ["otro iphone", "iphone ([1-9]|1[01]|se|x|xr|xs|once|diez|ocho|siete)( pro| plus| max| mini)*", "iphone (1[2-8]) ?e"] } ] },
        { id: "espacio", label: "Espacio libre", options: [
          { v: "Más de 64 GB", pts: 5, kw: ["mas de (64|sesenta y cuatro)", "(6[5-9]|[7-9]\\d|\\d{3,}) ?(gb|gigas?|g)?", "(un )?(tera|tb)", "mucho( espacio)?"] },
          { v: "Entre 16 y 64 GB", pts: 3, kw: ["entre (16|dieciseis) y (64|sesenta y cuatro)", "(1[6-9]|[2-5]\\d|6[0-4]) ?(gb|gigas?|g)", "~(32|64)"] },
          { v: "Menos de 16 GB", pts: 0, kw: ["menos de (16|dieciseis)", "([0-9]|1[0-5]) ?(gb|gigas?|g)", "poco( espacio)?", "casi nada", "(esta )?lleno"] },
          { v: "No sé", pts: 1, kw: ["no se", "ni idea", "no tengo idea", "no estoy seguro", "no estoy segura"] } ] }
      ], max: 15
    },
    {
      id: "vincha", title: "Vincha de cabeza",
      say: "Para grabar en primera persona usamos el celular en una vincha de cabeza. ¿Tenés una, o podrías conseguirla?",
      type: "single",
      options: [ { v: "Ya tengo una", pts: 10, yes: true, kw: ["ya tengo( una)?", "tengo una", "si tengo"] },
        { v: "No, pero puedo comprar una", pts: 8, kw: ["(puedo|podria|voy a) (comprar|conseguir)", "la compro", "~comprar", "~conseguir"] },
        { v: "No puedo conseguirla", pts: 0, kw: ["no (puedo|podria)( conseguir(la)?| comprar(la)?)?", "imposible"] } ],
      max: 10
    },
    {
      id: "horas", title: "Disponibilidad",
      say: "No hay horario fijo. ¿Cuántas horas por semana podrías dedicarle, aproximadamente?",
      type: "single",
      options: [ { v: "Menos de 5 horas", pts: 3, kw: ["menos de (5|cinco)", "(1|2|3|4|una|un par de|dos|tres|cuatro) horas?", "~poco"] },
        { v: "De 5 a 10 horas", pts: 7, kw: ["(de |entre )?(5|cinco) (a|y) (10|diez)", "([5-9]|cinco|seis|siete|ocho|nueve) horas"] },
        { v: "De 10 a 20 horas", pts: 10, kw: ["(de |entre )?(10|diez) (a|y) (20|veinte)", "(1\\d|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve) horas"] },
        { v: "Más de 20 horas", pts: 10, kw: ["mas de (20|veinte)", "([2-9]\\d|veinte|veinticinco|treinta|cuarenta|cincuenta) horas", "todo el dia", "~mucho"] } ],
      max: 10
    },
    {
      id: "comodidad", title: "Grabarte las manos",
      say: "En los videos se ven tus manos haciendo tareas del hogar o de tu trabajo: cocinar, limpiar, ordenar. ¿Te sentís cómodo o cómoda grabándolo?",
      type: "single",
      options: [ { v: "Sí, sin problema", pts: 10, yes: true, kw: ["sin problemas?", "ningun problema", "comod[oa]", "tranqui(lo|la)?", "re bien"] },
        { v: "Sí, aunque tengo algunas dudas", pts: 5, kw: ["(algunas |unas )?dudas?", "mas o menos", "aunque", "~no se"] },
        { v: "No me siento cómodo/a", pts: 0, no: true, kw: ["no me siento( comod[oa])?", "incomod[oa]", "no me gusta", "prefiero que no", "prefiero no"] } ],
      max: 10
    },
    {
      id: "consentimiento", title: "Situación de práctica",
      say: "Una situación. Estás grabando cómo cocinás y entra a la cocina otra persona de tu casa, que no firmó ningún consentimiento. ¿Qué hacés?",
      type: "single",
      options: [
        { v: "Sigo grabando: es mi casa y no pasa nada", pts: 0, kw: ["sigo grabando", "es mi casa", "no pasa nada"] },
        { v: "Pauso la grabación y retomo cuando ya no aparece en cuadro", pts: 15, correct: true, kw: ["paus[oa]r?( la grabacion)?", "(paro|corto|freno|detengo|apago)( la grabacion| de grabar| el video)?", "dejo de grabar", "retomo", "no aparece"] },
        { v: "Sigo grabando y después le aviso", pts: 0, kw: ["(y )?despues le aviso", "le aviso( despues)?", "aviso despues"] },
        { v: "Aprovecho y filmo también la mesada con unas boletas y papeles del banco", pts: 0, kw: ["aprovecho", "boletas", "papeles", "(del )?banco", "mesada", "filmo"] } ],
      explain: "Nunca grabamos caras ni personas sin su consentimiento, ni menores, ni documentos o datos privados.",
      max: 15
    },
    {
      id: "facturacion", title: "Facturación",
      say: "Trabajás como contratista independiente, así que hace falta poder facturar. ¿Sos monotributista, o te podrías inscribir?",
      type: "single",
      options: [ { v: "Ya soy monotributista", pts: 10, yes: true, kw: ["(ya |si )?soy monotributista", "tengo (el )?monotributo", "ya facturo", "ya estoy inscript[oa]"] },
        { v: "No, pero me puedo inscribir", pts: 8, kw: ["(me )?puedo inscribir(me)?", "me inscribo", "~inscribir(me)?", "~puedo"] },
        { v: "No sé cómo, pero quiero aprender", pts: 5, kw: ["no se como", "(quiero )?aprender", "no se"] },
        { v: "No quiero facturar", pts: 0, kw: ["no quiero( facturar)?", "no facturo"] } ],
      max: 10
    },
    {
      id: "wifi", title: "Conexión para subir videos",
      say: "Los videos pesan bastante. ¿Tenés Wi-Fi estable para subirlos?",
      type: "single",
      options: [ { v: "Sí, Wi-Fi estable", pts: 10, yes: true, kw: ["(wi ?fi |es |muy )?estable", "tengo (wi ?fi|internet)", "buena conexion", "anda bien", "fibra( optica)?"] },
        { v: "Tengo Wi-Fi pero a veces se corta", pts: 5, kw: ["se corta", "a veces", "inestable", "mas o menos", "anda mal", "se cae"] },
        { v: "No tengo Wi-Fi, solo datos móviles", pts: 2, no: true, kw: ["no tengo (wi ?fi|internet)", "(solo |solamente )?datos( moviles)?", "con el celular", "4g", "5g"] } ],
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

  /* ---------- Respuesta por voz: interpretar lo que dijo (puro, testeable) ---------- */
  function norm(s) {
    return String(s || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_/]/g, " ").replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  var ORD = [
    ["uno", "una", "primera", "primero", "1", "a"],
    ["dos", "segunda", "segundo", "2", "b", "be"],
    ["tres", "tercera", "tercero", "3", "c", "ce"],
    ["cuatro", "cuarta", "cuarto", "4", "d", "de"],
    ["cinco", "quinta", "quinto", "5", "e"]
  ];
  var ORD_FILL = { la: 1, el: 1, opcion: 1, numero: 1, letra: 1, elijo: 1, quiero: 1, me: 1, quedo: 1, con: 1, es: 1, "": 1 };
  function ordinalOf(t, n) {
    // Solo si la frase entera es "la segunda", "opción 3", "la b"…: los números sueltos dentro de una frase son contenido.
    var rest = t.split(" ").filter(function (w) { return !ORD_FILL[w]; });
    if (rest.length !== 1) return null;
    for (var i = 0; i < Math.min(n, ORD.length); i++) if (ORD[i].indexOf(rest[0]) >= 0) return i;
    return null;
  }
  var RX_YES = /^(si|sip|sii|claro|obvio|dale|por supuesto|correcto|exacto|afirmativo|asi es)( |$)/;
  var RX_NO = /^(no|nop|para nada|nunca|negativo)( |$)/;
  var rxCache = {};
  function kwRx(src) { return rxCache[src] || (rxCache[src] = new RegExp("(?:^| )(?:" + src + ")(?= |$)")); }
  function kwScores(t, options) {
    return options.map(function (o) {
      var sc = 0;
      (o.kw || []).forEach(function (k) {
        var weak = k.charAt(0) === "~", m = t.match(kwRx(weak ? k.slice(1) : k));
        if (m) sc += m[0].trim().length * (weak ? 0.3 : 1);
      });
      if (!o.kw) norm(o.v).split(" ").forEach(function (w) { if (w.length >= 5 && kwRx(w).test(t)) sc += w.length * 0.3; });
      return sc;
    });
  }
  function bestOf(sc) {
    var b = -1, bs = 0, second = 0;
    sc.forEach(function (v, i) { if (v > bs) { second = bs; bs = v; b = i; } else if (v > second) second = v; });
    return bs > 0 && bs > second ? b : null;
  }
  // Devuelve el índice de la opción que corresponde a lo dicho, o null si no se entiende.
  function matchOption(text, options, kwOnly) {
    var t = norm(text);
    if (!t) return null;
    if (!kwOnly) { var o = ordinalOf(t, options.length); if (o != null) return o; }
    var b = bestOf(kwScores(t, options));
    if (b != null || kwOnly) return b;
    var flag = RX_YES.test(t) ? "yes" : RX_NO.test(t) ? "no" : null;
    if (flag) for (var i = 0; i < options.length; i++) if (options[i][flag]) return i;
    return null;
  }
  // Pregunta con varias partes: completa las que se reconocen por palabras clave y, para la primera
  // sin responder, acepta también "sí/no" u "la primera". "Sí, a las dos" responde todas.
  function matchGroup(text, parts, current) {
    var t = norm(text), out = {}, pending = parts.filter(function (p) { return current[p.id] == null; });
    if (!t || !pending.length) return out;
    pending.forEach(function (p) { var i = matchOption(t, p.options, true); if (i != null) out[p.id] = i; });
    var first = pending[0];
    if (out[first.id] == null) {
      var i = matchOption(t, first.options, false);
      if (i != null) out[first.id] = i;
    }
    if (RX_YES.test(t) && /(las dos|ambas|a todo|todas|si y si|si si)/.test(t)) {
      pending.forEach(function (p) { if (out[p.id] == null) for (var j = 0; j < p.options.length; j++) if (p.options[j].yes) { out[p.id] = j; break; } });
    }
    return out;
  }

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

  function heardTxt(h) { return h ? " · dijo: “" + h + "”" : ""; }
  function answerText(q, a, heard) {
    heard = heard || {};
    if (q.type === "group") return q.parts.map(function (p) {
      var hp = heard[p.id];
      return p.label + ": " + (a && a[p.id] != null ? p.options[a[p.id]].v + (hp ? heardTxt(hp) : " (tocó la opción)") : "—");
    }).join(" | ");
    if (q.type === "single") return a != null ? q.options[a].v + (heard.text ? heardTxt(heard.text) : " (tocó la opción)") : "—";
    var t = String((a && a.text) || "").trim();
    var d = String(heard.text || "").trim();
    return (t || "(sin texto)") +
      (d ? (norm(d) === norm(t) ? " · (dictado por voz)" : " · Transcripción por voz: “" + d + "”") : "") +
      (a && a.voice ? " · Marcó que respondió en voz alta (ver video)" : "");
  }
  function transcriptsText(answers, heard) {
    var lines = [];
    Q.forEach(function (q, i) {
      var h = heard[q.id];
      if (!h) return;
      if (q.type === "group") q.parts.forEach(function (p) { if (h[p.id]) lines.push((i + 1) + ". " + p.label + ": “" + h[p.id] + "”"); });
      else if (h.text) lines.push((i + 1) + ". " + q.title + ": “" + h.text + "”");
    });
    return lines.length ? lines.join("\n") : "Sin respuestas por voz (respondió tocando o escribiendo)";
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
    var heard = extra.heard || voiceLog;
    Q.forEach(function (q, i) {
      if (r.knockout && q.id !== "basicos" && answers[q.id] == null) return;
      p[(i + 1) + ". " + q.title] = answerText(q, answers[q.id], heard[q.id]) + (q.max ? "  [" + (r.detail[q.id] || 0) + "/" + q.max + "]" : "");
    });
    p["Respuesta por voz (micrófono)"] = extra.voiceStatus || voiceStatusText();
    p["Transcripciones (lo que dijo)"] = transcriptsText(answers, heard);
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
  var lastSay = "", speakTok = 0;
  // Mirá habla; al terminar (evento 'end', con respaldo por sondeo porque algunos Chrome no lo disparan)
  // se activa el micrófono para escuchar la respuesta. Nunca escucha mientras habla.
  function speak(text) {
    lastSay = text;
    stopListen(true);
    var tok = ++speakTok, done = false, poll = null;
    function end() {
      if (done) return;
      done = true; clearInterval(poll);
      if (tok !== speakTok) return;
      setTalking(false);
      setTimeout(function () { if (tok === speakTok) autoListen(); }, 300);
    }
    if (!synth || muted || !text) { setTimeout(end, 0); return; }
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "es-AR"; }
      u.rate = 1; u.pitch = 1.05;
      u.onstart = function () { if (tok === speakTok) setTalking(true); };
      u.onend = u.onerror = end;
      synth.speak(u);
      var t0 = Date.now(), cap = 4000 + text.length * 110;
      poll = setInterval(function () {
        if (tok !== speakTok) { clearInterval(poll); return; }
        var el = Date.now() - t0;
        if ((el > 1500 && !synth.speaking && !synth.pending) || el > cap) end();
      }, 400);
    } catch (e) { end(); }
  }
  function stopSpeak() { speakTok++; try { if (synth) synth.cancel(); } catch (e) {} setTalking(false); }
  function setTalking(on) { var av = $("#mira-avatar"); if (av) av.classList.toggle("is-talking", !!on); }

  /* ---------- Micrófono: responder hablando (SpeechRecognition) ----------
     La grabación (getUserMedia + MediaRecorder) sigue siempre. El reconocimiento corre en paralelo;
     si falla, no existe en el navegador o le quita el micrófono a la grabación, se oculta y queda tocar/escribir. */
  var SRClass = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var voiceAvail = !!SRClass;
  var voiceWhy = SRClass ? "" : "el navegador no tiene reconocimiento de voz";
  var voiceUsed = false;
  var FATAL = { "audio-capture": "no pudo usar el micrófono", "not-allowed": "permiso de micrófono denegado", "network": "sin conexión con el servicio de voz", "service-not-allowed": "servicio de voz no permitido", "language-not-supported": "idioma no soportado" };
  var rec = null, listenCtx = null;
  var voiceLog = {};          // transcripciones por pregunta (se envían en el resumen)
  var autoHold = false;       // tras 2 "no te entendí" seguidos, deja de escuchar sola
  var noMatch = 0, pendingPick = null;

  function voiceStatusText() {
    if (voiceAvail) return voiceUsed ? "Usó el micrófono para responder" : "Disponible (no la usó)";
    return "No disponible: " + (voiceWhy || "—") + ". Respondió tocando o escribiendo.";
  }
  function disableVoice(why) {
    if (!voiceAvail) return;
    voiceAvail = false; voiceWhy = why || "error";
    stopListen(true);
    var vb = $("#m-voicebar"); if (vb) vb.hidden = true;
    var hd = $("#m-heard"); if (hd) hd.hidden = true;
    var fb = $("#m-voice-fb"); if (fb) fb.hidden = false;
    var st = $("#m-speak-t"); if (st) st.innerHTML = "<strong>Respondé en voz alta, mirando a la cámara.</strong> Queda en la grabación. Si querés, también podés escribir un resumen.";
  }
  function setListenUI(on) {
    var vb = $("#m-voicebar"); if (!vb) return;
    vb.classList.toggle("is-listening", !!on);
    var b = $("#m-mic"); b.setAttribute("aria-pressed", on ? "true" : "false");
    b.querySelector("span").textContent = on ? "Detener" : "Hablar";
    $("#m-listen-t").textContent = on ? "Te escucho…" : "Tocá “Hablar” para responder con tu voz";
  }
  function startListen(ctx) {
    if (!voiceAvail || rec) return false;
    var at = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
    if (at && (at.readyState === "ended")) return false;
    var r;
    try { r = new SRClass(); } catch (e) { disableVoice("no se pudo iniciar el reconocimiento"); return false; }
    r.lang = "es-AR"; r.interimResults = true; r.continuous = !!ctx.continuous; r.maxAlternatives = 3;
    ctx.got = false; ctx.finals = [];
    rec = r; listenCtx = ctx;
    r.onresult = function (ev) {
      if (rec !== r) return;
      var interim = "", alts = null;
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i], tx = String(res[0] && res[0].transcript || "").trim();
        if (res.isFinal) {
          ctx.finals[i] = tx;
          alts = []; for (var j = 0; j < res.length; j++) if (res[j] && res[j].transcript) alts.push(String(res[j].transcript).trim());
        } else interim += (interim ? " " : "") + tx;
      }
      var fin = dedupe(ctx.finals);
      if (fin || interim) { ctx.got = true; voiceUsed = true; }
      if (ctx.onText) ctx.onText(fin, interim);
      if (alts && alts.length && ctx.onFinal) ctx.onFinal(alts, fin);
    };
    r.onerror = function (ev) {
      if (rec !== r) return;
      var e = ev && ev.error;
      if (FATAL[e]) disableVoice(FATAL[e]);
    };
    r.onend = function () {
      if (rec !== r) return;
      rec = null; var c = listenCtx; listenCtx = null;
      setListenUI(false);
      if (c && c.onEnd && voiceAvail) c.onEnd(c.got, !!c.stopped);
    };
    try { r.start(); } catch (e) { rec = null; listenCtx = null; disableVoice("no se pudo iniciar el reconocimiento"); return false; }
    setListenUI(true);
    return true;
  }
  // Android a veces repite el texto acumulado en cada resultado: si uno empieza con el anterior, se queda el más largo.
  function dedupe(arr) {
    var out = [];
    arr.forEach(function (t) {
      if (!t) return;
      var last = out[out.length - 1];
      if (last && norm(t).indexOf(norm(last)) === 0) out[out.length - 1] = t;
      else if (!(last && norm(last).indexOf(norm(t)) === 0)) out.push(t);
    });
    return out.join(" ");
  }
  function stopListen(abort) {
    var r = rec;
    if (!r) return;
    if (listenCtx) listenCtx.stopped = true;
    if (abort) { rec = null; listenCtx = null; setListenUI(false); }
    try { abort ? r.abort() : r.stop(); } catch (e) {}
  }
  function watchMicConflict(s) {
    // Si al reconocer la voz el sistema le corta el audio a la grabación, priorizamos la grabación.
    var at = s.getAudioTracks()[0];
    if (!at) return;
    at.addEventListener("mute", function () { if (rec) disableVoice("el micrófono no se puede compartir con la grabación en este dispositivo"); });
  }
  function checkRecorderAfterListen() {
    setTimeout(function () {
      if (rec && recorder && recorder.state !== "recording" && !recCapped) disableVoice("conflicto con la grabación");
    }, 1500);
  }
  function autoListen() {
    if (step < 0 || step >= Q.length || !voiceAvail || autoHold || pendingPick || rec) return;
    if (!stage || !$("#m-voicebar")) return;
    listenCurrent();
  }
  function listenCurrent() {
    var q = Q[step];
    if (!q) return;
    var ok = q.type === "open" ? listenOpen(q) : listenChoice(q);
    if (ok) checkRecorderAfterListen();
  }

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
      watchMicConflict(s);
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
      '<p class="muted">Son 10 preguntas cortas (unos 5 a 10 minutos). No hace falta tener la vincha todavía. La entrevista <strong>se graba con tu cámara y tu micrófono</strong> para que el responsable de SEVOR Data la revise. Podés <strong>responder hablando</strong>: después de cada pregunta Mirá te escucha. Si preferís, tocá o escribí.</p>' +
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

  var MIC_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2"/></svg>';

  function renderQ(i) {
    clearPick(); stopListen(true);
    step = i; setProgress();
    autoHold = false; noMatch = 0;
    var q = Q[i];
    var first = cand.name.split(/\s+/)[0];
    var say = (i === 0 ? "Gracias, " + first + ". " : "") + q.say;
    bubble(say);
    var html = '<p class="eyebrow">Pregunta ' + (i + 1) + " de " + Q.length + "</p><h2>" + esc(q.title) + "</h2>";
    if (q.hint) html += '<p class="small muted mira-hint">' + esc(q.hint) + "</p>";
    var voiceBar =
      '<div class="mira-listen" id="m-voicebar"' + (voiceAvail ? "" : " hidden") + '>' +
      '<button type="button" class="btn btn-secondary btn-sm mira-mic" id="m-mic" aria-pressed="false">' + MIC_SVG + "<span>Hablar</span></button>" +
      '<p class="mira-listen-t"><i class="mira-listen-dot" aria-hidden="true"></i><span id="m-listen-t" aria-live="polite">Tocá “Hablar” para responder con tu voz</span></p></div>';
    if (q.type === "group" || q.type === "single") {
      html += voiceBar +
        '<p class="small muted mira-heard" id="m-heard" hidden></p>' +
        '<p class="small muted" id="m-voice-fb"' + (voiceAvail ? " hidden" : "") + '>Tocá la opción que corresponda.</p>';
    }
    if (q.type === "group") {
      var a = answers[q.id] || {};
      q.parts.forEach(function (p) {
        html += '<fieldset class="mira-part"><legend>' + esc(p.label) + "</legend>" + choiceList(q.id + "-" + p.id, p.options, a[p.id]) + "</fieldset>";
      });
    } else if (q.type === "single") {
      html += '<fieldset class="mira-part"><legend class="visually-hidden">' + esc(q.title) + "</legend>" + choiceList(q.id, q.options, answers[q.id]) + "</fieldset>";
    } else {
      var oa = answers[q.id] || {};
      html += '<p class="callout is-info mira-speak">' + MIC_SVG.replace("<svg ", '<svg width="18" height="18" ') + '<span id="m-speak-t">' + (voiceAvail
          ? "<strong>Respondé en voz alta, mirando a la cámara.</strong> Mirá escribe lo que decís en el cuadro; podés corregirlo o escribir."
          : "<strong>Respondé en voz alta, mirando a la cámara.</strong> Queda en la grabación. Si querés, también podés escribir un resumen.") + "</span></p>" +
        voiceBar +
        '<div class="field full mira-open"><label for="m-open" class="visually-hidden">' + esc(q.title) + '</label>' +
        '<textarea id="m-open" rows="4" maxlength="1200" placeholder="' + esc(q.placeholder || "") + '">' + esc(oa.text || "") + "</textarea></div>" +
        '<label class="check" id="m-voice-fb"' + (voiceAvail ? " hidden" : "") + '><input type="checkbox" id="m-voice"' + (oa.voice ? " checked" : "") + '><span>Ya respondí en voz alta</span></label>';
    }
    html += '<div class="mira-picked" id="m-picked" hidden role="status"><span id="m-picked-t"></span><button type="button" class="btn btn-quiet btn-sm" id="m-undo">Deshacer</button></div>';
    html += '<p class="err" id="m-err" role="alert"></p>';
    html += '<div class="mira-actions">' +
      (i > 0 ? '<button type="button" class="btn btn-quiet" id="m-prev">Atrás</button>' : "") +
      '<span class="spacer"></span><button type="button" class="btn btn-primary" id="m-next">' + (i === Q.length - 1 ? "Terminar" : "Siguiente") +
      '<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>';
    stage.innerHTML = html;
    stage.querySelectorAll("input, textarea").forEach(function (r) {
      r.addEventListener(r.tagName === "TEXTAREA" ? "input" : "change", function (ev) {
        $("#m-err").textContent = "";
        if (r.type === "radio") { // tocó una opción: manda el toque
          clearPick();
          markHeard(q, r.name, null);
        }
      });
    });
    var ta = $("#m-open");
    if (ta) ta.addEventListener("keydown", function () { if (rec) stopListen(false); });
    $("#m-mic").addEventListener("click", function () {
      if (rec) { stopListen(false); return; }
      stopSpeak(); clearPick(); autoHold = false; noMatch = 0;
      listenCurrent();
    });
    $("#m-undo").addEventListener("click", undoPick);
    var prev = $("#m-prev");
    if (prev) prev.addEventListener("click", function () { stopListen(true); clearPick(); collect(q); renderQ(i - 1); });
    $("#m-next").addEventListener("click", function () { next(q, i); });
    focusFirst();
    speak(say);
  }

  // Si eligió tocando, se borra lo que se había entendido por voz para esa parte.
  function markHeard(q, name, text) {
    if (q.type === "group") {
      var pid = name.slice(q.id.length + 1);
      voiceLog[q.id] = voiceLog[q.id] || {};
      if (text) voiceLog[q.id][pid] = text; else delete voiceLog[q.id][pid];
    } else if (q.type === "single") {
      if (text) voiceLog[q.id] = { text: text }; else delete voiceLog[q.id];
    }
  }

  function listenOpen(q) {
    var ta = $("#m-open");
    if (!ta) return false;
    var base = ta.value.trim();
    var prevLog = (voiceLog[q.id] && voiceLog[q.id].text) || "";
    var emptyRuns = 0;
    function join() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
    var ctx = {
      continuous: true,
      onText: function (fin, interim) {
        ta.value = join(base, fin, interim);
        if (fin) voiceLog[q.id] = { text: join(prevLog, fin) };
        $("#m-err").textContent = "";
      },
      onEnd: function (got, stopped) {
        if (step < 0 || Q[step] !== q || !$("#m-open")) return;
        emptyRuns = got ? 0 : emptyRuns + 1;
        // Android corta tras un silencio: seguimos escuchando, salvo que lo haya detenido o no hable (2 veces).
        if (!stopped && emptyRuns < 2 && !pendingPick) setTimeout(function () { if (!rec && Q[step] === q && $("#m-open") === ta) { base = ta.value.trim(); prevLog = (voiceLog[q.id] && voiceLog[q.id].text) || ""; startListen(ctx); } }, 250);
      }
    };
    return startListen(ctx);
  }

  function listenChoice(q) {
    var heard = $("#m-heard");
    var ctx = {
      continuous: false,
      onText: function (fin, interim) {
        var t = fin || interim;
        if (t && heard) { heard.hidden = false; heard.textContent = "Te escuché: “" + t + "”"; }
      },
      onFinal: function (alts, fin) {
        if (ctx.handled) return;
        ctx.handled = true;
        applyVoiceChoice(q, alts, fin);
      },
      onEnd: function (got) {
        if (!got && !ctx.handled) $("#m-listen-t").textContent = "No escuché nada. Tocá “Hablar” o una opción.";
      }
    };
    return startListen(ctx);
  }

  function setRadio(name, idx) {
    var el = stage.querySelector('input[name="' + name + '"][value="' + idx + '"]');
    if (!el) return;
    el.checked = true;
    var lab = el.closest(".mira-opt");
    if (lab) { lab.classList.remove("is-voice"); void lab.offsetWidth; lab.classList.add("is-voice"); }
    $("#m-err").textContent = "";
  }
  function radioVal(name) { var c = stage.querySelector('input[name="' + name + '"]:checked'); return c ? +c.value : null; }

  function applyVoiceChoice(q, alts, fin) {
    var picked = null, said = fin || alts[0];
    if (q.type === "single") {
      for (var k = 0; k < alts.length && picked == null; k++) { var m = matchOption(alts[k], q.options); if (m != null) { picked = m; said = alts[k]; } }
      if (picked != null) {
        var prevSel = radioVal(q.id), prevLog = voiceLog[q.id];
        setRadio(q.id, picked); markHeard(q, q.id, said);
        noMatch = 0;
        return schedulePick(q, q.options[picked].v, function () {
          stage.querySelectorAll('input[name="' + q.id + '"]').forEach(function (r) { r.checked = prevSel != null && +r.value === prevSel; });
          if (prevLog) voiceLog[q.id] = prevLog; else delete voiceLog[q.id];
        });
      }
    } else {
      var cur = {};
      q.parts.forEach(function (p) { cur[p.id] = radioVal(q.id + "-" + p.id); });
      var got = {};
      for (var j = 0; j < alts.length; j++) { got = matchGroup(alts[j], q.parts, cur); if (Object.keys(got).length) { said = alts[j]; break; } }
      var ids = Object.keys(got);
      if (ids.length) {
        noMatch = 0;
        var before = {}, beforeLog = JSON.parse(JSON.stringify(voiceLog[q.id] || {}));
        ids.forEach(function (pid) { before[pid] = cur[pid]; setRadio(q.id + "-" + pid, got[pid]); markHeard(q, q.id + "-" + pid, said); cur[pid] = got[pid]; });
        var missing = q.parts.filter(function (p) { return cur[p.id] == null; });
        if (missing.length) { speak(missing[0].label); return; }
        var label = q.parts.map(function (p) { return p.options[cur[p.id]].v; }).join(" · ");
        return schedulePick(q, label, function () {
          ids.forEach(function (pid) { stage.querySelectorAll('input[name="' + q.id + "-" + pid + '"]').forEach(function (r) { r.checked = before[pid] != null && +r.value === before[pid]; }); });
          voiceLog[q.id] = beforeLog;
        });
      }
    }
    noMatch++;
    if (noMatch >= 2) autoHold = true;
    var msg = "No te entendí. Repetí o tocá una opción.";
    $("#m-listen-t").textContent = msg;
    speak(msg);
  }

  // Muestra "Elegiste: X", y avanza solo en 1,5 s salvo que toque "Deshacer".
  function schedulePick(q, label, undo) {
    clearPick();
    var box = $("#m-picked");
    $("#m-picked-t").innerHTML = "Elegiste: <strong>" + esc(label) + "</strong>. Sigo en 1,5 s…";
    box.hidden = false;
    var i = step;
    pendingPick = { undo: undo, timer: setTimeout(function () { var u = pendingPick; pendingPick = null; if (u && step === i) next(q, i); }, 1500) };
  }
  function clearPick() {
    if (pendingPick) { clearTimeout(pendingPick.timer); pendingPick = null; }
    var box = $("#m-picked"); if (box) box.hidden = true;
  }
  function undoPick() {
    var p = pendingPick;
    clearPick();
    if (p && p.undo) p.undo();
    stage.querySelectorAll(".mira-opt.is-voice").forEach(function (l) { l.classList.remove("is-voice"); });
    var h = $("#m-heard"); if (h) h.hidden = true;
    autoHold = false; noMatch = 0;
    speak("Listo, decime de nuevo o tocá una opción.");
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
    var v = $("#m-open").value.trim(), vb = $("#m-voice"), voiced = !!(vb && vb.checked && $("#m-voice-fb") && !$("#m-voice-fb").hidden);
    answers[q.id] = { text: v, voice: voiced };
    if (v.length >= q.minChars || voiced) return true;
    if (v.length >= 3 && voiceLog[q.id] && voiceLog[q.id].text) return true; // dictado corto: cuenta
    return voiceAvail ? "Respondé en voz alta (tocá “Hablar”) o escribí tu respuesta." : "Respondé en voz alta y marcá “Ya respondí en voz alta”, o escribí tu respuesta.";
  }

  function next(q, i) {
    if (step !== i) return;
    stopListen(true); clearPick();
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
    stopListen(true); clearPick();
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
        summary: buildPayload(cand, answers, r, { session: session }),
        transcripts: transcriptsText(answers, voiceLog),
        voice: voiceStatusText()
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
  window.SEVOR_MIRA = { Q: Q, MAX: MAX, PASS_PCT: PASS_PCT, evaluate: evaluate, buildPayload: buildPayload, scoreOpen: scoreOpen,
    matchOption: matchOption, matchGroup: matchGroup, norm: norm, voiceLog: function () { return voiceLog; }, voiceState: function () { return { avail: voiceAvail, why: voiceWhy, listening: !!rec, used: voiceUsed }; }, uploadUrl: function () { return UPLOAD_URL; }, _setUploadUrl: function (u) { UPLOAD_URL = u; } };

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
      muteBtn.addEventListener("click", function () { muted = !muted; lsSet(K_MUTE, muted ? "1" : "0"); syncMute(); if (muted) { stopSpeak(); autoListen(); } else speak(lastSay); });
      replay.addEventListener("click", function () { if (muted) { muted = false; lsSet(K_MUTE, "0"); syncMute(); } speak(lastSay); });
    }
    window.addEventListener("pagehide", function () { stopSpeak(); stopListen(true); });
    var done = null;
    try { done = JSON.parse(lsGet(K_DONE) || "null"); } catch (e) { done = null; }
    if (done && done.ts && Date.now() - done.ts < RETRY_DAYS * DAY && !/[?&]repetir=1/.test(location.search)) return renderLocked(done);
    renderIntro();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
