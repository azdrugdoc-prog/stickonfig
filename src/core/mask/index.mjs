import { labelComponents } from '../geometry/raster.mjs';
export function colorDistance(data, offset, color) {
  const red = data[offset] - color[0];
  const green = data[offset + 1] - color[1];
  const blue = data[offset + 2] - color[2];
  return Math.sqrt((red * red) + (green * green) + (blue * blue));
}

export function sampleBackgroundPalette(imageData) {
  const { data, width, height } = imageData;
  const samples = [];
  const step = Math.max(1, Math.round((width + height) / 96));
  const add = (x, y) => {
    const offset = ((y * width) + x) * 4;
    if (data[offset + 3] >= 20) samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  for (let x = 0; x < width; x += step) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = step; y < height - 1; y += step) {
    add(0, y);
    add(width - 1, y);
  }

  const clusters = [];
  for (const sample of samples) {
    let match = clusters.find((cluster) => Math.hypot(
      sample[0] - cluster.color[0],
      sample[1] - cluster.color[1],
      sample[2] - cluster.color[2]
    ) < 34);
    if (!match && clusters.length < 8) {
      match = { color: sample.slice(), count: 0 };
      clusters.push(match);
    }
    if (!match) continue;
    match.count += 1;
    match.color = match.color.map((value, channel) => value + ((sample[channel] - value) / match.count));
  }
  const palette = clusters.sort((a, b) => b.count - a.count).map((cluster) => cluster.color).slice(0, 6);
  return palette.length ? palette : [[255, 255, 255]];
}

export function alphaMask(imageData) {
  const mask = new Uint8Array(imageData.width * imageData.height);
  let transparentPixels = 0;
  for (let index = 0; index < mask.length; index += 1) {
    const alpha = imageData.data[(index * 4) + 3];
    mask[index] = alpha > 20 ? 1 : 0;
    if (alpha < 245) transparentPixels += 1;
  }
  return { mask, hasTransparency: transparentPixels > mask.length * 0.002 };
}

// Classify processing needs, not identity/species. Flat artwork is the only
// content allowed to use color-based refinement of the semantic matte.
export function classifyArtwork(imageData) {
  const { data, width, height } = imageData;
  const histogram = new Map();
  let samples = 0;
  let flat = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = ((y * width) + x) * 4;
      if (data[index + 3] < 245) continue;
      const key = ((data[index] >> 4) * 256) + ((data[index + 1] >> 4) * 16) + (data[index + 2] >> 4);
      histogram.set(key, (histogram.get(key) || 0) + 1);
      samples += 1;
      let difference = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        difference += Math.abs(data[index + channel] - data[index + 4 + channel]);
        difference += Math.abs(data[index + channel] - data[index + (width * 4) + channel]);
      }
      if (difference <= 6) flat += 1;
    }
  }
  const flatFraction = flat / Math.max(1, samples);
  const dominantColorFraction = Math.max(0, ...histogram.values()) / Math.max(1, samples);
  const isGraphic = flatFraction >= 0.78 && dominantColorFraction >= 0.45;
  return {
    category: isGraphic ? "graphic" : "photographic-subject",
    flatFraction, dominantColorFraction,
    prior: isGraphic ? "multiple-artwork-elements" : "semantic-core-and-centrality"
  };
}

export function edgeBackgroundMask(imageData, advanced, sampledBackground) {
  const { width, height, data } = imageData;
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const palette = Array.isArray(sampledBackground?.[0]) ? sampledBackground : sampleBackgroundPalette(imageData);
  const tolerance = advanced ? 72 : 46;
  let head = 0;
  let tail = 0;

  const enqueue = (index) => {
    if (background[index]) return;
    const paletteDistance = Math.min(...palette.map((color) => colorDistance(data, index * 4, color)));
    if (data[(index * 4) + 3] < 20 || paletteDistance <= tolerance) {
      background[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < width) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - width);
    if (y + 1 < height) neighbors.push(index + width);
    for (const neighbor of neighbors) {
      if (background[neighbor]) continue;
      const offset = neighbor * 4;
      const distance = Math.min(...palette.map((color) => colorDistance(data, offset, color)));
      if (data[offset + 3] < 20 || distance <= tolerance) {
        background[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
  }

  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) mask[index] = background[index] ? 0 : 1;
  return mask;
}

export function dilate(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      if (mask[index]) {
        output[index] = 1;
        if (x > 0) output[index - 1] = 1;
        if (x + 1 < width) output[index + 1] = 1;
        if (y > 0) output[index - width] = 1;
        if (y + 1 < height) output[index + width] = 1;
      }
    }
  }
  return output;
}

export function erode(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      output[index] = mask[index] && mask[index - 1] && mask[index + 1] && mask[index - width] && mask[index + width] ? 1 : 0;
    }
  }
  return output;
}

export function removeTinyIslands(mask, width, height, minimumSize) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  minimumSize = Math.max(8, Math.round(minimumSize || mask.length * 0.00022));
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      for (const neighbor of neighbors) {
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (tail < minimumSize) {
      for (let index = 0; index < tail; index += 1) mask[queue[index]] = 0;
    }
  }
  return mask;
}

export function fillTinyHoles(mask, width, height, maximumSize) {
  const inverse = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) inverse[index] = mask[index] ? 0 : 1;
  const { labels, components } = labelComponents(inverse, width, height);
  const fillLabels = new Set();
  for (const component of components) {
    const touchesEdge = component.minX === 0 || component.minY === 0 || component.maxX === width - 1 || component.maxY === height - 1;
    if (touchesEdge || component.size > maximumSize) continue;
    fillLabels.add(component.label);
  }
  for (let index = 0; index < labels.length; index += 1) if (fillLabels.has(labels[index])) mask[index] = 1;
  return mask;
}

export function cleanupSubjectMatte(alpha, width, height, sourceData = null, padding = null) {
  // Hysteresis: low-confidence edges survive only with a confident core.
  // This is deliberately independent of skin/fur/clothing color and grouping UI.
  const support = Uint8Array.from(alpha, (value) => value >= 64 ? 1 : 0);
  const core = Uint8Array.from(alpha, (value) => value >= 168 ? 1 : 0);
  const initial = labelComponents(support, width, height);
  const cores = new Map();
  for (let i = 0; i < core.length; i += 1) {
    if (core[i] && initial.labels[i]) cores.set(initial.labels[i], (cores.get(initial.labels[i]) || 0) + 1);
  }
  const ranked = initial.components.map((component) => {
    const centerX = (component.minX + component.maxX) / (2 * width);
    const centerY = (component.minY + component.maxY) / (2 * height);
    const centrality = Math.max(0, 1 - Math.hypot(centerX - 0.5, centerY - 0.55));
    const coreSize = cores.get(component.label) || 0;
    return { ...component, coreSize, score: coreSize * (0.75 + (centrality * 0.25)) };
  }).sort((a, b) => (b.score - a.score) || (b.size - a.size));
  const dominant = ranked[0];
  if (!dominant || dominant.coreSize < 12) {
    const uncertain = Uint8Array.from(initial.labels, (label) => dominant && label === dominant.label ? 1 : 0);
    return { mask: uncertain, stages: { subjectCore: core, subjectSupport: support, subjectSelection: uncertain,
      discardedComponents: Uint8Array.from(support, (value, i) => value && !uncertain[i] ? 1 : 0),
      preBridgeSubject: support, postBridgeSubject: uncertain }, review: true,
      metadata: { subjectCleanupApplied: true, subjectSelection: "uncertain", subjectCount: 0 } };
  }
  // Comparable confident subjects are intentional (e.g. a pair of pets).
  const primary = ranked.filter((component) => component.label === dominant.label ||
    (component.coreSize >= dominant.coreSize * 0.35 && component.size >= dominant.size * 0.3));
  const primaryLabels = new Set(primary.map((component) => component.label));
  const selected = Uint8Array.from(initial.labels, (label) => primaryLabels.has(label) ? 1 : 0);
  const radius = Math.max(2, Math.min(4, Math.round(Math.min(width, height) * 0.004)));
  // Only close small raster gaps; do not fill distant islands with a hull.
  let bridged = new Uint8Array(support);
  for (let i = 0; i < radius; i += 1) bridged = dilate(bridged, width, height);
  for (let i = 0; i < radius; i += 1) bridged = erode(bridged, width, height);
  const after = labelComponents(bridged, width, height);
  const keptLabels = new Set();
  for (let i = 0; i < selected.length; i += 1) if (selected[i] && after.labels[i]) keptLabels.add(after.labels[i]);
  const kept = Uint8Array.from(after.labels, (label) => keptLabels.has(label) ? 1 : 0);
  const discarded = Uint8Array.from(support, (value, i) => value && !kept[i] ? 1 : 0);
  // Local hysteresis recovery, never a global threshold relaxation. Weak
  // matte pixels must connect back to the selected subject through a short
  // supported path. Zero-confidence background and distant islands cannot grow.
  const supportRadius = Math.max(4, Math.min(20, Math.round(Math.min(width, height) * 0.025)));
  const recovered = new Uint8Array(kept);
  const distances = new Uint8Array(kept.length);
  distances.fill(255);
  const origins = new Int32Array(kept.length);
  const queue = new Int32Array(kept.length);
  let head = 0, tail = 0, appended = 0;
  for (let i = 0; i < kept.length; i += 1) {
    if (kept[i] && core[i]) { distances[i] = 0; origins[i] = i; queue[tail++] = i; }
  }
  const similarToSubject = (index, origin) => {
    if (!sourceData || !padding) return true;
    const pixel = (i) => {
      const x = i % width - padding.left, y = Math.floor(i / width) - padding.top;
      return x >= 0 && y >= 0 && x < sourceData.width && y < sourceData.height ? (y * sourceData.width + x) * 4 : -1;
    };
    const a = pixel(index), b = pixel(origin), rgb = sourceData.data;
    if (a < 0 || b < 0 || rgb[a + 3] === 0) return false;
    return Math.max(...[0,1,2].map((channel) => Math.abs(rgb[a + channel] - rgb[b + channel]))) <= 48
      && Math.abs((rgb[a] - rgb[a + 1]) - (rgb[b] - rgb[b + 1])) <= 22
      && Math.abs((rgb[a + 1] - rgb[a + 2]) - (rgb[b + 1] - rgb[b + 2])) <= 22;
  };
  while (head < tail) {
    const index = queue[head++], distance = distances[index] + 1;
    if (distance > supportRadius) continue;
    const x = index % width, y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const next of neighbors) {
      if (next < 0 || distances[next] !== 255 || alpha[next] < 16) continue;
      if (!kept[next] && !similarToSubject(next, origins[index])) continue;
      distances[next] = distance; origins[next] = origins[index];
      if (!kept[next]) { recovered[next] = 1; appended += 1; }
      queue[tail++] = next;
    }
  }
  // Reject unusually expansive recovery instead of swallowing a background.
  const keptArea = kept.reduce((sum, value) => sum + value, 0);
  const recoveryRejected = appended > keptArea * 0.05;
  const appendageMask = Uint8Array.from(recovered, (value, i) => !recoveryRejected && value && !kept[i] ? 1 : 0);
  const output = dilate(erode(recoveryRejected ? kept : recovered, width, height), width, height);
  fillTinyHoles(output, width, height, Math.max(16, dominant.size * 0.008));
  const originalCount = support.reduce((sum, value) => sum + value, 0);
  const keptCount = output.reduce((sum, value) => sum + value, 0);
  const outputCount = labelComponents(output, width, height).components.filter((part) => part.size > 18).length;
  return {
    mask: output,
    stages: { subjectCore: core, subjectSupport: support, subjectSelection: selected,
      discardedComponents: discarded, appendageSupport: appendageMask, preBridgeSubject: support, postBridgeSubject: output },
    review: keptCount < originalCount * 0.65 || outputCount > primary.length || recoveryRejected || appended > keptArea * 0.015,
    metadata: { subjectCleanupApplied: true, subjectSelection: "confident-core-centrality",
      subjectCount: primary.length, subjectCoreThreshold: 168 / 255, subjectSupportThreshold: 64 / 255,
      subjectBridgePixels: radius, subjectRetainedFraction: Math.min(1, keptCount / Math.max(1, originalCount)),
      appendageSupportRadius: supportRadius, appendageRecoveredPixels: recoveryRejected ? 0 : appended,
      appendageRecoveryRejected: recoveryRejected,
      componentCountBeforeFiltering: initial.components.length, componentCountAfterFiltering: outputCount }
  };
}

export function padMask(mask, width, height, padding) {
  const paddedWidth = width + padding.left + padding.right;
  const paddedHeight = height + padding.top + padding.bottom;
  const padded = new Uint8Array(paddedWidth * paddedHeight);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width;
    const destinationStart = ((y + padding.top) * paddedWidth) + padding.left;
    padded.set(mask.subarray(sourceStart, sourceStart + width), destinationStart);
  }
  return { mask: padded, width: paddedWidth, height: paddedHeight };
}
