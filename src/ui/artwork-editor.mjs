import { paintEraseStroke } from '../core/geometry/editing.mjs';

export function createArtworkEditor(dialog, onApply) {
  const get = id => dialog.querySelector(`#builder-editor-${id}`);
  const canvas = get('canvas'), context = canvas.getContext('2d');
  let base = null, draft = null, history = [], previous = null, pointerId = null, mode = 'erase';
  let frame = 0, cursor = null;
  const radius = () => canvas.width * Number(get('size').value) / 200;
  const remember = () => { history.push(draft.slice()); if (history.length > 20) history.shift(); };
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
  };
  function draw() {
    frame = 0;
    if (!base) return;
    const data = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    let remaining = 0;
    for (let i = 0; i < draft.length; i++) {
      if (draft[i]) data.data[i * 4 + 3] = 0;
      if (data.data[i * 4 + 3] > 32) remaining++;
    }
    context.putImageData(data, 0, 0);
    if (cursor) {
      context.beginPath(); context.arc(...cursor, radius(), 0, Math.PI * 2);
      context.lineWidth = 3; context.strokeStyle = 'white'; context.stroke();
      context.lineWidth = 1.5; context.strokeStyle = mode === 'erase' ? '#be185d' : '#166534'; context.stroke();
    }
    get('undo').disabled = !history.length;
    get('apply').disabled = !remaining;
    get('status').textContent = remaining ? 'Review your changes, then apply them to rebuild the proof.' : 'Keep some artwork. Use Restore or Undo before applying.';
  }
  function redraw() { if (!frame) frame = requestAnimationFrame(draw); }
  function finish(event, cancel = false) {
    if (event.pointerId !== pointerId) return;
    if (cancel && history.length) draft = history.pop();
    const id = pointerId; pointerId = null; previous = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    redraw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!base || pointerId !== null || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
    remember(); previous = point(event); cursor = previous;
    paintEraseStroke(draft, canvas.width, canvas.height, previous, previous, radius(), mode === 'erase'); redraw();
  });
  canvas.addEventListener('pointermove', event => {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    cursor = point(event);
    if (previous) { paintEraseStroke(draft, canvas.width, canvas.height, previous, cursor, radius(), mode === 'erase'); previous = cursor; }
    redraw();
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId === pointerId && previous) {
      paintEraseStroke(draft, canvas.width, canvas.height, previous, point(event), radius(), mode === 'erase');
    }
    finish(event);
  });
  canvas.addEventListener('pointercancel', event => finish(event, true));
  canvas.addEventListener('lostpointercapture', event => finish(event, true));
  canvas.addEventListener('pointerleave', () => { cursor = null; redraw(); });
  for (const value of ['erase', 'restore']) get(value).addEventListener('click', () => {
    mode = value;
    for (const option of ['erase', 'restore']) get(option).setAttribute('aria-pressed', String(option === mode));
    redraw();
  });
  get('size').addEventListener('input', () => { get('size-value').textContent = `${get('size').value}%`; redraw(); });
  get('undo').addEventListener('click', () => { if (history.length) { draft = history.pop(); redraw(); } });
  get('reset').addEventListener('click', () => { remember(); draft.fill(0); redraw(); });
  get('cancel').addEventListener('click', () => dialog.close());
  get('apply').addEventListener('click', () => {
    // Synchronous validation too: do not allow a click between drawing frames
    // to submit an entirely erased subject.
    draw();
    if (get('apply').disabled) return;
    onApply(draft.slice()); dialog.close();
  });
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(frame); frame = 0; base = draft = previous = cursor = null; history = []; pointerId = null;
  });
  return {
    open(imageData, erased) {
      if (dialog.open || !imageData) return;
      base = imageData; draft = erased?.slice() || new Uint8Array(base.width * base.height);
      canvas.width = base.width; canvas.height = base.height; history = []; cursor = null;
      get('erase').click(); draw(); dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); }
  };
}
