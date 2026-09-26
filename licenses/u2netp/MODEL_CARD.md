---
license: apache-2.0
library_name: onnx
pipeline_tag: image-segmentation
tags:
  - onnx
  - onnxruntime-web
  - background-removal
  - salient-object-detection
  - u2net
---

# u2netp (ONNX)

A mirror of **u2netp** — the small ("portable") variant of
[U²-Net](https://github.com/xuebinqin/U-2-Net) — for salient object detection,
the model behind background removal.

This repository exists so the model can be fetched directly by a browser at
runtime. It is a **verbatim mirror**: the file is byte-for-byte the `u2netp.onnx`
asset published by the [rembg](https://github.com/danielgatis/rembg) project, and
its SHA-256 is pinned by the consumer.

| | |
| --- | --- |
| File | `u2netp.onnx` |
| Size | 4,574,861 bytes (4.36 MiB) |
| SHA-256 | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |
| Opset | 11 |

## Tensor contract

Read the input and output names off the graph rather than hardcoding them — the
first of each is what the pipeline below uses.

- **Input** — `float32[1, 3, 320, 320]`, NCHW, RGB.
- **Output** — `float32[1, 1, 320, 320]`, a saliency map. U²-Net emits several
  side outputs; the **first** is the fused one to use.

## Pre / post-processing

The model is fixed at 320×320, so the image is **squashed** to that size (aspect
ratio is not preserved), then normalised with the ImageNet statistics:

```
scaled  = (pixel / 255) / max_pixel_value_of_the_image
tensor  = (scaled - mean) / std
mean    = [0.485, 0.456, 0.406]
std     = [0.229, 0.224, 0.225]
```

Afterwards, min–max normalise the saliency map to 0–1, scale to 0–255, resize it
back to the original dimensions (bilinear), and use it as the alpha channel of
the source image.

> **Note on other mirrors.** Some copies of this model ship a
> `preprocessor_config.json` describing a letterbox resize
> (`keep_aspect_ratio` / `do_pad`). That does **not** match the pipeline above,
> and following it changes the output.

## Licence and credit

The U²-Net weights are **Apache-2.0**. If you use them, cite the paper:

```bibtex
@InProceedings{Qin_2020_PR,
  title   = {U2-Net: Going Deeper with Nested U-Structure for Salient Object Detection},
  author  = {Qin, Xuebin and Zhang, Zichen and Huang, Chenyang and Dehghan, Masood
             and Zaiane, Osmar and Jagersand, Martin},
  journal = {Pattern Recognition},
  volume  = {106},
  pages   = {107404},
  year    = {2020}
}
```

- Model and paper: [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net) (Apache-2.0)
- The release asset mirrored here: [danielgatis/rembg](https://github.com/danielgatis/rembg) (MIT)
