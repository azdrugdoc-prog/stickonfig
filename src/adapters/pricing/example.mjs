import config from '../../config/index.mjs';
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function stickerSizes(cutStyle) {
  return (cutStyle === 'bumper' ? config.sizing.bumperPresets : config.sizing.presets)
    .filter(([w,h])=>w>=config.sizing.min&&h>=config.sizing.min&&w<=config.sizing.max&&h<=config.sizing.max)
    .filter(([w,h])=>!['circle','square'].includes(cutStyle)||w===h)
    .map(([width,height])=>({width,height,key:`${width}x${height}`}));
}
// This is deliberately an example policy, not the originating shop's formula.
export function stickerPrice(order) {
  const p=config.pricing;
  let result;
  if (typeof p.calculate==='function') result=p.calculate(order,config);
  else {
    const {width,height,quantity,material,matteLaminate,enhanceResolution}=order;
    const area=width*height;
    const rate=[...p.quantityBreaks].sort((a,b)=>a[0]-b[0]).filter(([min])=>quantity>=min).at(-1)?.[1]??1;
    const materialUpgradeTotal=material==='holographic'?round(area*quantity*p.holographicPerSquareInch):0;
    const laminateTotal=matteLaminate?round(p.laminateBaseFee+area*quantity*p.laminatePerSquareInch):0;
    const enhancementFee=enhanceResolution&&config.products.enhancementEnabled?p.enhancementFee:0;
    const subtotal=round((p.basePerPiece+area*p.perSquareInch)*quantity*rate+materialUpgradeTotal+laminateTotal+enhancementFee);
    result={subtotal,unitPrice:quantity>0?round(subtotal/quantity):0,materialUpgradeTotal,laminateTotal,enhancementFee};
  }
  if (![result.subtotal,result.unitPrice,result.materialUpgradeTotal??0].every(v=>Number.isFinite(v)&&v>=0)) throw Error('Pricing adapter returned invalid amounts');
  return {materialUpgradeTotal:0,...result,currency:p.currency};
}
