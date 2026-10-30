/* SEVOR Data — shared UI: i18n, language switcher, nav, reveal-on-scroll. */
(function () {
  "use strict";
  var CFG = window.SEVOR_CONFIG || {};
  var I18N = window.SEVOR_I18N || {};
  var FLAGS = { es: "🇦🇷", en: "🇺🇸", pt: "🇧🇷", it: "🇮🇹", fr: "🇫🇷", de: "🇩🇪" };
  var LANGS = CFG.LANGS || Object.keys(FLAGS);
  var STORE_KEY = "sevor_lang";

  function storedLang() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function pickLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && I18N[q]) return q;
    var s = storedLang();
    if (s && I18N[s]) return s;
    return CFG.DEFAULT_LANG || "es";
  }

  var current = pickLang();

  function t(key, lang) {
    var d = I18N[lang || current] || {};
    if (d[key] != null) return d[key];
    var es = I18N.es || {};
    return es[key] != null ? es[key] : key;
  }

  function apply(lang) {
    if (!I18N[lang]) lang = "es";
    current = lang;
    document.documentElement.lang = lang === "es" ? "es-AR" : lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      // format: "placeholder:key;aria-label:key"
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    var page = document.body.getAttribute("data-page");
    var titleKey = { index: "meta.index.title", registro: "meta.reg.title", gracias: "meta.thanks.title" }[page];
    if (titleKey) document.title = t(titleKey);
    if (page === "index") {
      var md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute("content", t("meta.index.desc"));
    }
    var btn = document.querySelector(".lang-btn");
    if (btn) {
      btn.querySelector(".lang-flag").textContent = FLAGS[lang];
      btn.querySelector(".lang-code").textContent = lang.toUpperCase();
    }
    document.querySelectorAll(".lang-menu [data-lang]").forEach(function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-lang") === lang ? "true" : "false");
    });
    document.dispatchEvent(new CustomEvent("sevor:lang", { detail: { lang: lang } }));
  }

  function setLang(lang) {
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* private mode */ }
    apply(lang);
  }

  function buildSwitcher() {
    var wrap = document.querySelector(".lang");
    if (!wrap) return;
    var btn = wrap.querySelector(".lang-btn");
    var menu = wrap.querySelector(".lang-menu");
    menu.innerHTML = "";
    LANGS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("data-lang", l);
      b.innerHTML = '<span aria-hidden="true">' + FLAGS[l] + "</span> <span>" + l.toUpperCase() +
        '</span> <span class="lang-name">' + ((I18N[l] || {})["lang.name"] || l) + "</span>";
      b.addEventListener("click", function () { setLang(l); close(); btn.focus(); });
      menu.appendChild(b);
    });
    function open() { wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    function close() { wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.contains("open") ? close() : open();
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function reveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  function header() {
    var h = document.querySelector(".site-header");
    if (!h) return;
    var onScroll = function () { h.classList.toggle("scrolled", window.scrollY > 24); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Subtle pointer-driven tilt on glass cards (desktop, motion allowed only).
  function tilt() {
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(900px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 6).toFixed(2) + "deg) translateY(-2px)";
        card.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });
  }

  function mailLinks() {
    var email = CFG.EMAIL || "contacto.sevor@gmail.com";
    document.querySelectorAll("[data-email-text]").forEach(function (el) { el.textContent = email; });
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  window.SEVOR = { t: t, setLang: setLang, lang: function () { return current; } };

  document.addEventListener("DOMContentLoaded", function () {
    buildSwitcher();
    apply(current);
    reveal();
    header();
    tilt();
    mailLinks();
  });
})();
