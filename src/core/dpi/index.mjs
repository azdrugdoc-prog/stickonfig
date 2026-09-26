// Source-art resolution, not the upsampled preview's pixel count.
import config from '../../config/index.mjs';
export const RECOMMENDED_DPI = config.dpi.recommended;

export function stickerResolution({ type, pixelWidth, pixelHeight, placedWidth, placedHeight }) {
  const recommendedDpi = RECOMMENDED_DPI;
  const raster = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(String(type).toLowerCase());
  if (!raster || ![pixelWidth, pixelHeight, placedWidth, placedHeight].every(n => Number.isFinite(n) && n > 0)) {
    return { recommendedDpi, effectiveDpi: null, status: 'unverified', belowRecommended: false, requiresWarning: false };
  }
  const dpiX = pixelWidth / placedWidth, dpiY = pixelHeight / placedHeight;
  const effectiveDpi = Math.min(dpiX, dpiY);
  return { recommendedDpi, dpiX, dpiY, effectiveDpi,
    status: effectiveDpi < config.dpi.poor ? 'poor' : effectiveDpi < config.dpi.warning ? 'low' : effectiveDpi < recommendedDpi ? 'acceptable' : 'good',
    belowRecommended: effectiveDpi < recommendedDpi, requiresWarning: effectiveDpi < config.dpi.warning };
}
