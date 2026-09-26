// Public browser configuration. NEVER put credentials or webhook secrets here.
// Example prices are placeholders, not a recommended price list.
export default {
  branding: { storeName: 'Stickonfig', logoUrl: './mark.svg', accentColor: '#285de5' },
  products: { defaultMaterial: 'vinyl', holographicEnabled: true, laminateEnabled: true, enhancementEnabled: false },
  sizing: { min: 0.25, max: 24, defaultSize: '2x2', presets: [[2,2],[3,3],[4,4],[5,5]], bumperPresets: [[6,2],[11,3]] },
  quantities: { default: 50, options: [20,50,100,200,500] },
  pricing: { currency: 'USD', locale: 'en-US', basePerPiece: 0.5, perSquareInch: 0.08,
    laminateBaseFee: 0, laminatePerSquareInch: 0.02, holographicPerSquareInch: 0.04, enhancementFee: 10,
    quantityBreaks: [[1,1],[100,0.9],[500,0.8]], calculate: null },
  dpi: { recommended: 300, warning: 200, poor: 150 },
  upload: { maxMegabytes: 18 },
  processing: { analysisMaxSide: 720 },
  output: { maxRasterSide: 1200 },
  perimeters: { tight: 0.04, standard: 0.1, wide: 0.2 },
  grouping: { tight: 0.025, auto: 0.16, more: 0.5 },
  submission: { mode: 'download', endpoint: '', buttonLabel: 'Generate production files', onSubmit: null }
};
