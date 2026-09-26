// Shared canonical cut geometry for canvas, SVG, JSON, and PDF.
// Version 3 uses broad fairing plus adaptive fitting for photographic subjects;
// graphic artwork and geometric cuts keep the version 2 behavior unchanged.
// Version 2 smooths complete loops with bounded periodic cubic B-splines.
// Version 1 (also the small-detail fallback) rounds individual vertices using
// quadratic Beziers expressed as cubics. All budgets use physical inches.
import { fitSubjectLoop } from './curve-fit.mjs?v=3';

export function contourCommands(paths, width, height, { cutStyle = 'die-cut', perimeterInches = 0.1, curveVersion = 3, subjectCategory = 'graphic', processing } = {}) {
  const smooth = [1,2,3].includes(curveVersion) && !['rectangle', 'square', 'bumper'].includes(cutStyle);
  const deviation = Math.min(0.012, perimeterInches > 0 ? perimeterInches / 4 : 0.006);
  const reachLimit = deviation * 2;
  return paths.map((path) => {
    if (!smooth || path.length < 3) return path.map(([x,y],i)=>[i?'L':'M',x,y]).concat([['Z']]);
    const points = path.map(([x,y])=>[x*width,y*height]);
    if (curveVersion === 3 && cutStyle === 'die-cut' && (processing?.subjectCategory || subjectCategory) === 'photographic-subject') {
      const budget = Math.min(.02,perimeterInches>0?perimeterInches*.45:.006);
      const fitted=fitSubjectLoop(points,budget);
      if(fitted) {
        const samples=fitted.flatMap(c=>Array.from({length:12},(_,i)=>bezier(c,i/12)));
        if(samples.every(([x,y])=>x>=0&&x<=width&&y>=0&&y<=height)&&!selfCrosses(samples)&&signedArea(samples)*signedArea(points)>0&&Math.abs(signedArea(samples))>=Math.abs(signedArea(points))*.9) {
          return [['M',...fitted[0][0]],...fitted.map(c=>['C',...c[1],...c[2],...c[3]]),['Z']].map(([op,...values])=>[op,...values.map((v,i)=>v/(i%2?height:width))]);
        }
      }
    }
    if (curveVersion >= 2) {
      const budget = Math.min(0.015, perimeterInches > 0 ? perimeterInches / 4 : 0.006);
      const fitted = smoothLoop(points, budget);
      if (fitted) return fitted.map(([op,...values])=>[op,...values.map((v,i)=>v/(i%2?height:width))]);
    }
    const corners = points.map((point,i)=>{
      const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
      const a=Math.hypot(prev[0]-point[0],prev[1]-point[1]), b=Math.hypot(next[0]-point[0],next[1]-point[1]);
      const reach=Math.min(a/2,b/2,reachLimit);
      const entry=point.map((v,j)=>v+(prev[j]-v)*(a?reach/a:0));
      const exit=point.map((v,j)=>v+(next[j]-v)*(b?reach/b:0));
      return {entry,exit,c1:entry.map((v,j)=>v+2/3*(point[j]-v)),c2:exit.map((v,j)=>v+2/3*(point[j]-v))};
    });
    const normalize=(point)=>[point[0]/width,point[1]/height];
    const commands=[['M',...normalize(corners[0].entry)]];
    corners.forEach((corner,i)=>{
      if(i) commands.push(['L',...normalize(corner.entry)]);
      commands.push(['C',...normalize(corner.c1),...normalize(corner.c2),...normalize(corner.exit)]);
    });
    commands.push(['Z']);
    return commands;
  });
}

// Equally spaced, lightly filtered controls avoid making the smoothing depend
// on how densely the raster tracer happened to place vertices. A periodic cubic
// B-spline has continuous tangent AND curvature, including at the closing seam;
// unlike vertex fillets, it does not alternate between straight runs and arcs.
function smoothLoop(points, budget) {
  const lengths=[0];
  for(let i=0;i<points.length;i++) lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,j)=>v-points[(i+1)%points.length][j])));
  const total=lengths.at(-1);
  if(total<budget*8) return null; // Preserve tiny islands/holes with the v1 model.
  function at(distance) {
    distance=((distance%total)+total)%total;
    let lo=0,hi=points.length;
    while(lo+1<hi) {const mid=(lo+hi)>>1;if(lengths[mid]<=distance) lo=mid;else hi=mid;}
    const t=(distance-lengths[lo])/(lengths[lo+1]-lengths[lo]||1);
    return points[lo].map((v,j)=>v+(points[(lo+1)%points.length][j]-v)*t);
  }
  for(let attempt=0;attempt<4;attempt++) {
    const count=Math.max(12,Math.ceil(total/(budget*3*Math.pow(.7,attempt))));
    if(count>640) return null; // Bound browser/Worker work and export size.
    const step=total/count;
    const raw=Array.from({length:count},(_,i)=>at(i*step));
    const controls=raw.map((point,i)=>point.map((v,j)=>(raw[(i+count-1)%count][j]+6*v+raw[(i+1)%count][j])/8));
    const curves=controls.map((p,i)=>{
      const prev=controls[(i+count-1)%count],next=controls[(i+1)%count],after=controls[(i+2)%count];
      return [p.map((v,j)=>(prev[j]+4*v+next[j])/6),p.map((v,j)=>(2*v+next[j])/3),
        p.map((v,j)=>(v+2*next[j])/3),p.map((v,j)=>(v+4*next[j]+after[j])/6)];
    });
    // Check against the original polygon at corresponding arc lengths. Each
    // interval is split at source vertices; the cubic-minus-line control hull
    // then bounds the entire curve's error, not just a few sampled pixels.
    const valid=curves.every((curve,i)=>{
      const start=i*step,end=(i+1)*step;
      const cuts=[0,...lengths.filter(s=>s>start+1e-10&&s<end-1e-10).map(s=>(s-start)/step),1];
      return cuts.slice(1).every((t,k)=>{
        const a=cuts[k],part=subcurve(curve,a,t),p=at(start+a*step),q=at(start+t*step);
        return part.every((control,j)=>Math.hypot(...control.map((v,axis)=>v-(p[axis]+(q[axis]-p[axis])*j/3)))<=budget);
      });
    });
    if(!valid) continue;
    const sampled=curves.flatMap(c=>[0,.25,.5,.75].map(t=>bezier(c,t)));
    // Keep winding, meaningful area, and simple topology. Thin features that
    // cannot tolerate this smoothing fall back to the existing conservative path.
    if(signedArea(sampled)*signedArea(points)<=0||Math.abs(signedArea(sampled))<Math.abs(signedArea(points))*.75||selfCrosses(sampled)) continue;
    return [['M',...curves[0][0]],...curves.map(c=>['C',...c[1],...c[2],...c[3]]),['Z']];
  }
  return null;
}

function splitCurve(c,t) {
  const mix=(a,b)=>a.map((v,j)=>v+(b[j]-v)*t);
  const a=mix(c[0],c[1]),b=mix(c[1],c[2]),d=mix(c[2],c[3]),e=mix(a,b),f=mix(b,d),g=mix(e,f);
  return [[c[0],a,e,g],[g,f,d,c[3]]];
}
function subcurve(c,a,b) {return splitCurve(splitCurve(c,b)[0],a/b)[1];}
function bezier(c,t) {return splitCurve(c,t)[0][3];}
function signedArea(points) {return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;}
function selfCrosses(points) {
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  // X-sorted segment bounds cheaply reject distant pairs before intersection.
  const edges=points.map((a,i)=>{const b=points[(i+1)%points.length];return {a,b,i,left:Math.min(a[0],b[0]),right:Math.max(a[0],b[0])};}).sort((a,b)=>a.left-b.left);
  for(let i=0;i<edges.length;i++) for(let j=i+1;j<edges.length&&edges[j].left<=edges[i].right;j++) {
    const a=edges[i],b=edges[j],gap=Math.abs(a.i-b.i);
    if(gap<=1||gap===points.length-1) continue;
    if(cross(a.a,a.b,b.a)*cross(a.a,a.b,b.b)<-1e-18&&cross(b.a,b.b,a.a)*cross(b.a,b.b,a.b)<-1e-18) return true;
  }
  return false;
}

export function contourSvgData(commands, width = 1, height = 1) {
  return commands.map(path=>path.map(([op,...values])=>op+(values.length?' '+values.map((v,i)=>(v*(i%2?height:width)).toFixed(6)).join(' '):'')).join(' ')).join(' ');
}
