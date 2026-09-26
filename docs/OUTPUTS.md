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

## Artwork editing and interior cuts

**Outer outline only** defaults on for die cuts. Enclosed cut paths are omitted, leaving material inside gaps; open concavities still follow the silhouette. Separate artwork pieces retain their own outer outlines. Turn the option off to include interior cutouts, then review the result at the chosen perimeter/grouping settings.

**Edit artwork** beneath the live proof opens Erase/Restore brushes with adjustable size, Undo (up to 20 actions per session), Clear all erasures, Cancel/Escape, and Apply. Restore reverses brush erasures only, not automatic background removal. Entirely erased drafts cannot be applied. Edits persist across proof settings but are cleared by Reset or a new upload. Apply rebuilds the proof and invalidates previous download links; generate a fresh package after editing.

The original upload is unchanged. Manual erasures affect normalized print, foreground mask, proof and derived contour geometry. Manifest v2 records `outerOutlineOnly`, `processing.manualArtworkEdits`, `manualErasePixels`, and `editRaster`. Production warnings instruct operators to preserve the edits when reprocessing or enhancing the original. The erasure history itself is not saved: exported jobs cannot currently be reopened as editable sessions.

## What this is not

- Not PDF/X certification, a RIP driver, imposition software or a finished color-managed workflow.
- PDF/SVG originals are rasterized for normalized artwork; the contour remains vector, but original vector art is not preserved as vectors in the generated PDF.
- The default output is at most **1200 pixels on its longest side** (configurable up to 2400). At 5 inches, 1200 pixels is only 240 DPI. Source DPI and output DPI are different; the manifest records both. Retain the original for higher-resolution prepress.
- RGB artwork is not automatically converted to a press-specific CMYK/ICC profile. White pixels/background are white-backed; the operator must verify RIP handling and substrate/white-ink policy.
- Holographic coloring is a **simulation in the proof only**. It is not baked into production artwork and does not create a white-ink separation. The print shop decides how white/near-white areas expose the film.
- Manual enhancement is a configurable service request, not automated upscaling or a guarantee of recovered detail.
- Negative perimeter moves the cut inward and can remove small details. Print-to-edge expansion is best effort, not synthesized bleed.
- Interior cuts follow the cleaned mask and physical offsets; tiny holes can disappear during cleanup or at larger perimeters. Review islands/bridges and complex geometry. This is not a manual vector-node editor.

Before commercial use, test representative files in your own RIP. Measure finished dimensions, inspect the art and contour at high zoom, verify white/background behavior and material, and confirm the CutContour spot separation cuts rather than prints. Keep a human approval step.
