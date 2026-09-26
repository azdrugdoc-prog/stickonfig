// Fit a photographic cut silhouette, not the individual raster edge pixels.
// Arc-length fairing removes fine edge chatter before adaptive least-squares
// cubic fitting. A difficult local feature subdivides only that local span.
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const scale=(a,s)=>[a[0]*s,a[1]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const unit=a=>scale(a,1/(Math.hypot(...a)||1));
const mix=(a,b,t)=>add(scale(a,1-t),scale(b,t));
function evaluate(c,t) {
  const s=1-t;
  return [0,1].map(j=>s*s*s*c[0][j]+3*s*s*t*c[1][j]+3*s*t*t*c[2][j]+t*t*t*c[3][j]);
}
function split(c,t) {
  const a=mix(c[0],c[1],t),b=mix(c[1],c[2],t),d=mix(c[2],c[3],t),e=mix(a,b,t),f=mix(b,d,t),g=mix(e,f,t);
  return [[c[0],a,e,g],[g,f,d,c[3]]];
}
function interval(c,a,b) {return split(split(c,b)[0],a/b)[1];}

export function fitSubjectLoop(source, budget) {
  const lengths=[0];
  source.forEach((p,i)=>lengths.push(lengths.at(-1)+distance(p,source[(i+1)%source.length])));
  const length=lengths.at(-1);
  if(length<.25||source.length<8) return null;
  const count=Math.min(1024,Math.max(48,Math.ceil(length/.008))),step=length/count;
  let edge=0;
  const samples=Array.from({length:count},(_,i)=>{
    const s=i*step;
    while(edge+1<source.length&&lengths[edge+1]<s) edge++;
    return mix(source[edge],source[(edge+1)%source.length],(s-lengths[edge])/(lengths[edge+1]-lengths[edge]||1));
  });
  // Broad support is independent of the vertex count and of the white border.
  // Limit displacement separately so a tight cut never loses an ear or paw.
  const sigma=.045, radius=Math.min(Math.floor(count/8),Math.ceil(3*sigma/step));
  const weights=Array.from({length:radius*2+1},(_,k)=>Math.exp(-.5*((k-radius)*step/sigma)**2));
  const totalWeight=weights.reduce((a,b)=>a+b,0),fairingBudget=budget*.6;
  const filtered=samples.map((p,i)=>{
    let q=[0,0];
    weights.forEach((w,k)=>{q=add(q,scale(samples[(i+k-radius+count)%count],w/totalWeight));});
    const delta=sub(q,p),amount=Math.hypot(...delta);
    return add(p,scale(delta,Math.min(1,fairingBudget/(amount||1))));
  });
  // Include every original polygon vertex in the faired polyline. Otherwise
  // uniform resampling can itself cut across a narrow corner before the error
  // budget is measured. Both polylines now share the same arc-length knots,
  // so their linear interpolation stays within the fairing displacement cap.
  const knots=[...samples.map((_,i)=>i*step),...lengths.slice(0,-1)].sort((a,b)=>a-b).filter((s,i,a)=>!i||s-a[i-1]>1e-10);
  edge=0;
  const fair=knots.map(s=>{
    while(edge+1<source.length&&lengths[edge+1]<s) edge++;
    const p=mix(source[edge],source[(edge+1)%source.length],(s-lengths[edge])/(lengths[edge+1]-lengths[edge]||1));
    const index=Math.min(count-1,Math.floor(s/step)),q=mix(filtered[index],filtered[(index+1)%count],s/step-index);
    const delta=sub(q,p),amount=Math.hypot(...delta);
    return add(p,scale(delta,Math.min(1,fairingBudget/(amount||1))));
  });
  const fitCount=fair.length;
  const closed=[...fair,fair[0]];
  const tangent=i=>unit(sub(fair[(i+1)%fitCount],fair[(i+fitCount-1)%fitCount]));
  const curves=[],fitBudget=budget*.4;
  function fit(first,last,left,right,depth=0) {
    const data=closed.slice(first,last+1),lastIndex=data.length-1;
    let u=[0];
    for(let i=1;i<data.length;i++) u.push(u.at(-1)+distance(data[i-1],data[i]));
    const span=u.at(-1);
    u=u.map(v=>span?v/span:0);u[lastIndex]=1;
    let curve,splitIndex=Math.floor(lastIndex/2),error=Infinity;
    for(let iteration=0;iteration<4;iteration++) {
      let aa=0,ab=0,bb=0,ax=0,bx=0;
      data.forEach((p,i)=>{
        const t=u[i],s=1-t,b1=3*s*s*t,b2=3*s*t*t;
        const a=scale(left,b1),b=scale(right,b2);
        const residual=sub(p,add(scale(data[0],s*s*s+b1),scale(data[lastIndex],t*t*t+b2)));
        aa+=dot(a,a);ab+=dot(a,b);bb+=dot(b,b);ax+=dot(a,residual);bx+=dot(b,residual);
      });
      const det=aa*bb-ab*ab;
      let alpha=det?(ax*bb-bx*ab)/det:0,beta=det?(bx*aa-ax*ab)/det:0;
      if(alpha<span*1e-6||beta<span*1e-6||alpha>span||beta>span) alpha=beta=distance(data[0],data[lastIndex])/3;
      curve=[data[0],add(data[0],scale(left,alpha)),add(data[lastIndex],scale(right,beta)),data[lastIndex]];
      error=0;
      data.forEach((p,i)=>{const e=distance(evaluate(curve,u[i]),p);if(e>error) {error=e;splitIndex=i;}});
      if(error<=fitBudget) break;
      // Newton refinement permits long, naturally parameterized curves instead
      // of unnecessary subdivisions due to chord-length parameter mismatch.
      const next=u.map((t,i)=>{
        if(!i||i===lastIndex) return t;
        const s=1-t,q=sub(evaluate(curve,t),data[i]);
        const d=add(add(scale(sub(curve[1],curve[0]),3*s*s),scale(sub(curve[2],curve[1]),6*s*t)),scale(sub(curve[3],curve[2]),3*t*t));
        const dd=add(scale(add(sub(curve[2],scale(curve[1],2)),curve[0]),6*s),scale(add(sub(curve[3],scale(curve[2],2)),curve[1]),6*t));
        const denominator=dot(d,d)+dot(q,dd);
        return denominator?t-dot(q,d)/denominator:t;
      });
      if(next.some((t,i)=>!Number.isFinite(t)||t<0||t>1||(i&&t<=next[i-1]))) break;
      u=next;
    }
    // Bound the entire fitted span against the faired polyline with the convex
    // hull of cubic-minus-linear controls, not just the input sample vertices.
    let bounded=error<=fitBudget,worstBound=fitBudget;
    if(bounded) for(let i=1;i<data.length;i++) {
      if(u[i]-u[i-1]<1e-12) continue;
      const part=interval(curve,u[i-1],u[i]);
      const bound=Math.max(...part.map((p,j)=>distance(p,mix(data[i-1],data[i],j/3))));
      if(bound>worstBound) {bounded=false;splitIndex=i;worstBound=bound;}
    }
    if(lastIndex===1&&!bounded) {
      const handle=Math.min(distance(data[0],data[1])/3,fitBudget);
      curve=[data[0],add(data[0],scale(left,handle)),add(data[1],scale(right,handle)),data[1]];
      bounded=true;
    }
    if(bounded) {if(curves.length>=256) throw new Error('curve complexity');curves.push(curve);return;}
    if(depth>=14||curves.length>256) throw new Error('curve complexity');
    splitIndex=Math.max(1,Math.min(lastIndex-1,splitIndex));
    const middle=first+splitIndex,t=tangent(middle);
    fit(first,middle,left,scale(t,-1),depth+1);
    fit(middle,last,t,right,depth+1);
  }
  try {
    // Four initial spans avoid the singular closed-endpoint fit. Tangents on
    // both sides of every split (including the seam) are shared.
    const stops=[0,Math.round(fitCount/4),Math.round(fitCount/2),Math.round(3*fitCount/4),fitCount];
    for(let i=1;i<stops.length;i++) fit(stops[i-1],stops[i],tangent(stops[i-1]),scale(tangent(stops[i]%fitCount),-1));
  } catch {return null;}
  return curves;
}
