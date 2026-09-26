import { contourCommands, contourSvgData } from '../core/contour/index.mjs';
function asciiBytes(value) {
  return new TextEncoder().encode(String(value));
}

function concatByteArrays(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function escapePdfText(value) {
  return String(value || "").replace(/([\\()])/g, "\\$1").replace(/[\r\n]+/g, " ");
}

export function contourSvgForManifest(manifest) {
  const width = manifest.width * 72, height = manifest.height * 72;
  const commands = contourSvgData(manifest.contour.commands || contourCommands(manifest.contour.paths, manifest.width, manifest.height,
    { ...manifest, curveVersion: manifest.contour.curveVersion || 0 }), width, height);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${manifest.width}in" height="${manifest.height}in"><path id="CutContour" d="${commands}" fill="none" stroke="#ff00ff" stroke-width="0.25"/></svg>\n`;
}

export function buildStickerProductionPdf(jpegBytes, manifest) {
  const pageWidth = manifest.width * 72;
  const pageHeight = manifest.height * 72;
  const curves = manifest.contour.commands || contourCommands(manifest.contour.paths, manifest.width, manifest.height, { ...manifest, curveVersion: manifest.contour.curveVersion || 0 });
  const pathCommands = curves.map(path=>path.map(([op,...values])=>op==='Z'?'h':
    values.map((v,i)=>(i%2?(1-v)*pageHeight:v*pageWidth).toFixed(6)).join(' ')+` ${{M:'m',L:'l',C:'c'}[op]}`).join('\n')).join('\n');
  const content = asciiBytes([
    "q",
    `${pageWidth.toFixed(3)} 0 0 ${pageHeight.toFixed(3)} 0 0 cm`,
    "/Artwork Do",
    "Q",
    "q",
    "/CutContourCS CS",
    "1 SCN",
    "0.25 w",
    "[] 0 d", // Production CutContour is always solid; only the preview is dashed.
    "1 J",
    "1 j",
    pathCommands,
    "S",
    "Q",
    ""
  ].join("\n"));

  const objects = [
    asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
    asciiBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /XObject << /Artwork 4 0 R >> /ColorSpace << /CutContourCS 6 0 R >> >> /Contents 5 0 R >>`),
    concatByteArrays([
      asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${manifest.renderWidth} /Height ${manifest.renderHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`),
      jpegBytes,
      asciiBytes("\nendstream")
    ]),
    concatByteArrays([
      asciiBytes(`<< /Length ${content.byteLength} >>\nstream\n`),
      content,
      asciiBytes("endstream")
    ]),
    asciiBytes("[/Separation /CutContour /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]"),
    asciiBytes(`<< /Title (${escapePdfText(`Stickonfig Job - ${manifest.originalFilename}`)}) /Producer (Stickonfig) /Subject (Production artwork with CutContour spot-color cut path) >>`)
  ];

  const header = concatByteArrays([asciiBytes("%PDF-1.7\n%"), new Uint8Array([226, 227, 207, 211]), asciiBytes("\n")]);
  const chunks = [header];
  const offsets = [0];
  let currentOffset = header.byteLength;
  objects.forEach((object, index) => {
    offsets[index + 1] = currentOffset;
    const wrapped = concatByteArrays([
      asciiBytes(`${index + 1} 0 obj\n`),
      object,
      asciiBytes("\nendobj\n")
    ]);
    chunks.push(wrapped);
    currentOffset += wrapped.byteLength;
  });

  const xrefOffset = currentOffset;
  const xrefRows = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let index = 1; index <= objects.length; index += 1) {
    xrefRows.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
  }
  chunks.push(asciiBytes(`${xrefRows.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return concatByteArrays(chunks);
}
