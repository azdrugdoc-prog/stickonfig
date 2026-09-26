import config from '../config/index.mjs';
const $=id=>document.getElementById(id);
$('shop-name').textContent=config.branding.storeName;$('shop-logo').src=config.branding.logoUrl;
document.documentElement.style.setProperty('--builder-blue',config.branding.accentColor);
for(const name of ['width','height']) {const el=$('builder-'+name);el.min=config.sizing.min;el.max=config.sizing.max;}
const quantities=document.querySelector('.builder-quantity-tiles');quantities.replaceChildren();
for(const number of config.quantities.options) {
  const button=document.createElement('button');button.type='button';button.className='config-tile';button.dataset.builderQuantity=number;button.textContent=number;quantities.append(button);
}
for(const input of document.querySelectorAll('[name=material]'))input.defaultChecked=input.value===config.products.defaultMaterial;
document.querySelector('[name=material][value=holographic]').closest('label').hidden=!config.products.holographicEnabled;
$('builder-laminate').closest('label').hidden=!config.products.laminateEnabled;$('builder-laminate').disabled=!config.products.laminateEnabled;
$('builder-enhance').closest('div').hidden=!config.products.enhancementEnabled;$('builder-enhance').disabled=!config.products.enhancementEnabled;
const enhancementText=`Request manual enhancement (+${new Intl.NumberFormat(config.pricing.locale,{style:'currency',currency:config.pricing.currency}).format(config.pricing.enhancementFee)})`;
$('builder-enhance').closest('label').querySelector('b').textContent=enhancementText;
const choice=document.querySelector('#builder-resolution-dialog [value=enhance]');choice.hidden=!config.products.enhancementEnabled;choice.textContent=enhancementText;
document.querySelector('#builder-drop-zone > span').textContent=`SVG, PNG, JPG, JPEG, WEBP, GIF, or PDF · up to ${config.upload.maxMegabytes} MB`;
try {
  await import('./builder.mjs');
  const app=$('sticker-builder-app');app.inert=false;app.setAttribute('aria-busy','false');app.dataset.ready='true';
} catch(error) {
  $('builder-validation').textContent='The configurator could not load. Please reload or contact this site’s operator.';
  throw error;
}
