# Production package and prepress responsibilities

Generate production files creates the following in the browser. No backend is required.

| File | Purpose |
|---|---|
| `original-<filename>` | Uploaded source, preserved for prepress/reprocessing |
| `normalized-print.jpg` | White-backed RGB artwork, fitted/cropped to the chosen physical shape |
| `customer-proof.png` | Visual proof with dashed magenta contour; optional holographic simulation |
| `foreground-mask.png` | Binary foreground silhouette in padded working space |
| `cut-contour.svg` | Solid magenta canonical contour, physical dimensions and 0.25 pt-equivalent stroke |
| `cut-contour.json` | Normalized paths and canonical curve commands |
| `production-CutContour.pdf` | RGB artwork plus vector named `CutContour` separation, solid 0.25 pt stroke |
| `job-manifest.json` | Size, quantity, options, warnings, processing, DPI, pricing and artifact metadata |

A ZIP bundles all eight. Individual links remain available. Downloads belong to the current browser tab; refresh/close is not persistent storage.

## CutContour

The PDF uses `/Separation /CutContour` with a magenta CMYK alternate color. Paths are stroked, not filled, with a solid 0.25 pt line. Multiple meaningful disconnected contours remain separate paths. The dashed line exists only in the customer proof. SVG names the path `CutContour`, but **PDF is the spot-color production format**; an SVG stroke is not a PDF separation.

Coordinates in JSON are top-left normalized 0–1; PDF uses bottom-left points, 72 points/inch. Curves are shared between proof, SVG and PDF. Confirm the RIP recognizes the exact spot name and routes it to cutting rather than printing magenta ink.

## What this is not

- Not PDF/X certification, a RIP driver, imposition software or a finished color-managed workflow.
- PDF/SVG originals are rasterized for normalized artwork; the contour remains vector, but original vector art is not preserved as vectors in the generated PDF.
- The default output is at most **1200 pixels on its longest side** (configurable up to 2400). At 5 inches, 1200 pixels is only 240 DPI. Source DPI and output DPI are different; the manifest records both. Retain the original for higher-resolution prepress.
- RGB artwork is not automatically converted to a press-specific CMYK/ICC profile. White pixels/background are white-backed; the operator must verify RIP handling and substrate/white-ink policy.
- Holographic coloring is a **simulation in the proof only**. It is not baked into production artwork and does not create a white-ink separation. The print shop decides how white/near-white areas expose the film.
- Manual enhancement is a configurable service request, not automated upscaling or a guarantee of recovered detail.
- Negative perimeter moves the cut inward and can remove small details. Print-to-edge expansion is best effort, not synthesized bleed.
- A single outer loop is traced per connected raster component; internal holes are not a fully general compound-cut-hole workflow. Review islands/bridges and complex geometry.

Before commercial use, test representative files in your own RIP. Measure finished dimensions, inspect the art and contour at high zoom, verify white/background behavior and material, and confirm the CutContour spot separation cuts rather than prints. Keep a human approval step.
