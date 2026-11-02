/* SEVOR Data — site configuration (single place to edit).
   If you change BASE_URL (no trailing slash), also run ./set-base-url.sh to update sitemap.xml,
   robots.txt and the <head> meta tags (they are static HTML for SEO). */
window.SEVOR_CONFIG = {
  BASE_URL: "https://sevordata.dev.ar",
  EMAIL: "contacto.sevor@gmail.com",
  // FormSubmit endpoint. After the one-time activation you may replace the
  // email with the random alias FormSubmit gives you, to hide the address.
  FORM_ENDPOINT: "https://formsubmit.co/contacto.sevor@gmail.com",
  // Comitente data shown in the contract (EL COMITENTE). Its "DV" signature is drawn by contract.js.
  COMITENTE_TITULAR: "Demian Niyen Velazco",
  COMITENTE_CUIT: "20-38952931-2",
  DEFAULT_LANG: "es",
  LANGS: ["es", "en", "pt", "it", "fr", "de"]
};
