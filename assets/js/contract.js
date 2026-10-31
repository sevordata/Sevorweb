/* SEVOR Data — contrato de locación de servicios (fuente: sevor-contrato.md).
   El texto se mantiene en español (versión válida). Los datos del PRESTADOR y la
   fecha se completan automáticamente; los del COMITENTE salen de config.js. */
(function () {
  "use strict";
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function f(v, blank) { return '<span class="fill">' + esc(v || blank || "______________") + "</span>"; }

  function todayAR() {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return { d: parseInt(o.day, 10), m: parseInt(o.month, 10), y: parseInt(o.year, 10) };
  }

  /* Firma del COMITENTE (Demian Niyen Velazco): rúbrica "DV" en SVG (solo trazos, sin fuentes). */
  var SIG_DV_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 70" width="180" height="70"><g fill="none" stroke="#1b2a4a" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M30 14c-2 12-5 26-9 40"/><path d="M14 20c22-12 52-8 56 12 3 16-18 26-50 22-6-1-7-5-2-6"/><path d="M62 30c8-4 14-10 18-14 2 12 4 26 8 36 10-14 22-30 36-40 4-3 9-3 7 2"/><path d="M8 60c40-6 96-6 160-14"/></g></svg>';
  var SIG_DV_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SIG_DV_SVG);
  function comitenteOk(C) { return !!(C.COMITENTE_TITULAR && C.COMITENTE_TITULAR.indexOf("_") === -1); }
  /* PNG de la firma del comitente para el PDF (jsPDF no acepta SVG). */
  function comitenteSigPNG() {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = 540, h = 210, c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          res({ dataUrl: c.toDataURL("image/png"), ratio: w / h });
        } catch (e) { rej(e); }
      };
      img.onerror = rej;
      img.src = SIG_DV_URL;
    });
  }

  /* data: {name, dni, cuit, domicilio, email, signatureDataUrl?} */
  function render(data) {
    var C = window.SEVOR_CONFIG || {};
    var t = todayAR();
    var sig = data.signatureDataUrl
      ? '<img src="' + data.signatureDataUrl + '" alt="Firma del prestador">'
      : "____________________";
    var p = [];
    p.push('<h2>CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES</h2>');
    p.push("<p>En la ciudad de Bahía Blanca, Provincia de Buenos Aires, a los " + f(String(t.d)) + " días del mes de " + f(MONTHS[t.m - 1]) + " de " + f(String(t.y)) + ", entre:</p>");
    p.push("<p><strong>SEVOR DATA</strong>, de titularidad de <strong>" + esc(C.COMITENTE_TITULAR || "______________________________") + "</strong>, CUIT N.º " + esc(C.COMITENTE_CUIT || "______________") + ", con domicilio en la ciudad de Bahía Blanca, Provincia de Buenos Aires, correo electrónico " + esc(C.EMAIL || "contacto.sevor@gmail.com") + " (en adelante, <strong>“EL COMITENTE”</strong>); y</p>");
    p.push("<p><strong>" + f(data.name, "______________________________") + "</strong>, DNI N.º " + f(data.dni) + ", CUIT N.º " + f(data.cuit) + ", con domicilio en " + f(data.domicilio, "______________________________") + ", correo electrónico " + f(data.email) + " (en adelante, <strong>“EL PRESTADOR”</strong>);</p>");
    p.push("<p>en conjunto <strong>“LAS PARTES”</strong>, convienen celebrar el presente contrato de locación de servicios, conforme a los artículos 1251 y siguientes del Código Civil y Comercial de la Nación, sujeto a las siguientes cláusulas:</p>");
    var cl = [
      ["PRIMERA — Objeto", "EL PRESTADOR se obliga a prestar, en forma independiente, servicios de grabación de videos en primera persona (POV) de tareas cotidianas, domésticas y/o laborales, utilizando un celular compatible sostenido con una vincha o soporte de cabeza, conforme a las guías y especificaciones que EL COMITENTE comunique para cada proyecto (en adelante, <strong>“los Servicios”</strong>)."],
      ["SEGUNDA — Naturaleza de la relación", "LAS PARTES declaran que el presente es un contrato de naturaleza civil y comercial. EL PRESTADOR actúa como profesional y/o trabajador independiente, con plena autonomía técnica, organizativa y económica, asumiendo los riesgos de su actividad. No existe relación de dependencia laboral, subordinación jurídica ni vínculo regido por la Ley de Contrato de Trabajo N.º 20.744. EL PRESTADOR no integra la organización empresarial de EL COMITENTE."],
      ["TERCERA — Modalidad y flexibilidad", "EL PRESTADOR elige libremente los días, horarios y cantidad de horas que dedica a los Servicios, utilizando sus propios dispositivos, elementos y conexión. No está obligado a aceptar una cantidad mínima de tareas, ni EL COMITENTE garantiza un volumen mínimo de trabajo. EL PRESTADOR puede prestar servicios a terceros, salvo lo dispuesto en la cláusula de confidencialidad."],
      ["CUARTA — Retribución y facturación", "Por los Servicios, EL COMITENTE abonará el importe por hora o por tarea <strong>aceptada</strong> que se informe por escrito para cada proyecto antes de su inicio. Solo se abonará el material que supere el control de calidad. EL PRESTADOR deberá estar inscripto ante ARCA (monotributo u otro régimen) y emitir la factura correspondiente. El pago se realizará dentro de los ____ días hábiles de recibida la factura, por transferencia bancaria o billetera virtual a nombre de EL PRESTADOR. Cada parte es responsable de sus propias obligaciones impositivas y previsionales."],
      ["QUINTA — Gratuidad de ingreso", "EL PRESTADOR no abona suma alguna para incorporarse ni para acceder a proyectos."],
      ["SEXTA — Calidad y entrega", "EL PRESTADOR se compromete a cumplir las guías técnicas de cada proyecto. EL COMITENTE podrá rechazar, con indicación de motivo, el material que no cumpla las especificaciones."],
      ["SÉPTIMA — Cesión de derechos sobre el material", "EL PRESTADOR cede a EL COMITENTE, en forma exclusiva, total, por todo el plazo de protección legal y para todo el mundo, los derechos patrimoniales de autor, imagen y voz sobre el material producido en el marco de los Servicios (Ley N.º 11.723 y art. 53 del Código Civil y Comercial), incluyendo el derecho de editarlo, licenciarlo y cederlo a terceros para fines de entrenamiento, evaluación e investigación de sistemas de inteligencia artificial. La retribución pactada en la cláusula Cuarta comprende esta cesión."],
      ["OCTAVA — Terceros, menores y lugares", "EL PRESTADOR solo grabará en lugares en los que tenga autorización. No grabará a terceros sin su consentimiento firmado, ni a menores de edad, ni documentos, pantallas o datos personales de terceros. Será responsable frente a EL COMITENTE por cualquier reclamo derivado del incumplimiento de esta cláusula."],
      ["NOVENA — Exclusividad del material", "EL PRESTADOR declara que el material entregado es original, producido exclusivamente para EL COMITENTE, y que no fue ni será entregado a otras plataformas o empresas."],
      ["DÉCIMA — Confidencialidad", "EL PRESTADOR mantendrá en reserva las guías, proyectos, clientes, tarifas e información de EL COMITENTE, durante la vigencia del contrato y por dos (2) años posteriores a su finalización."],
      ["DÉCIMA PRIMERA — Datos personales", "Los datos personales de EL PRESTADOR (incluyendo copia de su DNI y CUIT) serán tratados por EL COMITENTE solo para la gestión de este contrato, la verificación de identidad y la facturación, conforme a la Ley N.º 25.326. EL PRESTADOR podrá ejercer sus derechos de acceso, rectificación y supresión escribiendo a " + esc(C.EMAIL || "contacto.sevor@gmail.com") + ". La Agencia de Acceso a la Información Pública es el órgano de control de dicha ley."],
      ["DÉCIMA SEGUNDA — Plazo y rescisión", "El contrato rige desde su firma y por tiempo indeterminado. Cualquiera de LAS PARTES podrá rescindirlo sin expresión de causa, notificando a la otra por correo electrónico con una antelación mínima de <strong>cinco (5) días corridos</strong>. La rescisión no genera derecho a indemnización alguna, sin perjuicio del pago de los Servicios aceptados hasta la fecha. EL COMITENTE podrá rescindir sin preaviso ante incumplimiento grave de las cláusulas Octava, Novena o Décima."],
      ["DÉCIMA TERCERA — Firma electrónica y notificaciones", "LAS PARTES aceptan la celebración de este contrato por medios electrónicos y reconocen la validez de la aceptación y firma electrónica conforme a la Ley N.º 25.506 y arts. 286 a 288 del Código Civil y Comercial. Las notificaciones se cursarán a los correos electrónicos indicados en el encabezado."],
      ["DÉCIMA CUARTA — Jurisdicción", "Para cualquier controversia, LAS PARTES se someten a los tribunales ordinarios del Departamento Judicial de Bahía Blanca, Provincia de Buenos Aires."]
    ];
    cl.forEach(function (c) { p.push("<h3>" + c[0] + "</h3><p>" + c[1] + "</p>"); });
    p.push("<p>&nbsp;</p><p>En prueba de conformidad, se firma en forma electrónica.</p><p>&nbsp;</p>");
    p.push('<p class="sigline"><strong>EL PRESTADOR</strong> — Firma: <span data-sig>' + sig + "</span>  Aclaración: " + f(data.name) + "  DNI: " + f(data.dni) + "</p>");
    var csig = comitenteOk(C) ? '<img class="sig-comitente" src="' + SIG_DV_URL + '" alt="Firma de ' + esc(C.COMITENTE_TITULAR) + ' (DV)">' : "____________________";
    p.push('<p class="sigline"><strong>EL COMITENTE</strong> — Firma: <span data-sig-comitente>' + csig + "</span>  Aclaración: " + esc(comitenteOk(C) ? C.COMITENTE_TITULAR : "____________________") + ", por SEVOR Data</p>");
    return p.join("\n");
  }

  /* Plain-text blocks for the PDF, taken from the rendered DOM. */
  function blocks(container) {
    var out = [];
    container.querySelectorAll("h2, h3, p").forEach(function (el) {
      var clone = el.cloneNode(true);
      clone.querySelectorAll("img").forEach(function (img) { img.replaceWith(img.classList.contains("sig-comitente") ? "[firma DV del comitente — ver al pie]" : "[firma electrónica — ver al pie]"); });
      var txt = clone.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      out.push({ type: el.tagName.toLowerCase(), text: txt });
    });
    return out;
  }

  window.SEVOR_CONTRACT = { render: render, blocks: blocks, todayAR: todayAR, comitenteSigPNG: comitenteSigPNG, comitenteSigUrl: SIG_DV_URL, comitenteOk: function () { return comitenteOk(window.SEVOR_CONFIG || {}); } };
})();
