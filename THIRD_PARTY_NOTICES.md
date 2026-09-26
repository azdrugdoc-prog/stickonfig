# Third-party notices

Stickonfig's original code is MIT. Dependencies and the segmentation weights retain their own licenses; they are **not relicensed as MIT**. Keep `LICENSE`, this notice, and `licenses/` with redistributions. No AGPL dependency is included.

| Component | Version | License | Purpose / source |
|---|---|---|---|
| rembg-web | 1.0.2 | MIT | Browser segmentation wrapper, [bunn-io/rembg-web](https://github.com/bunn-io/rembg-web) |
| ONNX Runtime Web + Common | 1.23.2 | MIT, plus bundled third-party notices | Local WASM inference, [Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/v1.23.2) |
| U2NetP weights | pinned SHA-256 below | Apache-2.0 | Salient foreground segmentation, [model mirror](https://huggingface.co/edgetools/u2netp), [U²-Net source](https://github.com/xuebinqin/U-2-Net) |
| Clipper2 TypeScript | 2.0.1-18 | Boost Software License 1.0 | Polygon unions/offsets, [clipper2-ts](https://github.com/boy1dr/clipper2-ts) |
| PDF.js | 6.3.289 | Apache-2.0 | First-page PDF rasterization and test rendering, [Mozilla PDF.js](https://github.com/mozilla/pdf.js) |
| fflate | 0.8.3 | MIT | Local production ZIP packaging, [fflate](https://github.com/101arrowz/fflate) |
| esbuild (development) | 0.25.10 | MIT | Bundles browser processing runtime, [esbuild](https://github.com/evanw/esbuild) |
| Playwright (development) | 1.63.0 | Apache-2.0 | Browser regression tests, [Playwright](https://github.com/microsoft/playwright) |

The full locked production dependency inventory, including transitives and optional Node-only packages, is in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). `npm run audit:licenses` checks every production lockfile entry against a permissive-license allowlist and retains installed notices. ONNX's upstream notices also cover native code compiled into WASM. Optional native canvas packages are not copied to the static app. `guid-typescript` declares ISC in npm but omits its license text; its metadata is retained, and the build asserts it is **not included** in the wasm-only browser bundle.

The PDF writer, canonical contour command generator, mask cleanup and UI were extracted from the originating application; they do not add a PDF-generation dependency. No customer artwork, stock photos, store marks, or proprietary fonts are included. The demo mark, SVG sample and synthetic test fixtures are original generated assets supplied under the project MIT license. README screenshots show only these fixtures.

## U2NetP provenance

File: `public/assets/models/u2netp.onnx` (4,574,861 bytes).

SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.

The [model card](https://huggingface.co/edgetools/u2netp) identifies a byte-for-byte mirror of the rembg release asset and declares Apache-2.0 for the weights. The build verifies this checksum; the browser wrapper also checks the pinned model hash. Model/license texts are in `licenses/u2netp/`.

Credit: Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar Zaiane and Martin Jagersand, “U2-Net: Going Deeper with Nested U-Structure for Salient Object Detection,” Pattern Recognition 106, 107404 (2020).

The downloaded code/model runs locally in the browser. Inference sends no customer image to a model API. Operators remain responsible for input artwork rights, deployment privacy, and reviewing the dependencies they choose to add or upgrade.
