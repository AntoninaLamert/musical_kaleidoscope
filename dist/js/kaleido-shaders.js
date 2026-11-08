// Mirror the photograph of each 3D world. The sculpture never enters these
// buffers. In particular there is intentionally no beat/scale/flash uniform.
export const kaleidoFragment = `
varying vec2 vUv;
uniform sampler2D world0,world1,world2,world3,world4;
uniform float uAspect,uSectors,uIntensity,uWeights[5],uTime,uMood;
uniform float uSectorsFrom,uSymmetryMix;
uniform sampler2D uInk,uSculptureMask;
uniform float uInkAngle,uInkBeat,uViewScale,uShowHue;
const float TAU=6.28318530718;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float stroke(float d,float width){float aa=max(fwidth(d),.001);return 1.-smoothstep(width,width+aa,abs(d));}
vec3 jewels(float n){return .48+.46*cos(TAU*(n+vec3(.02,.35,.65)));}
// Filled ornament cells supply the dense mosaic seen through the mirrors.
// Three scales overlap like decorated transparent screens at different depths.
vec3 ornament(vec2 p,float style){
  vec3 total=vec3(0.);
  for(int layer=0;layer<3;layer++){
    float l=float(layer),scale=2.5+l*2.8;
    vec2 q=turn((l-1.)*.28+uTime*.007*(l==1.?-1.:1.))*p;
    q*=scale;q+=vec2(.11*sin(uTime*.043+l),.12*cos(uTime*.037-l));
    q.x+=.10*sin(q.y*2.+uTime*.06+l);
    // Staggered cells form interlocking rosettes rather than empty rings.
    float row=floor(q.y/.866);q.x+=mod(row,2.)*.5;
    vec2 id=vec2(floor(q.x+.5),row);
    vec2 cell=vec2(fract(q.x+.5)-.5,mod(q.y,.866)-.433);
    float seed=hash(id+l*13.),r=length(cell),a=atan(cell.y,cell.x);
    float t=uTime*.035*(l==1.?-1.:1.);
    vec3 c=vec3(0.);
    if(style<.5){
      float petals=cos(a*8.+t),inner=cos(a*12.-t*1.3);
      float boundary=.30+.105*petals+.018*sin(a*16.-uTime*.09);
      float fill=(1.-smoothstep(boundary-.035,boundary,r))*(.28+.72*smoothstep(.06,.24,r));
      vec3 enamel=mix(vec3(.02,.48,.40),vec3(.39,.055,.52),.5+.5*sin(seed*TAU+l+uMood));
      c=enamel*fill*.8;
      float gold=stroke(r-boundary,.007)+stroke(r-(.17+.032*inner),.006)+stroke(r-.43,.004);
      float lace=stroke(sin(a*16.+t*2.)*r,.009)*smoothstep(.26,.30,r)*(1.-smoothstep(.4,.43,r));
      float pearl=exp(-pow((r-.39)*85.,2.))*pow(.5+.5*cos(a*24.-t),10.);
      c+=vec3(1.,.60,.12)*(gold*.8+lace*.5)+vec3(.3,1.,.83)*pearl;
      c+=vec3(.95,.33,.48)*stroke(r-(.09+.025*cos(a*8.+t)),.008);
    }else if(style<1.5){
      // A triangular tessellation: each half-cell is a differently lit facet.
      vec2 skew=vec2(q.x-q.y*.57735,q.y*1.1547);vec2 tile=floor(skew);vec2 f=fract(skew);
      float halfCell=step(1.,f.x+f.y),n=hash(tile+halfCell*.37+l*17.);
      float edge=min(min(f.x,f.y),min(min(1.-f.x,1.-f.y),abs(1.-f.x-f.y)*.707));
      vec3 glass=jewels(n*.8+l*.12+uMood*.06);
      float facet=(halfCell>.5?.8:.43)+.18*sin(n*19.+uTime*.11);
      float refractBand=.5+.5*sin((f.x-f.y)*7.+n*7.+uTime*.08);
      c=glass*(facet*.65+refractBand*.12);
      c+=mix(glass,vec3(.8,1.,1.),.7)*stroke(edge,.008)*.6;
      c*=.82+.18*cos((f.x+f.y)*3.14);
    }else{
      float angle=a+t+seed*2.;float petal=.23+.15*pow(.5+.5*cos(angle*6.),.7);
      float inside=1.-smoothstep(petal-.018,petal,r);
      vec3 tint=mix(vec3(.26,.13,.65),vec3(.95,.24,.43),seed);
      tint=mix(tint,vec3(.98,.64,.25),pow(.5+.5*cos(angle*6.),5.)*.38);
      float fold=.3+.7*pow(.5+.5*cos(angle*6.),.5);
      float vein=stroke(sin(angle*18.+r*19.)*r,.004)*.14;
      c=tint*inside*(fold*.75+vein)*( .65+.35*cos(r*9.));
      c+=tint*stroke(r-petal,.005)*.5;
      c+=vec3(1.,.71,.15)*exp(-r*r*750.);
      float leaf=.40+.04*cos(angle*6.+3.14);
      c+=vec3(.06,.46,.29)*stroke(r-leaf,.012)*pow(.5+.5*cos(angle*6.+3.14),3.);
    }
    float depthWeight=layer==0?1.:(layer==1?.32:.12);
    total+=c*depthWeight;
  }
  return total;
}
vec3 pattern(vec2 p,float sectors){
  float radius=length(p);
  float sector=TAU/sectors;
  float a=abs(mod(atan(p.y,p.x)+sector,sector*2.)-sector);
  // Keep angular distances in radians: increasing symmetry must not squeeze
  // an entire wide source wedge into each narrower mirror sector.
  float sourceAngle=a;
  vec2 reflected=radius*vec2(cos(sourceAngle),sin(sourceAngle));
  vec2 uv=vec2(.5)+reflected*.43/vec2(uAspect,1.);
  vec3 c=vec3(0.);
  // Tunnel coordinates: equal steps in log(radius) are geometrically spaced
  // rings. Both radial and tangential motif sizes shrink towards the centre.
  vec2 tapestry=vec2(log(max(radius,.035)),a)*.78;
  if(uWeights[0]>.001)c+=(texture2D(world0,uv).rgb*.28+ornament(tapestry,0.))*uWeights[0];
  if(uWeights[1]>.001)c+=(texture2D(world1,uv).rgb*1.6+ornament(tapestry,1.)*.8)*uWeights[1];
  if(uWeights[2]>.001)c+=texture2D(world2,uv).rgb*2.8*uWeights[2];
  if(uWeights[3]>.001)c+=(texture2D(world3,uv).rgb*1.4+ornament(tapestry,2.)) *uWeights[3];
  if(uWeights[4]>.001)c+=texture2D(world4,uv).rgb*1.8*uWeights[4];
  // Distant details fade before becoming smaller than a screen pixel.
  return c*(.22+.78*smoothstep(.08,1.05,radius));
}
void main(){
  // Exactly the same centre as the foreground camera. No beat-driven zoom.
  vec2 p=(vUv-.5)*vec2(uAspect,1.)*2.*uViewScale;
  vec3 c=pattern(p,uSectors);
  if(uSymmetryMix<.999)c=mix(pattern(p,uSectorsFrom),c,uSymmetryMix);
  // Broad soft light falloff reserves the foreground without drawing a halo
  // that could be mistaken for another outline of the sculpture.
  vec2 foreground=(vUv-.5)*vec2(uAspect*1.3,1.6);
  float separation=.12+.88*(1.-exp(-dot(foreground,foreground)*3.));
  float luminance=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(luminance),c,.86+.14*uIntensity);
  c=(1.-exp(-c*1.35))*.64*uIntensity*separation;
  c=pow(vec3(1.)-exp(-c*1.4),vec3(.86));
  c=mix(c,c.gbr,uShowHue*.24);
  float inkSector=TAU/uSectors;
  float inkAngle=abs(mod(atan(p.y,p.x)-uInkAngle+inkSector,inkSector*2.)-inkSector);
  vec2 inkUV=.5+length(p)*vec2(cos(inkAngle),sin(inkAngle))/6.;
  vec4 ink=texture2D(uInk,inkUV);
  float behind=1.-texture2D(uSculptureMask,vUv).r;
  c+=ink.rgb*ink.a*.75*(1.+uInkBeat*.5)*behind;
  float edge=smoothstep(0.,.075,vUv.x)*(1.-smoothstep(.925,1.,vUv.x));
  edge*=smoothstep(0.,.035,vUv.y)*(1.-smoothstep(.965,1.,vUv.y));
  gl_FragColor=vec4(c*edge,1.);
}`;
