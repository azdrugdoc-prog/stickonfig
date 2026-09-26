export function distanceTransformLine(values, weight) {
  const length = values.length;
  const locations = new Int32Array(length);
  const intersections = new Float64Array(length + 1);
  const output = new Float64Array(length);
  let count = 0;
  locations[0] = 0;
  intersections[0] = -Infinity;
  intersections[1] = Infinity;
  for (let position = 1; position < length; position += 1) {
    let intersection;
    do {
      const location = locations[count];
      intersection = ((values[position] + (weight * position * position)) - (values[location] + (weight * location * location))) /
        (2 * weight * (position - location));
      if (intersection <= intersections[count]) count -= 1;
    } while (count >= 0 && intersection <= intersections[count]);
    count += 1;
    locations[count] = position;
    intersections[count] = intersection;
    intersections[count + 1] = Infinity;
  }
  count = 0;
  for (let position = 0; position < length; position += 1) {
    while (intersections[count + 1] < position) count += 1;
    const delta = position - locations[count];
    output[position] = (weight * delta * delta) + values[locations[count]];
  }
  return output;
}

export function offsetMask(mask, width, height, radiusX, radiusY) {
  if (radiusX <= 0 && radiusY <= 0) return new Uint8Array(mask);
  const infinite = 1e12;
  const horizontal = new Float64Array(mask.length);
  const row = new Float64Array(width);
  const xWeight = radiusX > 0 ? 1 / (radiusX * radiusX) : infinite;
  const yWeight = radiusY > 0 ? 1 / (radiusY * radiusY) : infinite;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) row[x] = mask[rowOffset + x] ? 0 : infinite;
    const transformed = distanceTransformLine(row, xWeight);
    horizontal.set(transformed, rowOffset);
  }
  const output = new Uint8Array(mask.length);
  const column = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) column[y] = horizontal[(y * width) + x];
    const transformed = distanceTransformLine(column, yWeight);
    for (let y = 0; y < height; y += 1) output[(y * width) + x] = transformed[y] <= 1 ? 1 : 0;
  }
  return output;
}

export function labelComponents(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  let label = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    label += 1;
    let head = 0;
    let tail = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      for (const neighbor of neighbors) {
        if (mask[neighbor] && !labels[neighbor]) {
          labels[neighbor] = label;
          queue[tail++] = neighbor;
        }
      }
    }
    components.push({ label, size: tail, minX, maxX, minY, maxY });
  }
  return { labels, components };
}

export function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current[0] * next[1]) - (next[0] * current[1]);
  }
  return area / 2;
}

export function traceComponentBoundary(labels, component, width, height) {
  const vertexWidth = width + 1;
  const edges = new Map();
  const addEdge = (startX, startY, endX, endY) => {
    const start = (startY * vertexWidth) + startX;
    const end = (endY * vertexWidth) + endX;
    const list = edges.get(start) || [];
    list.push(end);
    edges.set(start, list);
  };
  const isLabel = (x, y) => x >= 0 && x < width && y >= 0 && y < height && labels[(y * width) + x] === component.label;
  for (let y = component.minY; y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (!isLabel(x, y)) continue;
      if (!isLabel(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!isLabel(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!isLabel(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!isLabel(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const loops = [];
  const edgeCount = Array.from(edges.values()).reduce((total, list) => total + list.length, 0);
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    const points = [];
    for (let guard = 0; guard <= edgeCount + 1; guard += 1) {
      points.push([current % vertexWidth, Math.floor(current / vertexWidth)]);
      const choices = edges.get(current);
      if (!choices?.length) break;
      const next = choices.pop();
      if (!choices.length) edges.delete(current);
      current = next;
      if (current === start) break;
    }
    if (current === start && points.length >= 3) loops.push(points);
  }
  return loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0] || [];
}

export function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs((dy * point[0]) - (dx * point[1]) + (end[0] * start[1]) - (end[1] * start[0])) / Math.hypot(dx, dy);
}

export function simplifyOpenPath(points, tolerance) {
  if (points.length <= 2) return points;
  let greatestDistance = 0;
  let greatestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points[points.length - 1]);
    if (distance > greatestDistance) {
      greatestDistance = distance;
      greatestIndex = index;
    }
  }
  if (greatestDistance <= tolerance) return [points[0], points[points.length - 1]];
  const first = simplifyOpenPath(points.slice(0, greatestIndex + 1), tolerance);
  const second = simplifyOpenPath(points.slice(greatestIndex), tolerance);
  return first.slice(0, -1).concat(second);
}

export function simplifyClosedPath(points, tolerance) {
  if (points.length < 8) return points;
  const startIndex = points.reduce((best, point, index) => point[0] < points[best][0] ? index : best, 0);
  const rotated = points.slice(startIndex).concat(points.slice(0, startIndex));
  const simplified = simplifyOpenPath(rotated.concat([rotated[0]]), tolerance);
  simplified.pop();
  return simplified.length >= 3 ? simplified : points;
}

export function smoothClosedPath(points, rounds = 2) {
  let smoothed = points;
  for (let round = 0; round < rounds; round += 1) {
    const next = [];
    for (let index = 0; index < smoothed.length; index += 1) {
      const current = smoothed[index];
      const following = smoothed[(index + 1) % smoothed.length];
      next.push([
        (current[0] * 0.75) + (following[0] * 0.25),
        (current[1] * 0.75) + (following[1] * 0.25)
      ]);
      next.push([
        (current[0] * 0.25) + (following[0] * 0.75),
        (current[1] * 0.25) + (following[1] * 0.75)
      ]);
    }
    smoothed = next;
  }
  if (smoothed.length > 500) {
    const step = Math.ceil(smoothed.length / 500);
    smoothed = smoothed.filter((_, index) => index % step === 0);
  }
  return smoothed;
}
