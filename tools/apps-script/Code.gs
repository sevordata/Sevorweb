/**
 * SEVOR Data — receptor de entrevistas "Mirá" (Google Apps Script, gratis).
 *
 * Recibe el video de la entrevista en partes desde https://sevordata.dev.ar/entrevista.html,
 * lo guarda en la carpeta PRIVADA de Google Drive "SEVOR Data - Entrevistas Mirá" (una subida
 * reanudable de Drive: no hace falta unir partes), guarda las respuestas en JSON y envía un email
 * a contacto.sevor@gmail.com con el resumen, el link al video y el link de aprobación.
 *
 * Implementar como: Web App · Ejecutar como: Yo · Quién tiene acceso: Cualquier persona.
 * No contiene claves: corre con la cuenta de Google de quien la implementa.
 */

var FOLDER_NAME = 'SEVOR Data - Entrevistas Mirá';
var NOTIFY_TO = 'contacto.sevor@gmail.com';
var MAX_CHUNKS = 20;                 // 20 × 5 MB = 100 MB máx.
var MAX_BYTES = 100 * 1024 * 1024;
var MAX_B64_CHARS = 7400000;         // ~5,5 MB por parte
var SESSION_RE = /^mira-[a-z0-9]{4,16}-[a-z0-9]{2,12}$/;

function doGet() {
  return json_({ ok: true, service: 'SEVOR Mirá', time: new Date().toISOString() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SESSION_RE.test(String(body.session || ''))) return json_({ ok: false, error: 'session' });
    if (body.action === 'chunk') return json_(chunk_(body));
    if (body.action === 'finish') return json_(finish_(body));
    if (body.action === 'ping') return json_({ ok: true });
    return json_({ ok: false, error: 'action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Partes del video (subida reanudable de Drive) ---------- */
function chunk_(b) {
  var props = PropertiesService.getScriptProperties();
  var key = 'S_' + b.session;
  var st = JSON.parse(props.getProperty(key) || 'null');
  var index = Number(b.index), total = Number(b.total), size = Number(b.size);
  if (!(index >= 0 && index < total && total <= MAX_CHUNKS)) return { ok: false, error: 'index' };
  if (!(size > 0 && size <= MAX_BYTES)) return { ok: false, error: 'size' };
  if (typeof b.data !== 'string' || b.data.length > MAX_B64_CHARS) return { ok: false, error: 'data' };

  if (!st) {
    if (index !== 0) return { ok: false, error: 'order' };
    var mime = /^video\/(webm|mp4)$/.test(String(b.mime)) ? String(b.mime) : 'video/webm';
    var ext = mime === 'video/mp4' ? 'mp4' : 'webm';
    var name = stamp_() + ' - ' + clean_(b.name || 'candidato') + ' - ' + b.session + '.' + ext;
    st = { url: startResumable_(name, mime, size), done: -1, size: size, total: total, mime: mime, name: name, fileId: '' };
  }
  if (index <= st.done) return { ok: true, dup: true };       // reintento de una parte ya recibida
  if (index !== st.done + 1) return { ok: false, error: 'order', expected: st.done + 1 };

  var bytes = Utilities.base64Decode(b.data);
  var start = index * Number(b.chunkBytes || 5242880);
  var end = start + bytes.length - 1;
  var res = UrlFetchApp.fetch(st.url, {
    method: 'put',
    contentType: st.mime,
    payload: bytes,
    headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 308) {
    st.done = index;
  } else if (code === 200 || code === 201) {
    st.done = index;
    st.fileId = JSON.parse(res.getContentText()).id;
  } else {
    return { ok: false, error: 'drive ' + code };
  }
  props.setProperty(key, JSON.stringify(st));
  return { ok: true, index: index };
}

function startResumable_(name, mime, size) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ name: name, mimeType: mime, parents: [folder_().getId()] }),
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size)
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('drive start ' + res.getResponseCode());
  var h = res.getAllHeaders();
  return h.Location || h.location;
}

/* ---------- Cierre: JSON + email ---------- */
function finish_(b) {
  var props = PropertiesService.getScriptProperties();
  var key = 'S_' + b.session;
  var st = JSON.parse(props.getProperty(key) || 'null');
  var meta = b.meta || {};
  var folder = folder_();
  var videoUrl = '', videoName = '';
  if (st && st.fileId) {
    var f = DriveApp.getFileById(st.fileId);
    videoUrl = f.getUrl(); videoName = f.getName();
  } else if (Number(b.size) > 0) {
    return { ok: false, error: 'incomplete' };
  }
  var base = stamp_() + ' - ' + clean_(meta.name || 'candidato') + ' - ' + b.session;
  var data = { session: b.session, receivedAt: new Date().toISOString(), video: { name: videoName, url: videoUrl, bytes: Number(b.size) || 0, mime: b.mime || '' }, meta: meta };
  var jf = folder.createFile(base + ' - respuestas.json', JSON.stringify(data, null, 2), 'application/json');

  var s = meta.summary || {};
  var estado = meta.ko ? 'DESCARTE AUTOMÁTICO' : (meta.passed ? 'APROBADO (preliminar)' : 'NO APROBADO (preliminar)');
  var rows = Object.keys(s).filter(function (k) { return k.charAt(0) !== '_'; }).map(function (k) {
    var v = String(s[k] == null ? '' : s[k]);
    var cell = /^mailto:/.test(v) ? '<a href="' + esc_(v) + '">Rechazar: abrir email ya escrito</a>' : /^https:\/\//.test(v) ? '<a href="' + esc_(v) + '">' + esc_(v) + '</a>' : esc_(v);
    return '<tr><th align="left" style="padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top">' + esc_(k) + '</th><td style="padding:6px 10px;border-bottom:1px solid #eee">' + cell + '</td></tr>';
  }).join('');
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">' +
    '<h2 style="margin:0 0 8px">Entrevista Mirá: ' + esc_(meta.name || '') + '</h2>' +
    '<p><b>Filtro automático:</b> ' + esc_(estado) + ' · ' + esc_(meta.pct) + '% · duración ' + esc_(meta.durationSec) + ' s' + (meta.capped ? ' (cortada a los 12 min)' : '') + '</p>' +
    (videoUrl ? '<p><b>Video (Drive privado):</b> <a href="' + videoUrl + '">' + esc_(videoName) + '</a></p>' : '<p><b>Video:</b> no recibido</p>') +
    '<p><b>Respuestas (JSON):</b> <a href="' + jf.getUrl() + '">' + esc_(jf.getName()) + '</a></p>' +
    (meta.approvalLink ? '<p style="padding:10px;background:#e6f0fa;border-radius:8px"><b>Si lo aprobás, reenviale este link para el registro y el contrato:</b><br><a href="' + meta.approvalLink + '">' + esc_(meta.approvalLink) + '</a><br>Código: <b>' + esc_(meta.approvalCode) + '</b>' +
      (meta.rejectLink ? '<br><br><b>Si no lo aprobás:</b> <a href="' + esc_(meta.rejectLink) + '" style="display:inline-block;padding:8px 14px;background:#b42318;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Rechazar</a> <span style="color:#555">(abre un email cordial ya escrito para el candidato)</span>' : '<br><br><span style="color:#555">Ya recibió por email el rechazo automático.</span>') +
      '</p>' : '') +
    '<table style="border-collapse:collapse;font-size:13px">' + rows + '</table></div>';
  MailApp.sendEmail({
    to: NOTIFY_TO,
    replyTo: meta.email || NOTIFY_TO,
    subject: 'Entrevista Mirá (video) - ' + (meta.name || '') + ' - ' + estado,
    htmlBody: html,
    name: 'Mirá · SEVOR Data'
  });
  props.deleteProperty(key);
  return { ok: true, video: videoUrl, json: jf.getUrl() };
}

/* ---------- Utilidades ---------- */
function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function stamp_() { return Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH.mm'); }
function clean_(s) { return String(s).replace(/[\\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || 'candidato'; }
function esc_(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Ejecutalo una vez desde el editor (▶ Ejecutar) para dar permisos y crear la carpeta. */
function setup() {
  var f = folder_();
  DriveApp.getRootFolder(); UrlFetchApp.getRequest('https://www.googleapis.com/');
  MailApp.getRemainingDailyQuota();
  Logger.log('Carpeta lista: ' + f.getUrl());
}
