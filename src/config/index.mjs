import config from '../../stickonfig.config.mjs';
// Fail early rather than silently creating incorrect physical output.
if (!(config.sizing.min > 0 && config.sizing.max >= config.sizing.min)) throw Error('Invalid sizing limits');
if (!(config.dpi.recommended >= config.dpi.warning && config.dpi.warning >= config.dpi.poor && config.dpi.poor > 0)) throw Error('Invalid DPI tiers');
if (!config.quantities.options.includes(config.quantities.default) || !config.quantities.options.every(n=>Number.isInteger(n)&&n>0&&n<=5000)) throw Error('Invalid quantity options');
if (!['vinyl','holographic'].includes(config.products.defaultMaterial) || (!config.products.holographicEnabled && config.products.defaultMaterial==='holographic')) throw Error('Invalid default material');
if (!(config.output.maxRasterSide >= 300 && config.output.maxRasterSide <= 2400)) throw Error('Output raster cap must be 300–2400 pixels');
if (!(config.processing.analysisMaxSide >= 320 && config.processing.analysisMaxSide <= 1200)) throw Error('Analysis raster cap must be 320–1200 pixels');
if (!(config.upload.maxMegabytes > 0 && config.upload.maxMegabytes <= 48)) throw Error('Upload limit must be 1–48 MB');
if (!['download','rest','webhook','callback'].includes(config.submission.mode)) throw Error('Unknown submission mode');
export default config;
