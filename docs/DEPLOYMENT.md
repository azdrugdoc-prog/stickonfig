# Deployment choices

All normal processing, proofing, ZIP and PDF generation is browser-side. Static hosting supports the **full download-only application**. Server-side code is needed only when you want uploads/storage, checkout, email or integration with your business systems.

Common setup: Node 22.13+ (24 tested), `npm ci`, build command `npm run build`, output directory `dist`. Only publish `dist/`. Serve via HTTPS; allow JavaScript modules, `.wasm` (`application/wasm`), `.onnx` and image assets. Do not rewrite asset requests to `index.html`. The bundled ONNX WASM is relatively large; check your host's asset limits.

## Cloudflare Pages

Create a Pages project connected to **your fork**, select no framework, build with `npm run build`, output `dist`, and use Node 24. Or upload an already-built `dist` through the Pages deployment tools. No Worker, R2 binding or account ID is required for download mode. [Official static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Optional server intake is separate; see [the Worker example](../examples/cloudflare/README.md). It is not enabled in the static app and should not be deployed as an anonymous upload endpoint.

## Netlify

Import your fork as a site, use `npm run build`, and publish `dist`. Select Node 24. The root `netlify.toml` supplies the build/output settings. [Official build configuration](https://docs.netlify.com/build/configure-builds/overview/).

Do not enable form handling and assume it implements the multipart artifact/order workflow. Use your own authenticated API if you need submissions rather than downloads.

## Vercel

Import your fork, select the “Other” framework preset, use build command `npm run build`, output `dist`, and Node 24. The root `vercel.json` contains these static build settings. [Official framework guidance](https://vercel.com/docs/frameworks/more-frameworks).

No Vercel function is required for downloads. A server adapter you add has its own request/memory/time limits; review them before accepting large packages.

## Generic static / Node hosting

Copy the contents of `dist` into your static document root. You may mount it under a path such as `/stickonfig/`; preserve the directory structure. Configure correct module/WASM MIME types and HTTPS.

`npm run preview` is a **local validation server**, not an internet-facing hardened application server. For production, use your normal maintained static server/CDN. If you build a Node backend, adapt the Fetch-API multipart contract or use an established framework with matching limits/security.

## Embedding/security headers

For iframe use, configure `Content-Security-Policy: frame-ancestors` for your own host-site origins. A blanket `X-Frame-Options: DENY` prevents embedding. Verify your platform's sandbox/download behavior rather than disabling security globally. WASM execution may require an appropriate CSP `script-src` policy (for example `wasm-unsafe-eval` in supporting browsers); PDF.js also uses a local worker. Test your actual CSP.

## Verification status

The local production build, static serving, browser-local inference and PDF export are tested. The app has **not** been independently deployed/certified on every listed provider or tested inside every Wix/Shopify/editor configuration. These are documented static-host setup paths based on provider documentation, not claims of universal compatibility. No public hosted service is supplied by this project.
