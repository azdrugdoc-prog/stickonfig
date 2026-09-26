# Developer guide

## Architecture

The first release preserves the mature processing routines while separating portable modules from the originating store. No cart, payment provider, mandatory Worker or R2 account is included.

```text
stickonfig.config.mjs     public operator settings / hooks
src/config/              shared configuration validation
src/core/mask/           alpha, edge removal, morphology, subject-support cleanup
src/core/geometry/       components, tracing, distance fields, simplification
src/core/contour/        canonical curves and bounded photographic curve fitting
src/core/segmentation/   ONNX / U2NetP and Clipper2 browser runtime entry
src/core/dpi/            effective source density / quality tiers
src/core/proof/          material preview simulation
src/ui/                 DOM controller, controls and responsive styling
src/production/         manifest validation, SVG and spot-color PDF writer, packaging
src/adapters/pricing/   replaceable example price policy
src/adapters/submit/    download / REST / webhook / callback dispatch
src/adapters/storage/   browser downloads and generic authenticated intake contract
examples/               standalone, iframe, Wix, webhook and optional Worker
public/                 neutral samples and checksum-pinned model
```

The DOM controller still coordinates canvases and some stateful geometry/proof operations. This is not yet a fully headless processing SDK or a React/web-component library. Pure mask, contour, DPI and production modules are independently importable. One configurator per document is supported; use separate iframes for multiple instances.

## Build and development

Node 22.13+; Node 24 tested. `npm ci` installs the exact lockfile. `npm run dev` builds once and starts a local static server. After edits, rebuild/restart or run `npm run build` in another terminal and refresh. There is no hot-module reload. `npm run preview` serves the existing `dist/` on port 4173; `PORT` and `HOST` may override the local server binding.

The build copies only explicit public source/config/assets, bundles the local segmentation/geometry runtime and ZIP library, copies PDF.js/ONNX assets, and validates the model checksum. All app URLs are relative, including model/runtime paths, so a subdirectory mount is practical. Deploy with HTTPS; `file://` is not supported. Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`.

## Configuration

Edit `stickonfig.config.mjs` and rebuild. It is intentionally readable and ships to the browser. Never put API secrets, storage keys, payment secrets or private signing URLs here.

| Section | Controls |
|---|---|
| branding | Store name, logo URL, accent color |
| products | Default material; holographic, laminate, manual enhancement availability |
| sizing | Shared min/max inches, size presets, bumper presets, default preset |
| quantities | Allowed quantities and default |
| pricing | Currency/locale, example area rates/fees, quantity breaks, override function |
| dpi | Recommended / warning / poor thresholds |
| upload | Per-input MB limit |
| processing | Working raster limit (keep conservative for memory/latency) |
| output | Normalized artwork longest side; capped to prevent excessive memory use |
| perimeters / grouping | Physical inch values |
| submission | Mode, endpoint, button label and optional callback |

Set presets that fit size limits. Changing the default material affects form reset/new uploads. Enhancement is off by default: enabling it means **your shop** will arrange a manual service. The software neither repairs images automatically nor promises that missing detail can be recovered.

## Pricing customization

The included formula is deliberately a placeholder, not the originating store's price policy. For a custom function, set `pricing.calculate(order, config)` and return at least `{subtotal, unitPrice}`; optionally return `materialUpgradeTotal`, `laminateTotal`, `enhancementFee`. Amounts must be finite, nonnegative major-currency units. `order` contains size, quantity, shape, material, standard/custom selection and finish/service booleans.

```js
calculate(order) {
  const subtotal = Math.round((25 + order.width * order.height * order.quantity * 0.1) * 100) / 100;
  return { subtotal, unitPrice: Math.round(subtotal / order.quantity * 100) / 100 };
}
```

This is example code, not pricing advice. Your real backend must validate selections and recalculate price, tax, shipping and stock availability. Never charge from a browser-supplied total.

## Submission contract

`createJob(input, {original, printImage, proof, mask})` returns:

```js
{
  id: 'random-uuid',
  manifest: {
    version: 1, product: 'custom-sticker', width: 3, height: 2.4,
    quantity: 100, cutStyle: 'die-cut', material: 'vinyl',
    matteLaminate: false, enhanceResolution: false,
    resolution: { effectiveDpi: 300 }, pricing: { subtotal: 0, currency: 'USD' },
    contour: { coordinateSpace: 'normalized-top-left', paths: [], commands: [] },
    production: { spotColorName: 'CutContour', strokePoints: 0.25 }
  },
  artifacts: [{ kind: 'production-pdf', filename: 'production-CutContour.pdf', blob: Blob }]
}
```

Abbreviated example: actual jobs contain eight artifacts and additional diagnostics. Manifest paths are normalized 0–1; finished size is inches. Curves are generated from the normalized contours with physical-unit smoothing. See [outputs](OUTPUTS.md).

Modes:

- **download:** create explicit ZIP/individual download links. No network upload, storage or order.
- **rest / webhook:** POST multipart to `submission.endpoint`; use `jobFormData(job)` for the contract. Fields: `manifest` JSON text, `original`, `normalized-print`, `proof`, `mask`, `contour-svg`, `contour-json`, `production-pdf`, and `manifest-file` containing the manifest artifact. Expect a successful HTTP response with `{ok:true,id}`. Signing/private webhook credentials belong on your own proxy, not the client.
- **callback:** `submission.onSubmit = async job => { ... }`. Reject on error; resolve only when your integration has accepted the job. Useful for a custom cart/checkout. It receives Blobs, not JSON-serializable file bytes.

The app emits the bubbling `stickonfig:submitted` DOM event **after** successful adapter completion, with the job in `event.detail`. This event is not payment confirmation. Cross-origin iframe hosts cannot directly read it; write an origin-checked `postMessage` bridge with minimal metadata if needed. Do not send full artwork/PII to wildcard origins.

## Backend and storage

`receiveJob(request,{authorize,store,maxBytes})` is a Fetch-API intake helper. It rejects requests unless your authorization callback approves them, bounds bytes while reading, normalizes the manifest, recomputes configured price, and passes `{id,manifest,artifacts}` to your storage callback. The example cap is 24 MB **combined**, which can reject a package whose original individually meets the frontend limit. Adjust both with your host's memory/upload limits in mind.

The helper is an integration starting point, not a complete commerce endpoint. Add session/CSRF enforcement, exact-origin CORS, abuse controls, malware scanning, idempotency, access-controlled download links, retention/cleanup, and production approval. It does not prove the uploaded pixels match the contour, verify every binary, reserve stock or charge payment. Treat PDFs/SVGs as untrusted files; quarantine them. Regenerate production output from reviewed source data if your workflow requires authoritative prepress.

[The Worker example](../examples/cloudflare/README.md) uses private R2 bindings plus a required operator-owned authentication service. Other hosts can use the same contract with filesystem/object storage. No store credentials or default publicly writable endpoint are supplied.

## Background removal and geometry

The browser downloads the locally served 4.36 MiB U2NetP weights and ONNX WASM assets. It runs single-threaded local inference through `@bunnio/rembg-web`; no model API receives artwork. Transparent/flat artwork can bypass inference. When inference fails, the inherited edge-color fallback produces a review warning.

Subject cleanup retains a dominant confident core with limited nearby support; it is not face identification. Hair, hands, translucent objects, multiple people and busy backgrounds remain difficult. Padding occurs before morphology/contouring so edge-adjacent artwork has expansion space. Contours use Clipper2 union/offsets, preserve concavity and support up to 16 separate paths. Display proof, SVG and PDF share canonical curves. Debug mode exposes the intermediate masks, bounds and transforms.

## Resolution and production

Source DPI uses original raster dimensions relative to actual physical placement, including zoom and print-to-edge scaling. Defaults: 300+ ready; 200–299 acceptable; 150–199 low; below 150 poor. Below 200 triggers confirmation unless manual enhancement is selected. PDF/SVG may contain raster images and receive an unverified notice.

The **normalized output raster** has an independent resolution cap, recorded as `production.outputDpi`. A high source DPI does not mean a large output PDF retains all source detail. The original is always included. See [OUTPUTS.md](OUTPUTS.md) for RGB, white-ink, vector-art and RIP limitations.

## Customization and testing

UI labels/layout live in `index.html` and `src/ui/`; neutral shape icons use `public/mark.svg`. Extend adapters instead of baking in a host service. Tests exercise generated transparent/raster fixtures, grouping, concavity, symmetry, size/aspect lock, DPI, material, ONNX inference, eight artifacts and real PDF rendering. Add regression fixtures without customer/proprietary content.

Dependencies remain under their own licenses; retain [notices](../THIRD_PARTY_NOTICES.md) and review additions. See [security](../SECURITY.md) and [support](../SUPPORT.md) before operating an instance.
