// Original generated two-frame GIF. Literal-only LZW resets keep encoding simple.
export function animatedGif(width=32,height=32) {
 const data=[...Buffer.from('GIF89a'),width,0,height,0,0x80,0,0,255,30,30,30,30,255];
 for(const color of [0,1]) {
  data.push(0x21,0xf9,4,0,100,0,0,0,0x2c,0,0,0,0,width,0,height,0,0,2);
  const codes=[];for(let i=0;i<width*height;i++)codes.push(4,color);codes.push(5);
  const packed=[];let bits=0,value=0;
  for(const code of codes){value|=code<<bits;bits+=3;while(bits>=8){packed.push(value&255);value>>=8;bits-=8}}
  if(bits)packed.push(value&255);
  for(let i=0;i<packed.length;i+=255){const chunk=packed.slice(i,i+255);data.push(chunk.length,...chunk)}data.push(0);
 }
 data.push(0x3b);return Buffer.from(data);
}
