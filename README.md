# SEVOR Data: static website

A static site for SEVOR Data (Argentina): POV/egocentric video of everyday and work tasks, recorded with a phone on a head mount, plus contractor registration. Live at https://sevordata.dev.ar (custom domain via `CNAME`).
It is plain HTML, CSS and JS. There is no build step and no backend. Three.js, jsPDF and Google Fonts load from CDNs.

## Structure

```
index.html            Landing: hero (3D point-cloud globe, Argentina highlighted), capabilities index,
                      services (household POV, work-task POV, metadata sample), process timeline,
                      quality & consent spec sheet, why Argentina, recruit, recording requirements
                      (supported phones, head mount, clip rules), final CTA, footer
registro.html         3-step contractor registration (data + supported phone + DNI → contract + signature → review + PDF + submit)
gracias.html          Thank-you page (FormSubmit redirects here)
404.html              Self-contained "not found" page (no relative assets, works at any depth)
favicon.svg           Brand mark (lens)
.nojekyll             Tells GitHub Pages to serve the files as they are
robots.txt, sitemap.xml
set-base-url.sh       Changes the base URL everywhere in one command (does not create a CNAME)
assets/css/style.css  Design system (tokens: type scale, 8px spacing, 12-col grid, colour, radii, motion) + all styles
assets/js/config.js   ← ONE place for BASE_URL, email, FormSubmit endpoint, comitente data
assets/js/i18n.js     All translations (es default, en, pt, it, fr, de). [[words]] = serif accent (data-i18n-em)
assets/js/main.js     i18n apply, language dropdown (SVG flags, keyboard), condensing header, mobile menu, reveal-on-scroll
assets/js/hero3d.js   Three.js hero (ES module, lazy-init after load/idle, reduced-motion = one static frame,
                      fewer points on small screens, inline SVG map stays as fallback without WebGL)
assets/js/contract.js Contract text (from sevor-contrato.md). Fills in the prestador's data and today's date
assets/js/registro.js Form logic: validation (incl. CUIT check digit and supported-phone rules), image compression <1 MB, signature pad (undo/clear),
                      jsPDF (loaded only on this page), FormSubmit
assets/img/photos/    Responsive WebP + JPEG (640/960/1400 px) of the three photos (pov-kitchen, pov-laundry, head-mount)
assets/img/           og-image.png (1200×630), logo-512.png, apple-touch-icon.png
```

No build step is needed to deploy: every file above is plain static HTML/CSS/JS with relative paths.

## Before going live

1. **Comitente data in the contract.** Open `assets/js/config.js` and fill in `COMITENTE_TITULAR` and `COMITENTE_CUIT`. They are blank on purpose, so that no personal data sits in the public repo. Until you fill them, the contract shows blank lines.
2. **Legal review.** The contract text is the draft from `sevor-contrato.md`. Have a lawyer review it, and fill in the payment term ("dentro de los ____ días hábiles") in `assets/js/contract.js`. The contract still names Bahía Blanca as the place of signature, the comitente's domicile and the jurisdiction; change those clauses only with legal advice.
3. **Base URL.** The site is set up for `https://sevordata.dev.ar` (the `CNAME` file holds the domain). To move it, run:
   ```sh
   ./set-base-url.sh https://your-new-base-url
   ```
   This updates the meta tags, JSON-LD, sitemap.xml, robots.txt, 404.html and config.js.

## Deploy on GitHub Pages

1. Upload **the contents** of this folder to the root of the `main` branch of the `Sevorweb` repository (account `sevordata`). Include `.nojekyll` and `CNAME` (`sevordata.dev.ar`).
2. In the repo, go to **Settings → Pages → Build and deployment**. Set Source to "Deploy from a branch", Branch to `main`, folder `/ (root)`.
3. The site is live at `https://sevordata.dev.ar/`.
4. Optional: submit `https://sevordata.dev.ar/sitemap.xml` in Google Search Console.

To test locally, run `python3 -m http.server 8080` in this folder and open http://localhost:8080. Opening the files directly with `file://` breaks the ES module and FormSubmit.

## FormSubmit: one-time activation (required)

The registration form posts to `https://formsubmit.co/contacto.sevor@gmail.com`. You don't need an account.

1. After deploying, send **one test registration** from the live site.
2. FormSubmit emails **contacto.sevor@gmail.com** an "Activate Form" message. Click the link. This is needed only once per email address. Until you activate, no submission is delivered.
3. Optional: the activation email gives you a random alias such as `https://formsubmit.co/abc123...`. Put it in `FORM_ENDPOINT` in `assets/js/config.js` so the address doesn't appear in the page code.
4. Each submission arrives as a table email with these attachments:
   - `contrato-sevor-<nombre>.pdf`: all data, the filled contract, the signature image, the timestamp and a SHA-256 hash of the contract text.
   - `dni-frente.jpg` (field `dni_frente`) and `dni-dorso.jpg` (field `dni_dorso`): compressed in the browser to under 1 MB each.
5. Settings used: `_template=table`, `_captcha=false` with a `_honey` honeypot, `_next` pointing to `gracias.html` (built from the current URL), and `_autoresponse` (a short confirmation emailed to the registrant). To turn on FormSubmit's captcha, set `_captcha` to `"true"` in `assets/js/registro.js`.

## Supported phones (recording app rules)

Registration only accepts phones that run our recording app (the partner app is not named on the public site):

- iPhone 12 to iPhone 18, including mini, Plus, Pro and Pro Max. Not 16e, 17e or 18e. iOS 17.4 or later (the form asks the applicant to confirm it).
- Google Pixel 6 to Pixel 10, including Pro (the form rejects "a" models and Fold).
- Samsung Galaxy S21 to S26, including Plus and Ultra (the form rejects FE and Edge).

A head mount (vincha) that holds the phone at forehead level, angled down toward the hands, is required and is the contractor's cost. Clips are 1 to 30 minutes, landscape, hands visible, good light.
The rules live in `PHONES` / `supportedModel()` in `assets/js/registro.js` and in the `req.*`, `f.device.h`, `err.device` and `aside.req.*` strings in `assets/js/i18n.js`.

## Notes and limitations

- **Contract language.** The contract is always shown in Spanish, as the binding version under Argentine law. All interface text around it is translated into all six languages, and a note explains this. The PDF is also in Spanish.
- **Privacy.** DNI photos and data go straight from the browser to FormSubmit, a third-party processor, and then to the Gmail inbox. Nothing is stored in localStorage except the language choice. Consider moving to your own backend or a paid form service as volume grows.
- **Browser support.** Attaching files to a native form relies on `DataTransfer`, which works in Chrome, Edge, Firefox and Safari 14.1+. Older browsers fall back to a `fetch` (no-cors) POST and then go to the thank-you page without confirmation.
- **The 3D globe** uses stylised continent outlines. It is decorative, not cartographic.
- **Copy.** It describes an early-stage, pilot-capacity provider with no clients, statistics or testimonials claimed. Keep it that way until you have real ones.
