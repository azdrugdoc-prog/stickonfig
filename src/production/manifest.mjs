import config from '../config/index.mjs';
import { stickerSizes } from '../adapters/pricing/example.mjs';
import { stickerResolution } from '../core/dpi/index.mjs';
import { contourCommands } from '../core/contour/index.mjs';
const safeFilename = value => String(value).replace(/[^a-z0-9._-]/gi,'_').slice(0,160);
function normalizeStickerContour(rawPoints) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 3 || rawPoints.length > 800) {
    throw new Error( "A valid sticker contour is required.");
  }
  return rawPoints.map((point) => {
    if (!Array.isArray(point) || point.length < 2) throw new Error( "Sticker contour data is invalid.");
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error( "Sticker contour points must be normalized between 0 and 1.");
    }
    return [x, y];
  });
}

function normalizeStickerContours(rawContour) {
  const rawPaths = Array.isArray(rawContour?.paths) && rawContour.paths.length
    ? rawContour.paths
    : [rawContour?.points];
  if (rawPaths.length > 16) throw new Error( "Sticker jobs may contain no more than 16 contour paths.");
  const paths = rawPaths.map((path) => normalizeStickerContour(path));
  const totalPoints = paths.reduce((total, path) => total + path.length, 0);
  if (totalPoints > 8000) throw new Error( "Sticker contour data is too detailed.");
  return paths;
}

export function normalizeStickerBuilderManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    throw new Error( "Sticker job configuration is required.");
  }

  const width = Number(rawManifest.width);
  const height = Number(rawManifest.height);
  const quantity = Math.round(Number(rawManifest.quantity));
  const renderWidth = Math.round(Number(rawManifest.renderWidth));
  const renderHeight = Math.round(Number(rawManifest.renderHeight));
  if (!Number.isFinite(width) || width < config.sizing.min || width > config.sizing.max) throw new Error(`Sticker width must be between ${config.sizing.min} and ${config.sizing.max} inches.`);
  if (!Number.isFinite(height) || height < config.sizing.min || height > config.sizing.max) throw new Error(`Sticker height must be between ${config.sizing.min} and ${config.sizing.max} inches.`);
  if (!Number.isFinite(quantity) || !config.quantities.options.includes(quantity)) throw new Error( "Sticker quantity must be between 1 and 5,000.");
  if (!Number.isFinite(renderWidth) || !Number.isFinite(renderHeight) || renderWidth < 5 || renderHeight < 5 || renderWidth > config.output.maxRasterSide || renderHeight > config.output.maxRasterSide) {
    throw new Error( "Sticker render dimensions are invalid.");
  }

  const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const material = rawManifest.material ?? 'vinyl';
  if (!['vinyl', 'holographic'].includes(material)) throw new Error( 'Choose a supported sticker material.');
  if (material === 'holographic' && !config.products.holographicEnabled) throw new Error('Holographic is not offered.');
  if (rawManifest.matteLaminate === true && !config.products.laminateEnabled) throw new Error('Lamination is not offered.');
  if (rawManifest.enhanceResolution === true && !config.products.enhancementEnabled) throw new Error('Manual enhancement is not offered.');
  const cutStyle = enumValue(rawManifest.cutStyle, ["die-cut", "rectangle", "square", "bumper", "rounded-rectangle", "circle", "oval", "circle-oval"], "die-cut");
  if (["circle", "square"].includes(cutStyle) && width !== height) throw new Error( "Circle and square stickers require equal width and height.");
  const sizeMode = rawManifest.sizeMode === 'standard' ? 'standard' : 'custom';
  const standardSize = String(rawManifest.standardSize || '').slice(0, 16);
  if (sizeMode === 'standard' && !stickerSizes(cutStyle).some((size) => size.key === standardSize && size.width === width && size.height === height)) {
    throw new Error( "The selected standard size does not match the sticker dimensions.");
  }
  const backgroundMode = enumValue(rawManifest.backgroundMode, ["keep", "remove", "advanced"], "keep");
  const perimeterMode = enumValue(rawManifest.perimeterMode, ["tight", "standard", "wide", "custom"], "standard");
  const borderMode = enumValue(rawManifest.borderMode, ["white-border", "print-to-edge"], "white-border");
  const perimeterInches = Number(rawManifest.perimeterInches);
  if (!Number.isFinite(perimeterInches) || perimeterInches < -1 || perimeterInches > 1) {
    throw new Error( "Sticker perimeter must be between -1 and 1 inch.");
  }

  const contourPaths = normalizeStickerContours(rawManifest?.contour);
  const rawProcessing = rawManifest.processing && typeof rawManifest.processing === "object" && !Array.isArray(rawManifest.processing)
    ? rawManifest.processing
    : {};
  const finiteMetric = (value, minimum, maximum, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  };
  const enhanceResolution = config.products.enhancementEnabled && rawManifest.enhanceResolution === true;
  const resolutionAccepted = rawManifest.resolutionAccepted === true;
  const resolutionInput = rawManifest.resolutionInput?.version === 1 ? {
    version: 1,
    placedWidth: Number(rawManifest.resolutionInput.placedWidth),
    placedHeight: Number(rawManifest.resolutionInput.placedHeight)
  } : null;
  if (resolutionInput && ![resolutionInput.placedWidth, resolutionInput.placedHeight].every(value => Number.isFinite(value) && value > 0 && value <= 100000)) {
    throw new Error( 'Artwork resolution dimensions are invalid.');
  }
  const resolution = stickerResolution({ type: rawManifest.detectedFileType,
    pixelWidth: Number(rawManifest.originalPixelWidth), pixelHeight: Number(rawManifest.originalPixelHeight),
    placedWidth: resolutionInput?.placedWidth, placedHeight: resolutionInput?.placedHeight });
  if (resolution.requiresWarning && !enhanceResolution && !resolutionAccepted) {
    throw new Error( 'Confirm the low-resolution warning or request image enhancement before continuing.');
  }
  const resolutionWarnings = enhanceResolution ? ['Manual image enhancement requested: the receiving shop must arrange this service before printing.']
    : resolution.requiresWarning ? [`Customer accepted ${Math.floor(resolution.effectiveDpi)} DPI artwork as-is (${config.dpi.recommended} DPI recommended).`]
    : resolutionInput && resolution.status === 'unverified' ? ['PDF/SVG embedded-image resolution needs production review.'] : [];
  const processing = {
    backgroundRemovalMode: enumValue(rawProcessing.backgroundRemovalMode, ["keep", "remove", "advanced"], backgroundMode),
    segmentationEngine: String(rawProcessing.segmentationEngine || "none").replace(/[^a-z0-9._-]/gi, "").slice(0, 80) || "none",
    segmentationRefinement: String(rawProcessing.segmentationRefinement || "none").replace(/[^a-z0-9._-]/gi, "").slice(0, 80) || "none",
    subjectCategory: enumValue(rawProcessing.subjectCategory, ["graphic", "photographic-subject"], "graphic"),
    subjectPrior: enumValue(rawProcessing.subjectPrior, ["source-alpha", "multiple-artwork-elements", "semantic-core-and-centrality"], "source-alpha"),
    subjectCleanupApplied: rawProcessing.subjectCleanupApplied === true,
    fallbackRemovalUsed: rawProcessing.fallbackRemovalUsed === true,
    subjectSelection: enumValue(rawProcessing.subjectSelection, ["confident-core-centrality", "uncertain"], "uncertain"),
    subjectCount: Math.round(finiteMetric(rawProcessing.subjectCount, 0, 100)),
    subjectCoreThreshold: finiteMetric(rawProcessing.subjectCoreThreshold, 0, 1),
    subjectSupportThreshold: finiteMetric(rawProcessing.subjectSupportThreshold, 0, 1),
    subjectBridgePixels: Math.round(finiteMetric(rawProcessing.subjectBridgePixels, 0, 32)),
    subjectRetainedFraction: finiteMetric(rawProcessing.subjectRetainedFraction, 0, 1),
    appendageSupportRadius: Math.round(finiteMetric(rawProcessing.appendageSupportRadius, 0, 20)),
    appendageRecoveredPixels: Math.round(finiteMetric(rawProcessing.appendageRecoveredPixels, 0, 1000000)),
    appendageRecoveryRejected: rawProcessing.appendageRecoveryRejected === true,
    maskThreshold: finiteMetric(rawProcessing.maskThreshold, 0, 1, 0.5),
    componentCountBeforeFiltering: Math.round(finiteMetric(rawProcessing.componentCountBeforeFiltering, 0, 10000)),
    componentCountAfterFiltering: Math.round(finiteMetric(rawProcessing.componentCountAfterFiltering, 0, 10000)),
    groupingMode: enumValue(rawProcessing.groupingMode, ["tight", "auto", "more"], "auto"),
    bridgeDistanceInches: finiteMetric(rawProcessing.bridgeDistanceInches, 0, 2),
    groupingExpansionInches: finiteMetric(rawProcessing.groupingExpansionInches, 0, 1),
    polygonCountBeforeMerge: Math.round(finiteMetric(rawProcessing.polygonCountBeforeMerge, 0, 10000)),
    polygonCountAfterMerge: Math.round(finiteMetric(rawProcessing.polygonCountAfterMerge, 0, 10000)),
    contourNodeCount: Math.round(finiteMetric(rawProcessing.contourNodeCount, 0, 8000)),
    simplificationToleranceInches: finiteMetric(rawProcessing.simplificationToleranceInches, 0, 1),
    perimeterOffsetInches: finiteMetric(rawProcessing.perimeterOffsetInches, -1, 1, perimeterInches),
    workingPaddingPixels: {
      left: Math.round(finiteMetric(rawProcessing.workingPaddingPixels?.left, 0, 2400)),
      right: Math.round(finiteMetric(rawProcessing.workingPaddingPixels?.right, 0, 2400)),
      top: Math.round(finiteMetric(rawProcessing.workingPaddingPixels?.top, 0, 2400)),
      bottom: Math.round(finiteMetric(rawProcessing.workingPaddingPixels?.bottom, 0, 2400))
    },
    workingRaster: {
      width: Math.round(finiteMetric(rawProcessing.workingRaster?.width, 0, 4800)),
      height: Math.round(finiteMetric(rawProcessing.workingRaster?.height, 0, 4800))
    }
  };
  return {
    version: 1,
    originalFilename: safeFilename(rawManifest.originalFilename || "artwork"),
    detectedFileType: String(rawManifest.detectedFileType || "").slice(0, 40),
    originalPixelWidth: Math.max(0, Math.round(Number(rawManifest.originalPixelWidth) || 0)),
    originalPixelHeight: Math.max(0, Math.round(Number(rawManifest.originalPixelHeight) || 0)),
    renderWidth,
    renderHeight,
    width,
    height,
    quantity,
    sizeMode,
    standardSize: sizeMode === 'standard' ? standardSize : '',
    matteLaminate: rawManifest.matteLaminate === true,
    material,
    enhanceResolution,
    resolutionAccepted: resolution.requiresWarning && !enhanceResolution && resolutionAccepted,
    resolutionInput,
    resolution,
    artworkGuidelinesAcknowledged: rawManifest.artworkGuidelinesAcknowledged === true,
    artworkPlacement: cutStyle === 'die-cut' ? { zoom: 1, x: 0, y: 0 } : {
      zoom: finiteMetric(rawManifest.artworkPlacement?.zoom, 0.25, 4, 1),
      x: finiteMetric(rawManifest.artworkPlacement?.x, -0.75, 0.75),
      y: finiteMetric(rawManifest.artworkPlacement?.y, -0.75, 0.75)
    },
    maintainAspectRatio: rawManifest.maintainAspectRatio !== false,
    cutStyle,
    backgroundMode,
    perimeterMode,
    perimeterInches,
    borderMode,
    confidence: Math.max(0, Math.min(1, Number(rawManifest.confidence) || 0)),
    manualReviewRecommended: Boolean(rawManifest.manualReviewRecommended) || resolutionWarnings.length > 0 || material === 'holographic',
    warningFlags: [...(material === 'holographic' ? ['Holographic film: verify material and white-area treatment before printing. Foil appearance is proof-only.'] : []), ...resolutionWarnings, ...(Array.isArray(rawManifest.warningFlags)
      ? rawManifest.warningFlags.slice(0, 12).map((value) => String(value).slice(0, 180))
      : [])],
    processing,
    contour: {
      curveVersion: [1,2,3].includes(rawManifest.contour?.curveVersion) ? rawManifest.contour.curveVersion : 0,
      commands: contourCommands(contourPaths, width, height, { cutStyle, perimeterInches, processing, curveVersion: [1,2,3].includes(rawManifest.contour?.curveVersion) ? rawManifest.contour.curveVersion : 0 }),
      coordinateSpace: "normalized-top-left",
      closed: true,
      spotColorName: "CutContour",
      paths: contourPaths,
      points: contourPaths[0]
    }
  };
}
