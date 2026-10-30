/* SEVOR Data — site configuration (single place to edit).
   If you change BASE_URL, also run ./set-base-url.sh to update sitemap.xml,
   robots.txt and the <head> meta tags (they are static HTML for SEO). */
window.SEVOR_CONFIG = {
  BASE_URL: "https://sevordata.dev.ar",
  EMAIL: "contacto.sevor@gmail.com",
  // FormSubmit endpoint. After the one-time activation you may replace the
  // email with the random alias FormSubmit gives you, to hide the address.
  FORM_ENDPOINT: "https://formsubmit.co/contacto.sevor@gmail.com",
  // Comitente data shown in the contract. Fill before going live
  // (left blank on purpose: no personal data in public files).
  COMITENTE_TITULAR: "______________________________",
  COMITENTE_CUIT: "______________",
  DEFAULT_LANG: "es",
  LANGS: ["es", "en", "pt", "it", "fr", "de"]
};
