// Input loops must already be unioned (non-crossing). Keep every disconnected
// outer boundary, not just the largest subject. Winding does not matter here.
export function outerContours(paths) {
  const area = path => Math.abs(path.reduce((sum, [x, y], i) => {
    const next = path[(i + 1) % path.length];
    return sum + x * next[1] - next[0] * y;
  }, 0));
  const inside = ([x, y], path) => {
    let result = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const [ax, ay] = path[i], [bx, by] = path[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) result = !result;
    }
    return result;
  };
  const areas = paths.map(area);
  return paths.filter((path, i) => !paths.some((other, j) =>
    i !== j && areas[j] > areas[i] && inside(path[0], other)));
}

// A swept circular brush in stable source-raster coordinates. Interpolating the
// entire segment prevents holes when a mouse or finger moves quickly.
export function paintEraseStroke(mask, width, height, from, to, radius, erase = true) {
  if (![...from, ...to, radius].every(Number.isFinite) || radius <= 0) return;
  const dx = to[0] - from[0], dy = to[1] - from[1], length2 = dx * dx + dy * dy;
  const left = Math.max(0, Math.floor(Math.min(from[0], to[0]) - radius));
  const right = Math.min(width - 1, Math.ceil(Math.max(from[0], to[0]) + radius));
  const top = Math.max(0, Math.floor(Math.min(from[1], to[1]) - radius));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(from[1], to[1]) + radius));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const t = length2 ? Math.max(0, Math.min(1, ((x + .5 - from[0]) * dx + (y + .5 - from[1]) * dy) / length2)) : 0;
    if ((x + .5 - from[0] - t * dx) ** 2 + (y + .5 - from[1] - t * dy) ** 2 <= radius * radius) {
      mask[y * width + x] = erase ? 1 : 0;
    }
  }
}
