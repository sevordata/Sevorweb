# SEVOR Data: static website

A static site for SEVOR Data (Bahía Blanca, Argentina): POV/egocentric video capture and Spanish-language AI content evaluation, plus contractor registration.
It is plain HTML, CSS and JS. There is no build step and no backend. Three.js, jsPDF and Google Fonts load from CDNs.

## Structure

```
index.html            Landing page: hero (3D globe), services, process, quality, why Argentina, work with us, contact
registro.html         3-step contractor registration (data → contract + signature → PDF + submit)
gracias.html          Thank-you page (FormSubmit redirects here)
404.html              GitHub Pages "not found" page
favicon.svg           "S" logo
CNAME                 Custom domain for GitHub Pages (sevordata.dev.ar)
.nojekyll             Tells GitHub Pages to serve the files as they are
robots.txt, sitemap.xml
set-base-url.sh       Changes the domain everywhere in one command
assets/css/style.css
assets/js/config.js   ← ONE place for BASE_URL, email, FormSubmit endpoint, comitente data
assets/js/i18n.js     All translations (es default, en, pt, it, fr, de)
assets/js/main.js     Language switcher (saved in localStorage, sets <html lang>), reveal-on-scroll, tilt
assets/js/hero3d.js   Three.js hero (ES module). Uses fewer particles on mobile, respects reduced motion, falls back without WebGL
assets/js/contract.js Contract text (from sevor-contrato.md). Fills in the prestador's data and today's date
assets/js/registro.js Form logic: validation (incl. CUIT check digit), image compression <1 MB, signature pad, jsPDF, FormSubmit
assets/img/           og-image.png (1200×630), logo-512.png, apple-touch-icon.png
```

## Before going live

1. **Comitente data in the contract.** Open `assets/js/config.js` and fill in `COMITENTE_TITULAR` and `COMITENTE_CUIT`. They are blank on purpose, so that no personal data sits in the public repo. Until you fill them, the contract shows blank lines.
2. **Legal review.** The contract text is the draft from `sevor-contrato.md`. Have a lawyer review it, and fill in the payment term ("dentro de los ____ días hábiles") in `assets/js/contract.js`.
3. **Domain.** If you use a domain other than `https://sevordata.dev.ar`, run:
   ```sh
   ./set-base-url.sh https://your-domain.com
   ```
   This updates the meta tags, JSON-LD, sitemap.xml, robots.txt, config.js and CNAME.

## Deploy on GitHub Pages

1. Create a repository, for example `sevor-data-web`, and upload **the contents** of this folder to the root of the `main` branch. Include `CNAME` and `.nojekyll`.
2. In the repo, go to **Settings → Pages → Build and deployment**. Set Source to "Deploy from a branch", Branch to `main`, and the folder to `/ (root)`.
3. **Custom domain.** The `CNAME` file already contains `sevordata.dev.ar`. At your DNS provider (NIC.ar delegates to your DNS host), create:
   - For the apex `sevordata.dev.ar`: `A` records pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. You can also add `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
   - Optional `www`: a `CNAME` record pointing to `<your-github-user>.github.io`.
4. Once DNS has propagated, tick **Enforce HTTPS** in Settings → Pages.
5. Optional: submit `https://sevordata.dev.ar/sitemap.xml` in Google Search Console.

To test locally, run `python3 -m http.server 8080` in this folder and open http://localhost:8080. Opening the files directly with `file://` breaks the ES module and FormSubmit.

## FormSubmit: one-time activation (required)

The registration form posts to `https://formsubmit.co/contacto.sevor@gmail.com`. You don't need an account.

1. After deploying, send **one test registration** from the live site.
2. FormSubmit emails **contacto.sevor@gmail.com** an "Activate Form" message. Click the link. This is needed only once per email address. Until you activate, no submission is delivered.
3. Optional: the activation email gives you a random alias such as `https://formsubmit.co/abc123...`. Put it in `FORM_ENDPOINT` in `assets/js/config.js` so the address doesn't appear in the page code.
4. Each submission arrives as a table email with these attachments:
   - `contrato-sevor-<nombre>.pdf`: all data, the filled contract, the signature image, the timestamp and a SHA-256 hash of the contract text.
   - `dni-frente.jpg` and `dni-dorso.jpg`: compressed in the browser to under 1 MB each.
5. Settings used: `_template=table`, `_captcha=false` with a `_honey` honeypot, `_next` pointing to `gracias.html` (built from the current URL), and `_autoresponse` (a short confirmation emailed to the registrant). To turn on FormSubmit's captcha, set `_captcha` to `"true"` in `assets/js/registro.js`.

## Notes and limitations

- **Contract language.** The contract is always shown in Spanish, as the binding version under Argentine law. All interface text around it is translated into all six languages, and a note explains this. The PDF is also in Spanish.
- **Privacy.** DNI photos and data go straight from the browser to FormSubmit, a third-party processor, and then to the Gmail inbox. Nothing is stored in localStorage except the language choice. Consider moving to your own backend or a paid form service as volume grows.
- **Browser support.** Attaching files to a native form relies on `DataTransfer`, which works in Chrome, Edge, Firefox and Safari 14.1+. Older browsers fall back to a `fetch` (no-cors) POST and then go to the thank-you page without confirmation.
- **The 3D globe** uses stylised continent outlines. It is decorative, not cartographic.
- **Copy.** It describes an early-stage, pilot-capacity provider with no clients, statistics or testimonials claimed. Keep it that way until you have real ones.
