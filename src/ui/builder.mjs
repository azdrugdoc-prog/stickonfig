import config from '../config/index.mjs';
import { stickerPrice, stickerSizes } from '../adapters/pricing/example.mjs';
import { holographicPreview } from '../core/proof/material.mjs';
import { stickerResolution } from '../core/dpi/index.mjs';
import { contourCommands } from '../core/contour/index.mjs';
import * as masks from '../core/mask/index.mjs';
import * as geometry from '../core/geometry/raster.mjs';
import { createJob } from '../production/job.mjs';
import { submitJob as deliverJob } from '../adapters/submit/index.mjs';
import { clearDownloads } from '../adapters/storage/download.mjs';

(() => {
  const app = document.querySelector("#sticker-builder-app");
  if (!app) return;

  const { colorDistance, sampleBackgroundPalette, alphaMask, classifyArtwork, edgeBackgroundMask, dilate, erode, removeTinyIslands, fillTinyHoles, cleanupSubjectMatte, padMask } = masks;
  const { distanceTransformLine, offsetMask, labelComponents, polygonArea, traceComponentBoundary, perpendicularDistance, simplifyOpenPath, simplifyClosedPath, smoothClosedPath } = geometry;
  const MAX_FILE_BYTES = config.upload.maxMegabytes * 1024 * 1024;
  const ANALYSIS_MAX_SIDE = config.processing.analysisMaxSide;
  const PERIMETERS = config.perimeters;
  const ALLOWED_EXTENSIONS = new Set(["svg", "png", "jpg", "jpeg", "webp", "gif", "pdf"]);
  const PDF_JS_MODULE = new URL("../../assets/vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
  const PDF_JS_WORKER = new URL("../../assets/vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const PROCESSING_MODULE = new URL("../../assets/vendor/sticker-processing.mjs", import.meta.url).href;
  const MAX_CONTOUR_PATHS = 16;
  const MAX_POINTS_PER_PATH = 420;
  const GROUPING_GAPS = config.grouping;
  const DEBUG_STICKER = new URLSearchParams(window.location.search).get("debug") === "1";

  const elements = {
    form: document.querySelector("#builder-controls"),
    file: document.querySelector("#builder-file"),
    dropZone: document.querySelector("#builder-drop-zone"),
    fileStatus: document.querySelector("#builder-file-status"),
    artPreview: document.querySelector("#builder-art-preview"),
    sourcePreview: document.querySelector("#builder-source-preview"),
    fileDetails: document.querySelector("#builder-file-details"),
    proofCanvas: document.querySelector("#builder-proof-canvas"),
    proofPlaceholder: document.querySelector("#builder-proof-placeholder"),
    proofStatus: document.querySelector("#builder-proof-status"),
    reviewMessage: document.querySelector("#builder-review-message"),
    width: document.querySelector("#builder-width"),
    height: document.querySelector("#builder-height"),
    quantity: document.querySelector("#builder-quantity"),
    lockRatio: document.querySelector("#builder-lock-ratio"),
    perimeter: document.querySelector("#builder-perimeter"),
    grouping: document.querySelector("#builder-grouping"),
    customOffset: document.querySelector("#builder-custom-offset"),
    estimate: document.querySelector("#builder-estimate"),
    unitPrice: document.querySelector("#builder-unit-price"),
    validation: document.querySelector("#builder-validation"),
    add: document.querySelector("#builder-add"),
    reset: document.querySelector("#builder-reset")
  };
  const control = (id) => document.querySelector(`#builder-${id}`);
  // Material previews read pixels frequently; use a consistent raster backend.
  elements.proofCanvas.getContext('2d', { willReadFrequently: true });
  const shapeNames = { 'die-cut': 'Die-cut', circle: 'Circle', oval: 'Oval', rectangle: 'Rectangle', square: 'Square', 'rounded-rectangle': 'Rounded rectangle', bumper: 'Bumper Sticker' };

  const state = {
    file: null,
    sourceUrl: "",
    image: null,
    originalWidth: 0,
    originalHeight: 0,
    sourceCanvas: null,
    sourceImageData: null,
    processedCanvas: null,
    mask: null,
    maskWidth: 0,
    maskHeight: 0,
    workingPadding: null,
    hasTransparency: false,
    backgroundPalette: [[255, 255, 255]],
    aspectRatio: 1,
    dimensionAnchor: "width",
    sizeMode: "standard",
    standardSize: "2x2",
    placement: { zoom: 1, x: 0, y: 0 },
    artworkTransform: null,
    confidence: 0,
    warnings: [],
    contourPaths: [],
    sourcePageCount: 0,
    printCanvas: null,
    renderScheduled: false,
    renderGeneration: 0,
    uploadGeneration: 0,
    processingModule: null,
    advancedMask: null,
    advancedAlpha: null,
    advancedRefinement: "none",
    advancedSourceCanvas: null,
    artworkProfile: null,
    sourceArtBounds: null,
    segmentationEngine: "none",
    processingMetadata: {},
    debugStages: {}
  };

  let processingModulePromise;
  let submitPending = false;

  function resolutionInput() {
    const factor = (selectedValue('borderMode') === 'print-to-edge' ? 1.08 : 1) * artworkPlacement().zoom;
    const scale = state.artworkTransform?.scale || 0;
    return { type: extensionFor(state.file?.name), pixelWidth: state.originalWidth, pixelHeight: state.originalHeight,
      placedWidth: (state.sourceArtBounds?.width || 0) * scale * factor,
      placedHeight: (state.sourceArtBounds?.height || 0) * scale * factor };
  }

  function renderResolution() {
    const pill = control('resolution');
    pill.hidden = !state.file || !state.artworkTransform;
    if (pill.hidden) return;
    pill.title = 'Estimated from the original artwork pixels at the placed print size, including zoom and bleed. This checks pixel density, not existing blur or compression. Production files still receive artwork review.';
    const resolution = stickerResolution(resolutionInput());
    pill.classList.toggle('is-low', resolution.requiresWarning);
    pill.classList.toggle('is-acceptable', resolution.status === 'acceptable');
    pill.classList.toggle('is-good', resolution.status === 'good');
    pill.textContent = resolution.effectiveDpi === null
      ? `PDF / SVG: embedded-image resolution needs production review · ${config.dpi.recommended} DPI recommended`
      : `${({ good: 'Print-ready', acceptable: 'Acceptable', low: 'Low resolution — enhancement recommended', poor: 'Poor resolution — enhancement strongly recommended' })[resolution.status]}: ${Math.floor(resolution.effectiveDpi)} DPI · ${resolution.recommendedDpi} DPI recommended`;
    if (control('enhance').checked) pill.textContent += ' · Enhancement requested';
    if (DEBUG_STICKER && window.__stickonfigDebug) window.__stickonfigDebug.resolution = resolution;
  }

  function confirmLowResolution(resolution) {
    const dialog = control('resolution-dialog');
    const { width, height } = dimensions();
    control('resolution-detail').textContent = `At ${width} × ${height} inches, your artwork is approximately ${Math.floor(resolution.effectiveDpi)} DPI; we recommend ${resolution.recommendedDpi} DPI. It may print grainy or blurry. Are you sure you want to continue?`;
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
      dialog.showModal();
    });
  }

  async function loadProcessingModule() {
    if (!processingModulePromise) processingModulePromise = import(PROCESSING_MODULE);
    state.processingModule = await processingModulePromise;
    return state.processingModule;
  }

  function extensionFor(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function money(value) {
    return new Intl.NumberFormat(config.pricing.locale, {style:'currency',currency:config.pricing.currency}).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function selectedValue(name) {
    return elements.form.querySelector(`input[name="${name}"]:checked`)?.value || "";
  }

  function dimensions() {
    return {
      width: Math.max(0, Number(elements.width.value) || 0),
      height: Math.max(0, Number(elements.height.value) || 0),
      quantity: Math.max(0, Math.round(Number(elements.quantity.value) || 0))
    };
  }

  function formatDimension(value) {
    return String(Number(value.toFixed(4)));
  }

  function syncDimensions(anchor = state.dimensionAnchor) {
    state.dimensionAnchor = anchor;
    if (state.sizeMode === "standard") return;
    if (["circle", "square"].includes(selectedValue("cutStyle"))) {
      elements[anchor === "width" ? "height" : "width"].value = elements[anchor].value;
      return;
    }
    if (!elements.lockRatio.checked || !state.file || !(state.aspectRatio > 0)) return;
    const ratio = anchor === "width" ? state.aspectRatio : 1 / state.aspectRatio;
    const input = elements[anchor];
    const other = elements[anchor === "width" ? "height" : "width"];
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < config.sizing.min || value > config.sizing.max) return;
    // Clamp the pair together, not each axis independently.
    const bounded = Math.max(Math.max(config.sizing.min, config.sizing.min * ratio), Math.min(Math.min(config.sizing.max, config.sizing.max * ratio), value));
    input.value = formatDimension(bounded);
    other.value = formatDimension(bounded / ratio);
  }

  function updateArtworkTransform() {
    let minX = state.maskWidth, minY = state.maskHeight, maxX = -1, maxY = -1;
    for (let i = 0; i < state.mask.length; i += 1) {
      if (!state.mask[i]) continue;
      const x = i % state.maskWidth, y = Math.floor(i / state.maskWidth);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const bounds = maxX >= minX ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { x: 0, y: 0, width: state.maskWidth, height: state.maskHeight };
    state.aspectRatio = bounds.width / bounds.height;
    syncDimensions();
    const physical = dimensions();
    // One physical scale for BOTH axes and BOTH artwork and contour. Padding
    // is working space, not a license to squeeze the raster into a new ratio.
    const groups = labelComponents(state.mask, state.maskWidth, state.maskHeight).components.filter((part) => part.size >= 18).length;
    const bridge = groups > 1 ? (GROUPING_GAPS[elements.grouping?.value] ?? GROUPING_GAPS.auto) / 2 : 0;
    const requestedMargin = selectedValue("cutStyle") === "die-cut" ? Math.max(perimeterInches(), bridge) + 0.008 : 0.012 * Math.min(physical.width, physical.height);
    const margin = Math.min(requestedMargin, Math.min(physical.width, physical.height) / 3);
    const scale = Math.min((physical.width - 2 * margin) / bounds.width, (physical.height - 2 * margin) / bounds.height);
    state.artworkTransform = {
      scale, x: (physical.width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (physical.height - bounds.height * scale) / 2 - bounds.y * scale, bounds
    };
  }

  function perimeterInches() {
    const mode = selectedValue("perimeterMode");
    if (mode === "custom") return Math.max(-1, Math.min(1, Number(elements.perimeter.value) || 0));
    return PERIMETERS[mode] ?? PERIMETERS.standard;
  }

  function calculatePrice() {
    return stickerPrice({ ...dimensions(), cutStyle: selectedValue('cutStyle'), sizeMode: state.sizeMode,
      standardSize: state.standardSize, matteLaminate: control('laminate').checked, enhanceResolution: control('enhance').checked, material: selectedValue('material') });
  }

  function renderPrice() {
    const price = calculatePrice();
    elements.estimate.textContent = money(price.subtotal);
    elements.unitPrice.textContent = `${money(price.unitPrice)} each · final pricing subject to file review`;
    control('selected-price').textContent = money(price.subtotal);
    control('price-label').textContent = `${dimensions().quantity} stickers`;
    control('inset-note').hidden = perimeterInches() >= 0;
    const rows = { Shape: shapeNames[selectedValue('cutStyle')], Size: `${elements.width.value} × ${elements.height.value} in`,
      Quantity: dimensions().quantity, Finish: control('laminate').checked ? 'Matte laminate' : 'No laminate' };
    if (control('enhance').checked) rows['Image enhancement'] = '+' + money(config.pricing.enhancementFee) + ' · manual service';
    if (selectedValue('material') === 'holographic') rows['Material upgrade (holographic film)'] = '+' + money(price.materialUpgradeTotal);
    else rows.Material = 'Vinyl';
    control('material-note').hidden = selectedValue('material') !== 'holographic';
    const holographic = selectedValue('material') === 'holographic';
    control('border-label').textContent = holographic ? 'Holographic border' : 'White border';
    control('border-description').textContent = holographic ? 'Shows the holographic film between artwork and cut.' : 'Shows a clean white halo between artwork and cut.';
    control('border-key-label').textContent = holographic ? 'Printable area / holographic border' : 'Printable area / white border';
    control('material-key').classList.toggle('is-holographic', holographic);
    control('summary').innerHTML = Object.entries(rows).map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    control('size-tiles').querySelectorAll('[data-builder-size]').forEach((button) => {
      const size = stickerSizes(selectedValue('cutStyle')).find((size) => size.key === button.dataset.builderSize);
      if (!size) return; // Shape changes replace the available preset tiles below.
      const selected = state.sizeMode === 'standard' && state.standardSize === size.key;
      button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
      button.querySelector('small').textContent = `${money(stickerPrice({ ...size, quantity: dimensions().quantity,
        cutStyle: selectedValue('cutStyle'), sizeMode: 'standard', standardSize: size.key, matteLaminate: control('laminate').checked, enhanceResolution: control('enhance').checked, material: selectedValue('material') }).unitPrice)} each`;
    });
    control('custom-size').classList.toggle('is-selected', state.sizeMode === 'custom');
    control('custom-size').setAttribute('aria-pressed', String(state.sizeMode === 'custom'));
    control('custom-dimensions').hidden = state.sizeMode !== 'custom';
    document.querySelectorAll('[data-builder-quantity]').forEach((button) => {
      const selected = +button.dataset.builderQuantity === dimensions().quantity;
      button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderSizeChoices() {
    control('size-tiles').innerHTML = stickerSizes(selectedValue('cutStyle')).map((size) =>
      `<button type="button" class="config-tile" data-builder-size="${size.key}" aria-pressed="false"><b>${size.width} × ${size.height} in</b><small></small></button>`).join('');
    const equal = ['circle', 'square'].includes(selectedValue('cutStyle'));
    elements.lockRatio.disabled = equal;
    control('circle-note').hidden = !equal;
    control('circle-note').textContent = `${shapeNames[selectedValue('cutStyle')]} sizes keep width and height equal. Choose Oval or Rectangle for independent dimensions.`;
    control('preview-toolbar').hidden = selectedValue('cutStyle') === 'die-cut';
    elements.proofCanvas.classList.toggle('is-positionable', !control('preview-toolbar').hidden);
    renderPrice();
  }

  function chooseSize(size) {
    state.sizeMode = 'standard'; state.standardSize = size.key;
    elements.width.value = size.width; elements.height.value = size.height;
    renderPrice(); scheduleRender();
  }

  function artworkPlacement() {
    return selectedValue('cutStyle') === 'die-cut' ? { zoom: 1, x: 0, y: 0 }
      : { ...state.placement };
  }

  function redrawPlacement() {
    control('preview-zoom').textContent = `${Math.round(state.placement.zoom * 100)}%`;
    if (!state.printCanvas || !state.artworkTransform || !state.contourPaths.length) return;
    renderArtworkInto(elements.proofCanvas.getContext('2d'), elements.proofCanvas, state.contourPaths, true);
    renderArtworkInto(state.printCanvas.getContext('2d'), state.printCanvas, state.contourPaths, false);
    renderResolution();
    if (DEBUG_STICKER && window.__stickonfigDebug) window.__stickonfigDebug.artworkPlacement = artworkPlacement();
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The artwork could not be decoded. Try exporting it again as PNG, SVG, WEBP, GIF, or PDF."));
      image.src = url;
    });
  }

  const backgroundRemovalAdapters = {
    async keep(imageData) {
      const alpha = alphaMask(imageData);
      return { mask: alpha.mask, alpha: null, engine: "source-alpha" };
    },
    async remove(imageData, options) {
      return { mask: edgeBackgroundMask(imageData, false, options.sampledBackground), alpha: null, engine: "edge-flood-fill" };
    },
    async advanced(imageData, options) {
      const sourceCanvas = state.sourceCanvas;
      if (state.advancedMask && state.advancedSourceCanvas === state.sourceCanvas) {
        return { mask: new Uint8Array(state.advancedMask), alpha: state.advancedAlpha, engine: "u2netp-onnx-wasm", refinement: state.advancedRefinement };
      }
      const module = await loadProcessingModule();
      if (sourceCanvas !== state.sourceCanvas) throw new Error('Artwork changed.');
      const updateProgress = ({ step, progress }) => {
        if (sourceCanvas !== state.sourceCanvas) return;
        const labels = {
          downloading: "Loading local segmentation model",
          processing: "Separating foreground",
          postprocessing: "Cleaning foreground mask",
          complete: "Segmentation complete"
        };
        elements.proofStatus.textContent = `${labels[step] || "Processing artwork"}… ${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`;
        elements.validation.textContent = "Removing the background privately in your browser. First use may take a few seconds.";
        elements.validation.classList.add("builder-processing");
      };
      const cutout = await module.segmentForegroundToCanvas(sourceCanvas, updateProgress);
      if (sourceCanvas !== state.sourceCanvas) throw new Error('Artwork changed.');
      const context = cutout.getContext("2d", { willReadFrequently: true });
      const result = context.getImageData(0, 0, cutout.width, cutout.height);
      const mask = new Uint8Array(result.width * result.height);
      const alpha = new Uint8ClampedArray(mask.length);
      for (let index = 0; index < mask.length; index += 1) {
        // Model output can hallucinate foreground in transparent source padding.
        // Intersect alpha support, never source RGB, to keep the original bounds.
        const value = Math.min(result.data[(index * 4) + 3], imageData.data[(index * 4) + 3]);
        alpha[index] = value;
        mask[index] = value >= 96 ? 1 : 0;
      }
      const semanticPixels = mask.reduce((total, value) => total + value, 0);
      let refinement = "none";
      if (state.artworkProfile?.category === "graphic") {
        const simpleMask = edgeBackgroundMask(imageData, false, options.sampledBackground);
        const simplePixels = simpleMask.reduce((total, value) => total + value, 0);
        if (simplePixels > mask.length * 0.01 && simplePixels < semanticPixels * 0.82) {
          for (let index = 0; index < mask.length; index += 1) {
            mask[index] = mask[index] && simpleMask[index] ? 1 : 0;
          }
          refinement = "flat-graphic-background";
        }
      }
      state.advancedMask = new Uint8Array(mask);
      state.advancedAlpha = alpha;
      state.advancedSourceCanvas = state.sourceCanvas;
      state.advancedRefinement = refinement;
      return { mask, alpha, engine: "u2netp-onnx-wasm", refinement };
    }
  };

  async function maskFromBackgroundAdapter(mode, imageData, options) {
    const sourceAlpha = alphaMask(imageData);
    const coverage = sourceAlpha.mask.reduce((total, value) => total + value, 0) / sourceAlpha.mask.length;
    if (mode === "keep" || (options.hasTransparency && coverage < 0.9 && state.artworkProfile?.category === "graphic")) {
      return { mask: sourceAlpha.mask, alpha: null, engine: "source-alpha" };
    }
    const adapter = mode === "remove" || mode === "advanced" ? backgroundRemovalAdapters.advanced : backgroundRemovalAdapters.keep;
    return adapter(imageData, options);
  }

  function cleanupMask(mask, width, height) {
    const before = labelComponents(mask, width, height).components.length;
    const closed = erode(dilate(mask, width, height), width, height);
    const opened = dilate(erode(closed, width, height), width, height);
    const cleaned = removeTinyIslands(opened, width, height, Math.max(10, mask.length * 0.00018));
    fillTinyHoles(cleaned, width, height, Math.max(12, mask.length * 0.00016));
    state.processingMetadata.componentCountBeforeFiltering = before;
    state.processingMetadata.componentCountAfterFiltering = labelComponents(cleaned, width, height).components.length;
    return cleaned;
  }

  function workingPaddingFor(width, height) {
    const physical = dimensions();
    const bridgeDistance = GROUPING_GAPS[elements.grouping?.value] ?? GROUPING_GAPS.auto;
    const desiredMargin = Math.max(0, perimeterInches()) + (bridgeDistance / 2) + 0.04;
    const solve = (pixels, inches) => {
      const safeMargin = Math.min(desiredMargin, inches * 0.22);
      const available = Math.max(0.01, inches - (2 * safeMargin));
      return Math.max(24, Math.ceil((safeMargin * pixels) / available) + 4);
    };
    const x = solve(width, physical.width);
    const y = solve(height, physical.height);
    return { left: x, right: x, top: y, bottom: y };
  }

  async function buildProcessedArtwork() {
    if (!state.sourceImageData) return;
    const sourceImageData = state.sourceImageData;
    const backgroundMode = selectedValue("backgroundMode");
    const alpha = alphaMask(state.sourceImageData);
    alpha.hasTransparency = state.hasTransparency;
    state.processingMetadata = {};
    let removal;
    try {
      removal = await maskFromBackgroundAdapter(backgroundMode, state.sourceImageData, {
        hasTransparency: alpha.hasTransparency,
        sampledBackground: state.backgroundPalette
      });
    } catch (error) {
      if (sourceImageData !== state.sourceImageData) return;
      removal = await backgroundRemovalAdapters.remove(state.sourceImageData, { sampledBackground: state.backgroundPalette });
      removal.engine = "edge-flood-fill-fallback";
      removal.error = error;
    }
    if (sourceImageData !== state.sourceImageData) return;
    const sourceWidth = state.sourceImageData.width;
    const sourceHeight = state.sourceImageData.height;
    const padding = workingPaddingFor(sourceWidth, sourceHeight);
    state.workingPadding = padding;
    state.debugStages.rawMask = {
      data: new Uint8Array(removal.mask), width: sourceWidth, height: sourceHeight,
      offsetX: padding.left, offsetY: padding.top
    };
    state.debugStages.rawMatte = removal.alpha ? {
      data: removal.alpha, width: sourceWidth, height: sourceHeight,
      offsetX: padding.left, offsetY: padding.top, grayscale: true
    } : null;
    const padded = padMask(removal.mask, sourceWidth, sourceHeight, padding);
    let mask = padded.mask;
    state.debugStages.paddedMask = new Uint8Array(mask);
    const isSubject = removal.engine === "u2netp-onnx-wasm" && state.artworkProfile?.category === "photographic-subject";
    let subjectResult = null;
    if (isSubject) {
      const paddedAlpha = padMask(removal.alpha, sourceWidth, sourceHeight, padding);
      subjectResult = cleanupSubjectMatte(paddedAlpha.mask, padded.width, padded.height, state.sourceImageData, padding);
      mask = subjectResult.mask;
      Object.assign(state.debugStages, subjectResult.stages);
      Object.assign(state.processingMetadata, subjectResult.metadata);
    } else {
      mask = cleanupMask(mask, padded.width, padded.height);
      for (const key of ["subjectCore", "subjectSupport", "subjectSelection", "discardedComponents", "appendageSupport", "preBridgeSubject", "postBridgeSubject"]) delete state.debugStages[key];
    }
    state.debugStages.cleanedMask = new Uint8Array(mask);

    const outputData = new ImageData(new Uint8ClampedArray(state.sourceImageData.data), sourceWidth, sourceHeight);
    if (backgroundMode !== "keep" || alpha.hasTransparency) {
      for (let index = 0; index < removal.mask.length; index += 1) {
        const paddedIndex = ((Math.floor(index / sourceWidth) + padding.top) * padded.width) + (index % sourceWidth) + padding.left;
        const retained = isSubject ? mask[paddedIndex] : removal.mask[index];
        const matte = removal.alpha ? removal.alpha[index] : (retained ? 255 : 0);
        // Restore small filled interior holes from original RGB; soften only the
        // uncertain boundary. Never let discarded islands remain in print RGB.
        const isRecoveredEdge = Boolean(subjectResult?.stages.appendageSupport?.[paddedIndex]);
        const subjectAlpha = isRecoveredEdge ? Math.min(255, Math.round(matte * 255 / 168))
          : matte < 64 ? 255 : Math.min(255, Math.round((matte - 40) * 255 / 128));
        outputData.data[(index * 4) + 3] = retained
          ? Math.min(state.sourceImageData.data[(index * 4) + 3], isSubject ? subjectAlpha : matte) : 0;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = padded.width;
    canvas.height = padded.height;
    canvas.getContext("2d", { willReadFrequently: true }).putImageData(outputData, padding.left, padding.top);
    state.processedCanvas = canvas;
    state.mask = mask;
    state.maskWidth = canvas.width;
    state.maskHeight = canvas.height;
    state.hasTransparency = alpha.hasTransparency;
    state.segmentationEngine = removal.engine;
    state.processingMetadata.segmentationEngine = removal.engine;
    state.processingMetadata.segmentationRefinement = removal.refinement || "none";
    state.processingMetadata.maskThreshold = isSubject ? 64 / 255 : removal.alpha ? 96 / 255 : 0.5;
    state.processingMetadata.subjectCategory = state.artworkProfile?.category || "graphic";
    state.processingMetadata.subjectPrior = state.artworkProfile?.prior || "source-alpha";
    state.processingMetadata.fallbackRemovalUsed = Boolean(removal.error);
    state.processingMetadata.subjectCleanupApplied = isSubject;
    state.processingMetadata.workingPaddingPixels = { ...padding };
    state.processingMetadata.workingRaster = { width: padded.width, height: padded.height };

    let foreground = 0;
    for (const pixel of mask) foreground += pixel;
    const art = state.sourceArtBounds;
    const fraction = foreground / (art ? art.width * art.height : removal.mask.length);
    state.warnings = [];
    if (removal.error) state.warnings.push("Background removal used a simpler method. Please check the subject edges before continuing.");
    if (subjectResult?.review) state.warnings.push("Some parts of the subject were difficult to separate. Please review the proof before continuing.");
    if (fraction < 0.025) state.warnings.push("Very little foreground artwork was detected.");
    if (fraction > 0.92 && backgroundMode !== "keep") state.warnings.push("The background could not be separated confidently from the artwork.");
    if (backgroundMode === "keep" && !alpha.hasTransparency && selectedValue("cutStyle") === "die-cut") {
      state.warnings.push("This opaque file still has its original background, so the die-cut contour will follow the outer artwork envelope.");
    }
    if (selectedValue("borderMode") === "print-to-edge" && selectedValue("cutStyle") === "die-cut" && (alpha.hasTransparency || backgroundMode !== "keep")) {
      state.warnings.push("Print-to-edge on removed-background die cuts is best effort and should receive manual production review.");
    }

    if (selectedValue("cutStyle") !== "die-cut") state.confidence = 0.98;
    else if (alpha.hasTransparency) state.confidence = 0.96;
    else if (backgroundMode !== "keep" && removal.engine === "u2netp-onnx-wasm" && fraction >= 0.025 && fraction <= 0.92) state.confidence = 0.9;
    else if (backgroundMode === "remove" && fraction >= 0.025 && fraction <= 0.92) state.confidence = 0.82;
    else state.confidence = 0.55;
    elements.validation.classList.remove("builder-processing");
    elements.validation.textContent = "";
  }

  async function dieCutContours() {
    const { mask, maskWidth: width, maskHeight: height } = state;
    const { width: physicalWidth, height: physicalHeight } = dimensions();
    const module = await loadProcessingModule();
    const { clipper } = module;
    const { labels, components } = labelComponents(mask, width, height);
    const minimumSize = Math.max(18, Math.round(width * height * 0.00012));
    const useful = components.filter((component) => component.size >= minimumSize).sort((a, b) => b.size - a.size);
    if (!useful.length) return [rectangleContour(false)];
    if (useful.length > MAX_CONTOUR_PATHS) state.warnings.push(`Only the ${MAX_CONTOUR_PATHS} largest artwork groups were contoured; production review is recommended.`);
    const rawPaths = useful.slice(0, MAX_CONTOUR_PATHS).map((component) => {
      const boundary = traceComponentBoundary(labels, component, width, height);
      const points = simplifyClosedPath(boundary, Math.max(0.55, Math.min(width, height) * 0.0006));
      const transform = state.artworkTransform;
      return points.map(([x, y]) => ({ x: transform.x + x * transform.scale, y: transform.y + y * transform.scale }));
    }).filter((points) => points.length >= 3);

    const precision = 4;
    const bridgeDistance = GROUPING_GAPS[elements.grouping?.value] ?? GROUPING_GAPS.auto;
    const unioned = clipper.unionD(rawPaths, clipper.FillRule.NonZero);
    let grouped = unioned;
    let groupingExpansion = 0;
    if (bridgeDistance > 0 && unioned.length > 1) {
      const expanded = clipper.inflatePathsD(unioned, bridgeDistance / 2, clipper.JoinType.Round, clipper.EndType.Polygon, 2, precision, 0.004);
      const merged = clipper.unionD(expanded, clipper.FillRule.NonZero);
      if (merged.length < unioned.length) {
        grouped = merged;
        groupingExpansion = bridgeDistance / 2;
      }
    }
    const perimeter = perimeterInches();
    // For insets, undo grouping expansion as well as applying the negative
    // offset. Do not clamp away the requested cut into the original artwork.
    const remainingPerimeter = perimeter < 0 ? perimeter - groupingExpansion : Math.max(0, perimeter - groupingExpansion);
    let finished = clipper.inflatePathsD(grouped, remainingPerimeter, clipper.JoinType.Round, clipper.EndType.Polygon, 2, precision, 0.0008);
    const simplifyTolerance = Math.max(0.001, Math.min(physicalWidth, physicalHeight) * 0.0004);
    finished = clipper.ramerDouglasPeuckerPathsD(finished, simplifyTolerance);
    finished = clipper.simplifyPathsD(finished, simplifyTolerance * 0.5, true);
    finished = finished.filter((path) => path.length >= 3).sort((a, b) => Math.abs(polygonArea(b.map((point) => [point.x, point.y]))) - Math.abs(polygonArea(a.map((point) => [point.x, point.y]))));
    if (perimeter < 0 && !finished.length) throw new Error('This negative perimeter removes the entire sticker. Use an inset closer to zero.');
    if (perimeter < 0 && finished.length < grouped.length) state.warnings.push('The inset removed a small artwork group. Review fine details before ordering.');

    state.debugStages.preUnionPaths = rawPaths;
    state.debugStages.groupedPaths = grouped;
    state.debugStages.finalPaths = finished;
    Object.assign(state.processingMetadata, {
      bridgeDistanceInches: bridgeDistance,
      groupingExpansionInches: groupingExpansion,
      groupingMode: elements.grouping?.value || "auto",
      polygonCountBeforeMerge: rawPaths.length,
      polygonCountAfterMerge: grouped.length,
      simplificationToleranceInches: simplifyTolerance,
      perimeterOffsetInches: perimeter
    });

    if (finished.length > MAX_CONTOUR_PATHS) state.warnings.push(`The artwork produced ${finished.length} cut groups; only the ${MAX_CONTOUR_PATHS} largest are included.`);
    const normalized = finished.slice(0, MAX_CONTOUR_PATHS).map((path) => {
      let points = path;
      // Increase geometric simplification only as needed; never decimate by
      // dropping every nth vertex, which creates long chords across details.
      let tolerance = simplifyTolerance;
      while (points.length > MAX_POINTS_PER_PATH) {
        tolerance *= 1.4;
        points = clipper.ramerDouglasPeuckerPathsD([path], tolerance)[0];
      }
      return points.map((point) => [
        Math.max(0.002, Math.min(0.998, point.x / physicalWidth)),
        Math.max(0.002, Math.min(0.998, point.y / physicalHeight))
      ]);
    });
    state.processingMetadata.contourNodeCount = normalized.reduce((total, path) => total + path.length, 0);
    return normalized;
  }

  function rectangleContour(rounded) {
    const { width, height } = dimensions();
    const inset = Math.max(0, -perimeterInches());
    const marginX = 0.012 + inset / width, marginY = 0.012 + inset / height;
    if (marginX >= 0.5 || marginY >= 0.5) throw new Error('This negative perimeter removes the entire sticker. Use an inset closer to zero.');
    const margin = 0.012;
    if (!rounded) return [[marginX, marginY], [1 - marginX, marginY], [1 - marginX, 1 - marginY], [marginX, 1 - marginY]];
    const points = [];
    const radius = 0.09;
    const corners = [
      [1 - margin - radius, margin + radius, -Math.PI / 2, 0],
      [1 - margin - radius, 1 - margin - radius, 0, Math.PI / 2],
      [margin + radius, 1 - margin - radius, Math.PI / 2, Math.PI],
      [margin + radius, margin + radius, Math.PI, Math.PI * 1.5]
    ];
    corners.forEach(([cx, cy, start, end]) => {
      for (let step = 0; step <= 7; step += 1) {
        const angle = start + ((end - start) * step / 7);
        points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
    });
    return points.map(([x, y]) => [marginX + (x - margin) / (1 - 2 * margin) * (1 - 2 * marginX), marginY + (y - margin) / (1 - 2 * margin) * (1 - 2 * marginY)]);
  }

  function ellipseContour() {
    const points = [];
    const { width, height } = dimensions();
    const inset = Math.max(0, -perimeterInches());
    const radiusX = 0.488 - inset / width, radiusY = 0.488 - inset / height;
    if (radiusX <= 0 || radiusY <= 0) throw new Error('This negative perimeter removes the entire sticker. Use an inset closer to zero.');
    for (let index = 0; index < 96; index += 1) {
      const angle = (index / 96) * Math.PI * 2;
      points.push([0.5 + Math.cos(angle) * radiusX, 0.5 + Math.sin(angle) * radiusY]);
    }
    return points;
  }

  async function createContours() {
    const style = selectedValue("cutStyle");
    if (["rectangle", "square", "bumper"].includes(style)) return [rectangleContour(false)];
    if (style === "rounded-rectangle") return [rectangleContour(true)];
    if (["circle", "oval", "circle-oval"].includes(style)) return [ellipseContour()];
    return dieCutContours();
  }

  function canvasPaths(context, paths, width, height, smooth = false) {
    context.beginPath();
    if (smooth) {
      const physical = dimensions();
      for (const path of contourCommands(paths, physical.width, physical.height, { cutStyle: selectedValue('cutStyle'), perimeterInches: perimeterInches(), subjectCategory: state.processingMetadata.subjectCategory })) {
        for (const [op,...p] of path) {
          if (op === 'M') context.moveTo(p[0]*width,p[1]*height);
          else if (op === 'L') context.lineTo(p[0]*width,p[1]*height);
          else if (op === 'C') context.bezierCurveTo(p[0]*width,p[1]*height,p[2]*width,p[3]*height,p[4]*width,p[5]*height);
          else context.closePath();
        }
      }
      return;
    }
    paths.forEach((points) => {
      points.forEach(([x, y], index) => {
        const px = x * width;
        const py = y * height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
    });
  }

  function renderDebugPanel() {
    if (!DEBUG_STICKER || !state.mask) return;
    let panel = document.querySelector("#builder-debug");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "builder-debug";
      panel.className = "builder-debug";
      panel.innerHTML = `<h3>Sticker processing debug</h3><div class="builder-debug-grid"></div>`;
      app.append(panel);
    }
    const grid = panel.querySelector(".builder-debug-grid");
    grid.innerHTML = "";
    const addCanvas = (label, paint) => {
      const figure = document.createElement("figure");
      const canvas = document.createElement("canvas");
      canvas.width = state.maskWidth;
      canvas.height = state.maskHeight;
      paint(canvas.getContext("2d"), canvas);
      const caption = document.createElement("figcaption");
      caption.textContent = label;
      figure.append(canvas, caption);
      grid.append(figure);
    };
    const drawWorkingBounds = (context, canvas) => {
      const padding = state.workingPadding;
      if (!padding) return;
      context.save();
      context.strokeStyle = "#2364e8";
      context.lineWidth = Math.max(1, canvas.width * 0.002);
      context.setLineDash([Math.max(3, canvas.width * 0.006), Math.max(2, canvas.width * 0.004)]);
      context.strokeRect(
        padding.left + 0.5,
        padding.top + 0.5,
        canvas.width - padding.left - padding.right - 1,
        canvas.height - padding.top - padding.bottom - 1
      );
      context.restore();
    };
    const paintMask = (stage) => (context, canvas) => {
      const mask = stage?.data || stage;
      const width = stage?.width || canvas.width;
      const height = stage?.height || canvas.height;
      const offsetX = stage?.offsetX || 0;
      const offsetY = stage?.offsetY || 0;
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) pixels.data[index + 3] = 255;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const destination = (((y + offsetY) * canvas.width) + x + offsetX) * 4;
          const value = stage?.grayscale ? mask[(y * width) + x] : mask[(y * width) + x] ? 255 : 0;
          pixels.data[destination] = value;
          pixels.data[destination + 1] = value;
          pixels.data[destination + 2] = value;
        }
      }
      context.putImageData(pixels, 0, 0);
      drawWorkingBounds(context, canvas);
    };
    addCanvas("Original image in padded working bounds", (context, canvas) => {
      const padding = state.workingPadding;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(state.sourceCanvas, padding.left, padding.top);
      drawWorkingBounds(context, canvas);
    });
    addCanvas("Raw foreground mask", paintMask(state.debugStages.rawMask || state.mask));
    if (state.debugStages.rawMatte) addCanvas("Raw AI confidence matte", paintMask(state.debugStages.rawMatte));
    addCanvas("Padded foreground mask", paintMask(state.debugStages.paddedMask || state.mask));
    if (state.debugStages.appendageSupport) addCanvas("Nearby weak subject edges recovered", paintMask(state.debugStages.appendageSupport));
    if (state.debugStages.subjectCore) {
      addCanvas("Confident subject core", paintMask(state.debugStages.subjectCore));
      addCanvas("Softer edge support", paintMask(state.debugStages.subjectSupport));
      addCanvas("Dominant subject selection", paintMask(state.debugStages.subjectSelection || state.mask));
      addCanvas("Discarded components", paintMask(state.debugStages.discardedComponents || new Uint8Array(state.mask.length)));
      addCanvas("Subject before bridging", paintMask(state.debugStages.preBridgeSubject || state.mask));
      addCanvas("Subject after bridging", paintMask(state.debugStages.postBridgeSubject || state.mask));
    }
    addCanvas("Cleaned mask", paintMask(state.debugStages.cleanedMask || state.mask));
    addCanvas("Thresholded connected components", (context, canvas) => {
      const { labels } = labelComponents(state.debugStages.subjectSupport || state.mask, canvas.width, canvas.height);
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < labels.length; index += 1) {
        const label = labels[index];
        if (!label) continue;
        pixels.data[index * 4] = (label * 83) % 235 + 20;
        pixels.data[(index * 4) + 1] = (label * 151) % 235 + 20;
        pixels.data[(index * 4) + 2] = (label * 211) % 235 + 20;
        pixels.data[(index * 4) + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      drawWorkingBounds(context, canvas);
    });
    const paintPhysicalPaths = (paths, color) => (context, canvas) => {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      (paths || []).forEach((path) => {
        path.forEach((point, index) => {
          const transform = state.artworkTransform;
          const x = (point.x - transform.x) / transform.scale;
          const y = (point.y - transform.y) / transform.scale;
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.closePath();
      });
      context.strokeStyle = color;
      context.lineWidth = Math.max(2, canvas.width * 0.003);
      context.stroke();
      drawWorkingBounds(context, canvas);
    };
    addCanvas("Pre-union polygons", paintPhysicalPaths(state.debugStages.preUnionPaths, "#e57b1e"));
    addCanvas("Merged/grouped polygons", paintPhysicalPaths(state.debugStages.groupedPaths, "#2364e8"));
    addCanvas("Offset polygons", paintPhysicalPaths(state.debugStages.finalPaths, "#ff00d4"));
    addCanvas("Final production contour", (context, canvas) => {
      context.drawImage(state.processedCanvas, 0, 0, canvas.width, canvas.height);
      const physical = dimensions(), transform = state.artworkTransform;
      const rasterPaths = state.contourPaths.map((path) => path.map(([x, y]) => [
        (x * physical.width - transform.x) / transform.scale / canvas.width,
        (y * physical.height - transform.y) / transform.scale / canvas.height
      ]));
      canvasPaths(context, rasterPaths, canvas.width, canvas.height);
      context.strokeStyle = "#ff00d4";
      context.lineWidth = Math.max(2, canvas.width * 0.004);
      context.stroke();
      drawWorkingBounds(context, canvas);
    });
  }

  function renderArtworkInto(context, canvas, paths, showCutline) {
    const borderMode = selectedValue("borderMode");
    context.clearRect(0, 0, canvas.width, canvas.height);
    // JPEG cannot retain alpha. Flatten the ENTIRE production raster before
    // applying a cut-shape clip, otherwise transparent corners encode black.
    if (!showCutline) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.save();
    canvasPaths(context, paths, canvas.width, canvas.height, true);
    // The proof shows the trimmed sticker. Negative-perimeter production art
    // retains the original pixels beyond CutContour as real, printable bleed.
    if (showCutline || perimeterInches() >= 0) context.clip();
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const placement = artworkPlacement();
    const bleedScale = (borderMode === "print-to-edge" ? 1.08 : 1) * placement.zoom;
    const physical = dimensions(), transform = state.artworkTransform;
    const drawWidth = state.maskWidth * transform.scale / physical.width * canvas.width * bleedScale;
    const drawHeight = state.maskHeight * transform.scale / physical.height * canvas.height * bleedScale;
    const drawX = (((transform.x - physical.width / 2) * bleedScale + physical.width / 2) / physical.width + placement.x) * canvas.width;
    const drawY = (((transform.y - physical.height / 2) * bleedScale + physical.height / 2) / physical.height + placement.y) * canvas.height;
    context.drawImage(state.processedCanvas, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    if (showCutline) {
      context.save();
      canvasPaths(context, paths, canvas.width, canvas.height, true);
      context.strokeStyle = "#ff00d4";
      context.lineWidth = Math.max(3, Math.min(canvas.width, canvas.height) * 0.006);
      context.setLineDash([Math.max(7, canvas.width * 0.012), Math.max(5, canvas.width * 0.008)]);
      context.stroke();
      context.restore();
      if (selectedValue('material') === 'holographic') {
        // Work on the complete proof so putting back 8-bit pixels cannot
        // change antialiased alpha through a subsequent contour composite.
        const previewPixels = context.getImageData(0, 0, canvas.width, canvas.height);
        context.putImageData(holographicPreview(previewPixels), 0, 0);
      }
    }
  }

  function outputCanvasSize() {
    const { width, height } = dimensions();
    const ratio = width / height;
    if (ratio >= 1) return { width: config.output.maxRasterSide, height: Math.max(1, Math.round(config.output.maxRasterSide / ratio)) };
    return { width: Math.max(1, Math.round(config.output.maxRasterSide * ratio)), height: config.output.maxRasterSide };
  }

  async function renderProof(generation = ++state.renderGeneration) {
    renderPrice();
    if (!state.sourceImageData) {
      elements.add.disabled = true;
      return;
    }
    const { width, height, quantity } = dimensions();
    if (width < config.sizing.min || height < config.sizing.min || width > config.sizing.max || height > config.sizing.max || !config.quantities.options.includes(quantity)) {
      elements.validation.textContent = `Enter dimensions from ${config.sizing.min} to ${config.sizing.max} inches and choose a supported quantity.`;
      elements.add.disabled = true;
      return;
    }
    elements.validation.textContent = "";
    elements.add.disabled = true;
    elements.proofStatus.textContent = selectedValue("backgroundMode") !== "keep" ? "Removing background…" : "Building proof…";
    await buildProcessedArtwork();
    if (generation !== state.renderGeneration) return;
    updateArtworkTransform();
    // An upload/removal change can change the isolated-art ratio. Settle its
    // physical padding now so saving an unchanged proof cannot shift geometry.
    for (let pass = 0; pass < 3; pass += 1) {
      const expected = workingPaddingFor(state.sourceCanvas.width, state.sourceCanvas.height);
      if (expected.left === state.workingPadding.left && expected.top === state.workingPadding.top) break;
      await buildProcessedArtwork();
      if (generation !== state.renderGeneration) return;
      updateArtworkTransform();
    }
    renderPrice();
    state.contourPaths = await createContours();
    if (generation !== state.renderGeneration) return;
    if (!state.contourPaths.length) state.contourPaths = [rectangleContour(false)];
    const outputSize = outputCanvasSize();
    elements.proofCanvas.width = outputSize.width;
    elements.proofCanvas.height = outputSize.height;
    elements.proofCanvas.style.maxWidth = `${620 * outputSize.width / outputSize.height}px`;
    renderArtworkInto(elements.proofCanvas.getContext("2d"), elements.proofCanvas, state.contourPaths, true);

    state.printCanvas = document.createElement("canvas");
    state.printCanvas.width = outputSize.width;
    state.printCanvas.height = outputSize.height;
    renderArtworkInto(state.printCanvas.getContext("2d"), state.printCanvas, state.contourPaths, false);

    const manualReview = state.confidence < 0.7 || state.warnings.length > 0;
    elements.reviewMessage.hidden = !manualReview;
    elements.reviewMessage.textContent = manualReview
      ? `This artwork may require manual review. ${state.warnings.join(" ") || "The automatic contour has lower confidence than usual."}`
      : "";
    elements.proofPlaceholder.hidden = true;
    const pathLabel = state.contourPaths.length > 1 ? ` · ${state.contourPaths.length} contours` : "";
    elements.proofStatus.textContent = manualReview ? `Review recommended${pathLabel}` : `Proof ready${pathLabel}`;
    elements.proofStatus.classList.toggle("is-ready", !manualReview);
    elements.add.disabled = false;
    if (DEBUG_STICKER) {
      window.__stickonfigDebug = {
        artworkPlacement: artworkPlacement(),
        contourPaths: state.contourPaths.map((path) => path.map((point) => [...point])),
        confidence: state.confidence,
        foregroundFraction: state.mask.reduce((total, value) => total + value, 0) / state.mask.length,
        processing: { ...state.processingMetadata, segmentationEngine: state.segmentationEngine },
        artworkProfile: state.artworkProfile,
        geometry: {
          isolatedArtBounds: { ...state.artworkTransform.bounds },
          isolatedArtAspectRatio: state.aspectRatio,
          workingRaster: { width: state.maskWidth, height: state.maskHeight },
          physical: dimensions(), transform: { ...state.artworkTransform },
          previewCss: { width: elements.proofCanvas.getBoundingClientRect().width, height: elements.proofCanvas.getBoundingClientRect().height },
          contourBounds: {
            minX: Math.min(...state.contourPaths.flat().map(([x]) => x)), maxX: Math.max(...state.contourPaths.flat().map(([x]) => x)),
            minY: Math.min(...state.contourPaths.flat().map(([, y]) => y)), maxY: Math.max(...state.contourPaths.flat().map(([, y]) => y))
          },
          output: { ...outputSize }, generation
        },
        // Read-only diagnostic rasters for local/browser regression tests.
        mask: new Uint8Array(state.mask),
        rawAlpha: state.advancedAlpha ? new Uint8Array(state.advancedAlpha) : null,
        sourceArtBounds: { ...state.sourceArtBounds },
        sourceSize: { width: state.sourceCanvas.width, height: state.sourceCanvas.height },
        processedPixels: state.processedCanvas.getContext("2d").getImageData(0, 0, state.maskWidth, state.maskHeight).data,
        warningFlags: [...state.warnings]
      };
    }
    renderResolution();
    renderDebugPanel();
  }

  function scheduleRender() {
    renderPrice();
    state.renderGeneration += 1;
    // Invalidate the previous ready proof immediately, not on the next frame.
    elements.add.disabled = true;
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    requestAnimationFrame(() => {
      state.renderScheduled = false;
      const generation = state.renderGeneration;
      renderProof(generation).catch((error) => {
        elements.validation.classList.remove("builder-processing");
        elements.validation.textContent = error.message || "The proof could not be generated.";
        elements.proofStatus.textContent = "Review required";
        elements.add.disabled = true;
      });
    });
  }

  async function rasterizePdf(file) {
    let pdfjs;
    try {
      pdfjs = await import(PDF_JS_MODULE);
    } catch {
      throw new Error("The PDF preview engine could not be loaded. Please reload and try again.");
    }
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdfDocument = await loadingTask.promise;
    if (!pdfDocument.numPages) throw new Error("The PDF does not contain a readable page.");
    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, Math.min(4, 1400 / Math.max(baseViewport.width, baseViewport.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    // Preserve unpainted PDF page alpha instead of PDF.js's default white backing.
    // Explicit white artwork still renders white; production backing is separate.
    await page.render({ canvasContext: context, viewport, background: "rgba(0,0,0,0)" }).promise;
    page.cleanup();
    return { source: canvas, pageCount: pdfDocument.numPages, previewUrl: canvas.toDataURL("image/png") };
  }

  async function analyzeFile(file) {
    const uploadGeneration = state.uploadGeneration;
    const extension = extensionFor(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("Choose an SVG, PNG, JPG, JPEG, WEBP, GIF, or PDF file.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`Artwork must be smaller than ${config.upload.maxMegabytes} MB.`);
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = URL.createObjectURL(file);
    const sourceUrl = state.sourceUrl;
    const pdfResult = extension === "pdf" ? await rasterizePdf(file) : null;
    const image = pdfResult?.source || await loadImage(sourceUrl);
    if (uploadGeneration !== state.uploadGeneration) return;
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) throw new Error("The artwork has no readable dimensions.");

    const sourceScale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(naturalWidth, naturalHeight));
    const artWidth = Math.max(32, Math.round(naturalWidth * sourceScale));
    const artHeight = Math.max(32, Math.round(naturalHeight * sourceScale));
    const artCanvas = document.createElement("canvas");
    artCanvas.width = artWidth;
    artCanvas.height = artHeight;
    const artContext = artCanvas.getContext("2d", { willReadFrequently: true });
    artContext.clearRect(0, 0, artWidth, artHeight);
    artContext.drawImage(image, 0, 0, artWidth, artHeight);
    const artImageData = artContext.getImageData(0, 0, artWidth, artHeight);
    const originalTransparency = alphaMask(artImageData).hasTransparency;
    state.artworkProfile = classifyArtwork(artImageData);
    const artAlpha = alphaMask(artImageData);
    const artCoverage = artAlpha.mask.reduce((sum, value) => sum + value, 0) / artAlpha.mask.length;
    if (originalTransparency && artCoverage < 0.95) {
      state.artworkProfile.category = "graphic";
      state.artworkProfile.prior = "source-alpha";
    }
    const padding = Math.max(14, Math.round(Math.max(artWidth, artHeight) * 0.1));
    const canvas = document.createElement("canvas");
    canvas.width = artWidth + (padding * 2);
    canvas.height = artHeight + (padding * 2);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, padding, padding, artWidth, artHeight);

    state.file = file;
    state.image = image;
    state.originalWidth = naturalWidth;
    state.originalHeight = naturalHeight;
    state.aspectRatio = naturalWidth / naturalHeight;
    state.sourceCanvas = canvas;
    state.sourceImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    state.sourceArtBounds = { x: padding, y: padding, width: artWidth, height: artHeight };
    state.hasTransparency = originalTransparency;
    state.backgroundPalette = sampleBackgroundPalette(artImageData);
    state.sourcePageCount = pdfResult?.pageCount || 0;
    state.advancedMask = null;
    state.advancedAlpha = null;
    state.advancedRefinement = "none";
    state.advancedSourceCanvas = null;
    state.debugStages = {};
    if (DEBUG_STICKER) window.__stickonfigDebug = null;

    if (elements.lockRatio.checked) {
      state.dimensionAnchor = "width";
      syncDimensions("width");
    }
    elements.sourcePreview.src = pdfResult?.previewUrl || state.sourceUrl;
    elements.artPreview.hidden = false;
    elements.fileStatus.textContent = "Artwork loaded";
    elements.fileStatus.classList.add("is-ready");
    elements.fileDetails.innerHTML = `
      <dt>File</dt><dd>${escapeHtml(file.name)}</dd>
      <dt>Type</dt><dd>${extension.toUpperCase()}</dd>
      <dt>${extension === "pdf" ? "Rendered pixels" : "Pixels"}</dt><dd>${naturalWidth} × ${naturalHeight}</dd>
      ${extension === "pdf" ? `<dt>Pages</dt><dd>${state.sourcePageCount} (page 1 used)</dd>` : ""}
      <dt>Size</dt><dd>${formatBytes(file.size)}</dd>
      <dt>Transparency</dt><dd>${originalTransparency ? "Detected" : "Not detected"}</dd>
    `;
    elements.validation.textContent = "";
    await renderProof();
  }

  async function handleFile(file) {
    if (!file) return;
    resetBuilder();
    const uploadGeneration = state.uploadGeneration;
    elements.fileStatus.textContent = "Analyzing…";
    elements.fileStatus.classList.remove("is-ready");
    elements.proofStatus.textContent = "Building proof…";
    elements.validation.textContent = "";
    elements.add.disabled = true;
    try {
      await analyzeFile(file);
    } catch (error) {
      if (uploadGeneration !== state.uploadGeneration) return;
      elements.validation.textContent = error.message || "The artwork could not be processed.";
      elements.fileStatus.textContent = "File rejected";
      elements.proofStatus.textContent = "Waiting for artwork";
    }
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("A production image could not be generated.")), type, quality);
    });
  }

  function maskCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = state.maskWidth;
    canvas.height = state.maskHeight;
    const context = canvas.getContext("2d");
    const imageData = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < state.mask.length; index += 1) {
      if (!state.mask[index]) continue;
      const offset = index * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  async function submitJob(event) {
    event.preventDefault();
    if (submitPending) return;
    submitPending = true;
    try {
      if (!state.file || !state.printCanvas || !state.contourPaths.some((points) => points.length >= 3)) {
        elements.validation.textContent = "Upload artwork and review the proof before generating files.";
        return;
      }
      try { await renderProof(); } catch (error) {
        elements.validation.textContent = error.message || 'The proof could not be generated.';
        elements.add.disabled = true;
        return;
      }
      const { width, height, quantity } = dimensions();
      if (!elements.form.checkValidity() || width < config.sizing.min || height < config.sizing.min || !config.quantities.options.includes(quantity)) {
        elements.form.reportValidity();
        return;
      }

      const resolution = stickerResolution(resolutionInput());
      let resolutionAccepted = false;
      if (resolution.requiresWarning && !control('enhance').checked) {
        const generation = state.renderGeneration, upload = state.uploadGeneration;
        const choice = await confirmLowResolution(resolution);
        if (generation !== state.renderGeneration || upload !== state.uploadGeneration) return;
        if (choice === 'enhance') { control('enhance').checked = true; renderPrice(); renderResolution(); }
        else if (choice === 'continue') resolutionAccepted = true;
        else return;
      }
      elements.add.disabled = true;
      elements.add.textContent = "Generating production package…";
      app.inert = true;
      elements.validation.textContent = "Creating the proof, mask, contour, and CutContour production PDF…";
      try {
        const [printImage, proof, mask] = await Promise.all([
          canvasBlob(state.printCanvas, "image/jpeg", 0.96),
          canvasBlob(elements.proofCanvas, "image/png"),
          canvasBlob(maskCanvas(), "image/png")
        ]);
        const backgroundMode = selectedValue("backgroundMode");
        const cutStyle = selectedValue("cutStyle");
        const perimeterMode = selectedValue("perimeterMode");
        const borderMode = selectedValue("borderMode");
        const manualReviewRecommended = state.confidence < 0.7 || state.warnings.length > 0;
        const manifest = {
          originalFilename: state.file.name,
          detectedFileType: extensionFor(state.file.name),
          originalPixelWidth: state.originalWidth,
          originalPixelHeight: state.originalHeight,
          renderWidth: state.printCanvas.width,
          renderHeight: state.printCanvas.height,
          width,
          height,
          quantity,
          sizeMode: state.sizeMode,
          standardSize: state.standardSize,
          matteLaminate: control('laminate').checked,
          material: selectedValue('material'),
          enhanceResolution: control('enhance').checked,
          resolutionAccepted,
          resolutionInput: { version: 1, placedWidth: resolutionInput().placedWidth, placedHeight: resolutionInput().placedHeight },
          artworkGuidelinesAcknowledged: control('guidelines-ack').checked,
          artworkPlacement: artworkPlacement(),
          maintainAspectRatio: elements.lockRatio.checked,
          cutStyle,
          backgroundMode,
          perimeterMode,
          perimeterInches: perimeterInches(),
          borderMode,
          confidence: state.confidence,
          manualReviewRecommended,
          warningFlags: state.warnings,
          processing: {
            ...state.processingMetadata,
            backgroundRemovalMode: backgroundMode,
            segmentationEngine: state.segmentationEngine
          },
          contour: { curveVersion: 3, paths: state.contourPaths, points: state.contourPaths[0] }
        };
        const job = await createJob(manifest, { original: state.file, printImage, proof, mask });
        await deliverJob(job);
        app.dispatchEvent(new CustomEvent('stickonfig:submitted', { bubbles: true, detail: job }));
        elements.validation.textContent = 'Production package ready. Review all files with your print shop before printing.';
        elements.add.disabled = false;
        elements.add.textContent = config.submission.buttonLabel;
      } catch (error) {
        elements.validation.textContent = error.message || "The Stickonfig job could not be generated.";
        elements.add.disabled = false;
        elements.add.textContent = config.submission.buttonLabel;
        if (/access has expired/i.test(elements.validation.textContent)) {
          window.setTimeout(() => window.location.reload(), 1200);
        }
      }
    } finally { submitPending = false; app.inert = false; }
  }

  function resetBuilder() {
    clearDownloads();
    if (control('resolution-dialog').open) control('resolution-dialog').close('cancel');
    control('resolution').hidden = true;
    state.renderGeneration += 1;
    state.uploadGeneration += 1;
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    Object.assign(state, {
      file: null,
      sourceUrl: "",
      image: null,
      originalWidth: 0,
      originalHeight: 0,
      sourceCanvas: null,
      sourceImageData: null,
      processedCanvas: null,
      mask: null,
      maskWidth: 0,
      maskHeight: 0,
      workingPadding: null,
      contourPaths: [],
      sourcePageCount: 0,
      printCanvas: null,
      warnings: [],
      confidence: 0,
      advancedMask: null,
      advancedAlpha: null,
      advancedRefinement: "none",
      advancedSourceCanvas: null,
      artworkProfile: null,
      sourceArtBounds: null,
      dimensionAnchor: "width",
      artworkTransform: null,
      segmentationEngine: "none",
      processingMetadata: {},
      debugStages: {}
    });
    elements.form.reset();
    state.sizeMode = 'standard'; state.standardSize = config.sizing.defaultSize; state.aspectRatio = 1;
    const initialSize = stickerSizes(selectedValue('cutStyle')).find(size => size.key === state.standardSize) || stickerSizes(selectedValue('cutStyle'))[0];
    state.standardSize = initialSize.key; elements.width.value = initialSize.width; elements.height.value = initialSize.height; elements.quantity.value = config.quantities.default;
    state.placement = { zoom: 1, x: 0, y: 0 };
    control('preview-zoom').textContent = '100%';
    renderSizeChoices();
    elements.file.value = "";
    elements.artPreview.hidden = true;
    elements.sourcePreview.removeAttribute("src");
    elements.fileStatus.textContent = "No file";
    elements.fileStatus.classList.remove("is-ready");
    elements.proofStatus.textContent = "Waiting for artwork";
    elements.proofStatus.classList.remove("is-ready");
    elements.proofPlaceholder.hidden = false;
    elements.reviewMessage.hidden = true;
    elements.validation.textContent = "";
    elements.validation.classList.remove('builder-processing');
    elements.add.disabled = true;
    elements.add.textContent = config.submission.buttonLabel;
    elements.customOffset.hidden = true;
    elements.proofCanvas.getContext("2d").clearRect(0, 0, elements.proofCanvas.width, elements.proofCanvas.height);
    if (DEBUG_STICKER) window.__stickonfigDebug = null;
    renderPrice();
  }

  elements.file.addEventListener("change", () => handleFile(elements.file.files?.[0]));
  ["dragenter", "dragover"].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  }));
  elements.dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer?.files?.[0]));

  elements.form.addEventListener("change", (event) => {
    if (event.target.name === 'material') { renderPrice(); redrawPlacement(); return; }
    if (['builder-guidelines-ack', 'builder-laminate', 'builder-enhance'].includes(event.target.id)) { renderPrice(); renderResolution(); return; }
    // Number edits already render on input. Re-rendering again on blur would
    // disable Add to Cart between its pointer-down and click events.
    if (event.target.matches('input[type="number"]')) return;
    if (event.target.name === 'cutStyle') {
      state.placement = { zoom: 1, x: 0, y: 0 };
      control('preview-zoom').textContent = '100%';
      elements.lockRatio.checked = ['die-cut', 'circle', 'square'].includes(event.target.value);
      if (state.sizeMode === 'standard') {
        const size = stickerSizes(event.target.value)[0];
        state.standardSize = size.key; elements.width.value = size.width; elements.height.value = size.height;
      }
      else {
        // Freeform frame shapes start unlocked; artwork itself is never stretched.
        syncDimensions();
        if (event.target.value === 'oval' && elements.width.value === elements.height.value) elements.height.value = formatDimension(Math.max(0.25, +elements.width.value * 2 / 3));
      }
      renderSizeChoices();
    }
    if (event.target.name === "perimeterMode") elements.customOffset.hidden = event.target.value !== "custom";
    if (event.target === elements.lockRatio) syncDimensions();
    scheduleRender();
  });
  elements.form.addEventListener("input", (event) => {
    if (event.target.name === 'material') return;
    if (['builder-guidelines-ack', 'builder-laminate', 'builder-enhance'].includes(event.target.id)) return;
    if (event.target === elements.width) syncDimensions("width");
    if (event.target === elements.height) syncDimensions("height");
    scheduleRender();
  });
  control('size-tiles').addEventListener('click', (event) => {
    const button = event.target.closest('[data-builder-size]');
    if (button) chooseSize(stickerSizes(selectedValue('cutStyle')).find((size) => size.key === button.dataset.builderSize));
  });
  control('custom-size').addEventListener('click', () => {
    state.sizeMode = 'custom'; syncDimensions(); renderPrice(); scheduleRender();
  });
  document.querySelectorAll('[data-builder-quantity]').forEach((button) => button.addEventListener('click', () => {
    elements.quantity.value = button.dataset.builderQuantity; renderPrice();
  }));
  document.querySelectorAll('[data-perimeter-step]').forEach((button) => button.addEventListener('click', () => {
    elements.perimeter.value = formatDimension(Math.max(-1, Math.min(1, (+elements.perimeter.value || 0) + +button.dataset.perimeterStep * 0.01)));
    scheduleRender();
  }));
  control('preview-center').addEventListener('click', () => {
    state.placement = { zoom: 1, x: 0, y: 0 }; redrawPlacement();
  });
  document.querySelectorAll('[data-preview-zoom]').forEach((button) => button.addEventListener('click', () => {
    state.placement.zoom = Math.round(Math.max(0.25, Math.min(4, state.placement.zoom + +button.dataset.previewZoom * 0.05)) * 100) / 100;
    redrawPlacement();
  }));
  let drag;
  elements.proofCanvas.addEventListener('pointerdown', (event) => {
    if (control('preview-toolbar').hidden || !state.printCanvas || event.button !== 0) return;
    const rect = elements.proofCanvas.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, px: state.placement.x, py: state.placement.y, width: rect.width, height: rect.height };
    elements.proofCanvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  elements.proofCanvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    state.placement.x = Math.round(Math.max(-0.75, Math.min(0.75, drag.px + (event.clientX - drag.x) / drag.width)) * 100) / 100;
    state.placement.y = Math.round(Math.max(-0.75, Math.min(0.75, drag.py + (event.clientY - drag.y) / drag.height)) * 100) / 100;
    redrawPlacement();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => elements.proofCanvas.addEventListener(type, () => { drag = null; }));
  elements.form.querySelectorAll("[data-size-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const dimension = button.dataset.dimension;
      const input = elements[dimension];
      const current = Number(input.value) || 0.25;
      input.value = formatDimension(Math.max(config.sizing.min, Math.min(config.sizing.max, current + Number(button.dataset.sizeStep) * 0.25)));
      syncDimensions(dimension);
      scheduleRender();
    });
  });
  elements.form.addEventListener("submit", submitJob);
  elements.reset.addEventListener("click", resetBuilder);
  window.addEventListener("beforeunload", () => { if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl); });

  resetBuilder();
})();
