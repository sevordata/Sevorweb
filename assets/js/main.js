/* SEVOR Data — shared UI: i18n, language selector, header, mobile menu, reveal-on-scroll. */
(function () {
  "use strict";
  var CFG = window.SEVOR_CONFIG || {};
  var I18N = window.SEVOR_I18N || {};
  var LANGS = CFG.LANGS || ["es", "en", "pt", "it", "fr", "de"];
  var STORE_KEY = "sevor_lang";

  /* Small inline SVG flags (20×14). Emoji flags render inconsistently across OSes. */
  var FLAGS = {
    es: '<rect width="20" height="14" fill="#74acdf"/><rect y="4.67" width="20" height="4.66" fill="#fff"/><circle cx="10" cy="7" r="1.5" fill="#f6b40e"/>',
    en: '<rect width="20" height="14" fill="#fff"/><g fill="#b22234"><rect width="20" height="1.08"/><rect y="2.15" width="20" height="1.08"/><rect y="4.31" width="20" height="1.08"/><rect y="6.46" width="20" height="1.08"/><rect y="8.62" width="20" height="1.08"/><rect y="10.77" width="20" height="1.08"/><rect y="12.92" width="20" height="1.08"/></g><rect width="8.4" height="7.54" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.6" cy="1.5" r=".42"/><circle cx="3.6" cy="1.5" r=".42"/><circle cx="5.6" cy="1.5" r=".42"/><circle cx="7.4" cy="1.5" r=".42"/><circle cx="2.6" cy="3.0" r=".42"/><circle cx="4.6" cy="3.0" r=".42"/><circle cx="6.6" cy="3.0" r=".42"/><circle cx="1.6" cy="4.5" r=".42"/><circle cx="3.6" cy="4.5" r=".42"/><circle cx="5.6" cy="4.5" r=".42"/><circle cx="7.4" cy="4.5" r=".42"/><circle cx="2.6" cy="6.0" r=".42"/><circle cx="4.6" cy="6.0" r=".42"/><circle cx="6.6" cy="6.0" r=".42"/></g>',
    pt: '<rect width="20" height="14" fill="#009b3a"/><path d="M10 1.6 18 7l-8 5.4L2 7z" fill="#fedf00"/><circle cx="10" cy="7" r="3" fill="#002776"/><path d="M7.1 6.4c2-.5 4-.3 5.8.6" stroke="#fff" stroke-width=".55" fill="none"/>',
    it: '<rect width="6.67" height="14" fill="#009246"/><rect x="6.67" width="6.66" height="14" fill="#fff"/><rect x="13.33" width="6.67" height="14" fill="#ce2b37"/>',
    fr: '<rect width="6.67" height="14" fill="#002654"/><rect x="6.67" width="6.66" height="14" fill="#fff"/><rect x="13.33" width="6.67" height="14" fill="#ce1126"/>',
    de: '<rect width="20" height="4.67" fill="#000"/><rect y="4.67" width="20" height="4.66" fill="#dd0000"/><rect y="9.33" width="20" height="4.67" fill="#ffce00"/>'
  };
  function flag(l) { return '<svg viewBox="0 0 20 14" aria-hidden="true" focusable="false">' + (FLAGS[l] || "") + "</svg>"; }
  var CHECK = '<svg class="check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.4 2.9 2.9 6-6.3"/></svg>';

  function storedLang() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
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
  /* Plain text without the [[accent]] markers. */
  function tp(key, lang) { return String(t(key, lang)).replace(/\[\[|\]\]/g, ""); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  /* Escaped HTML where [[words]] become <em> (serif accent). */
  function rich(key) { return esc(t(key)).replace(/\[\[(.+?)\]\]/g, "<em>$1</em>"); }

  function apply(lang) {
    if (!I18N[lang]) lang = "es";
    current = lang;
    document.documentElement.lang = lang === "es" ? "es-AR" : lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = tp(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-em]").forEach(function (el) { el.innerHTML = rich(el.getAttribute("data-i18n-em")); });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      // format: "placeholder:key;aria-label:key"
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) el.setAttribute(p[0].trim(), tp(p[1].trim()));
      });
    });
    var page = document.body.getAttribute("data-page");
    var titleKey = { index: "meta.index.title", registro: "meta.reg.title", gracias: "meta.thanks.title" }[page];
    if (titleKey) document.title = tp(titleKey);
    var descKey = { index: "meta.index.desc", registro: "meta.reg.desc" }[page];
    if (descKey) {
      var md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute("content", tp(descKey));
    }
    var btn = document.querySelector(".lang-btn");
    if (btn) {
      btn.querySelector(".flag").innerHTML = flag(lang);
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
      b.setAttribute("lang", l);
      b.tabIndex = -1;
      b.innerHTML = '<span class="flag">' + flag(l) + '</span><span class="lang-name">' +
        esc((I18N[l] || {})["lang.name"] || l) + '</span><span class="lang-code">' + l.toUpperCase() + "</span>" + CHECK;
      b.addEventListener("click", function () { setLang(l); close(true); });
      menu.appendChild(b);
    });
    var items = function () { return Array.prototype.slice.call(menu.querySelectorAll("button")); };
    function open(focusFirst) {
      wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true");
      var list = items(), sel = menu.querySelector('[aria-checked="true"]') || list[0];
      if (focusFirst !== false) setTimeout(function () { sel.focus(); }, 20);
    }
    function close(refocus) {
      if (!wrap.classList.contains("open")) return;
      wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus();
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.contains("open") ? close(false) : open(e.detail === 0);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(true); }
    });
    menu.addEventListener("keydown", function (e) {
      var list = items(), i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === "Tab") { close(false); }
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(true); });
  }

  function mobileMenu() {
    var toggle = document.querySelector(".menu-toggle");
    var panel = document.getElementById("mobile-menu");
    if (!toggle || !panel) return;
    function set(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
      document.documentElement.style.overflow = open ? "hidden" : "";
    }
    toggle.addEventListener("click", function () { set(toggle.getAttribute("aria-expanded") !== "true"); });
    panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { set(false); toggle.focus(); }
    });
    window.matchMedia("(min-width: 1024px)").addEventListener("change", function (m) { if (m.matches) set(false); });
  }

  function reveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
  }

  function header() {
    var h = document.querySelector("[data-header]");
    if (!h) return;
    var ticking = false;
    var update = function () { h.classList.toggle("is-condensed", window.scrollY > 16); ticking = false; };
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function mailLinks() {
    var email = CFG.EMAIL || "contacto.sevor@gmail.com";
    document.querySelectorAll("[data-email-text]").forEach(function (el) { el.textContent = email; });
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  window.SEVOR = { t: tp, rich: rich, setLang: setLang, lang: function () { return current; } };

  document.addEventListener("DOMContentLoaded", function () {
    buildSwitcher();
    apply(current);
    reveal();
    header();
    mobileMenu();
    mailLinks();
  });
})();
