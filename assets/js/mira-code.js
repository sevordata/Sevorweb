/* SEVOR Data — código de aprobación de la entrevista "Mirá".
   MIRA-XXXXXX: 4 caracteres derivados del email (hash + sal) + 2 de control.
   Se valida en el navegador (registro.html). Es una barrera liviana, no seguridad fuerte. */
(function () {
  "use strict";
  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos, sin 0/O/1/I
  var SALT = "sevor-mira-2026";
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function enc(n, len) { var s = ""; for (var i = 0; i < len; i++) { s += ALPHA[n % 32]; n = Math.floor(n / 32); } return s; }
  function body(email) { return enc(fnv(SALT + "|" + String(email || "").trim().toLowerCase()), 4); }
  function check(b) { return enc(fnv(b + "|" + SALT + "|ok"), 2); }
  function fromEmail(email) { var b = body(email); return "MIRA-" + b + check(b); }
  function normalize(code) { return String(code || "").trim().toUpperCase().replace(/\s+/g, ""); }
  function isValid(code) {
    var m = /^MIRA-([A-HJ-NP-Z2-9]{4})([A-HJ-NP-Z2-9]{2})$/.exec(normalize(code));
    return !!m && check(m[1]) === m[2];
  }
  window.SEVOR_MIRA_CODE = { fromEmail: fromEmail, isValid: isValid, normalize: normalize };
})();
