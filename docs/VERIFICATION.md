# v0.1.0 verification

The extraction was tested separately from its originating storefront; no production deployment or storefront refactor was performed for this release.

## Completed locally

- Clean lockfile installation (`npm ci`) and production static build on Node 24 / Windows.
- Eleven automated unit/contract/documentation tests: alpha, edge removal, subject-support cleanup, symmetric padding, concavity, polygon offsets/grouping, multiple paths, DPI tiers, price adapter, foil pixel behavior, manifest/package output, solid 0.25 pt spot-color PDF, authenticated bounded intake, mocked Worker bindings and documentation links.
- Chromium browser integration: neutral SVG/transparent artwork, actual local U2NetP WASM inference on a synthetic textured portrait, JPEG/WEBP input, PDF first-page import, animated GIF first-frame sampling, low-DPI confirmation, seven shapes, aspect lock, quarter-inch controls, material switching, new-art reset, desktop/mobile layout, and ZIP/eight-file download generation.
- Browser app served from a **subdirectory mount**, with model/runtime/PDF assets loaded successfully.
- Generated PDF opened and rendered with PDF.js, and the render visually inspected. White background, correct physical proportions and multiple thin solid magenta contours were confirmed. This is not RIP certification.
- An additional existing photographic portrait was processed locally for an extraction check. That private source and its generated output are **not** included in the repository or screenshots.
- Production dependency/license inventory, model checksum, source sanitization scan and manual allowlist review. Gitleaks 8.30.1 found no leaks in the staged publication files. npm audit reported zero known vulnerabilities at the time of release.
- README screenshot uses only the generated neutral sample, not customer artwork.

## PDF import regression update

Generated two-page PDF coverage verifies unpainted-page transparency, deep concavities, intentional white details, and explicitly painted opaque white backgrounds. Import transparency is separate from the white-backed production PDF export.

## Not certified or supplied

- Individual printer/cutter/RIP compatibility, color profiles, white-ink separations, production throughput or commercial quality guarantees.
- Live Wix checkout/embedding and every mobile browser/device. Chromium responsive checks are not a substitute for real-device UAT.
- Deployment to all named static providers. Hosting guides describe expected static settings, not a hosted service or provider certification.
- A live authenticated Cloudflare/R2 instance, payment workflow, email system or automatic enhancement service. The Worker example uses mocked bindings in tests and requires operator configuration.

For each installation, test the actual domain/CSP, file downloads, pricing, form options, authentication/storage integration and RIP before accepting customer orders. Re-run `npm test`, `npm run build`, `npm run test:browser`, `npm run audit:licenses` and `npm run audit:public` after relevant changes.
