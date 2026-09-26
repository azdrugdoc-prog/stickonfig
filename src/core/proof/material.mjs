// A visual approximation only. Never apply this to production print pixels.
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const colors = [[177,225,250],[221,179,243],[251,204,221],[250,231,176],[172,236,213],[180,212,250]];
export function holographicPreview(imageData) {
  const { data, width, height } = imageData;
  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) continue; // Preserve checkerboard/outside-cut transparency.
      const low = Math.min(data[i], data[i + 1], data[i + 2]);
      const high = Math.max(data[i], data[i + 1], data[i + 2]);
      const weight = smooth((low - 205) / 45) * (1 - smooth((high - low - 12) / 34));
      if (weight <= 0) continue; // Dark ink and saturated artwork stay untouched.
      const nx = x / Math.max(1, width - 1);
      const wave = nx * 1.35 + ny * .9 + .21 * Math.sin(ny * 12 + nx * 5) + .12 * Math.sin(nx * 15 - ny * 7);
      const phase = ((wave % 1 + 1) % 1) * colors.length;
      const a = colors[Math.floor(phase)], b = colors[(Math.floor(phase) + 1) % colors.length];
      const mix = smooth(phase % 1);
      const sheen = .12 + .22 * Math.pow((Math.sin(nx * 13 - ny * 9) + 1) / 2, 6);
      for (let channel = 0; channel < 3; channel++) {
        const tint = a[channel] * (1 - mix) + b[channel] * mix;
        const foil = tint + (255 - tint) * sheen;
        data[i + channel] = Math.round(data[i + channel] * (1 - weight) + foil * weight);
      }
    }
  }
  return imageData;
}
