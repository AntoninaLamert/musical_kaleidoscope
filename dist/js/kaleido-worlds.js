import * as THREE from '../vendor/three.module.js';

// Five genuinely different 3D sets, photographed by a background-only camera.
// No set receives beat, sculpture scale, sculpture rotation or sculpture shape.
const TAU=Math.PI*2;
function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function world(){const scene=new THREE.Scene();scene.background=new THREE.Color(0x000106);scene.fog=new THREE.FogExp2(0x000106,.018);return {scene,update(){},resize(){}};}
function attributes(geometry,phases,tints){geometry.setAttribute('aPhase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));geometry.setAttribute('aTint',new THREE.InstancedBufferAttribute(new Float32Array(tints),3));}
function noiseTexture(){
  const n=128,data=new Uint8Array(n*n*4),rand=random(910),grids=[8,16,32].map(size=>({size,values:Float32Array.from({length:size*size},rand)}));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let value=0;
    for(let o=0;o<3;o++){const {size,values}=grids[o],px=x/n*size,py=y/n*size,ix=Math.floor(px),iy=Math.floor(py);let fx=px-ix,fy=py-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
      const a=values[iy*size+ix],b=values[iy*size+(ix+1)%size],c=values[((iy+1)%size)*size+ix],d=values[((iy+1)%size)*size+(ix+1)%size];
      value+=((a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy)*[.57,.29,.14][o];}
    const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(value*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,n,n);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
function lineSet(points,colors,material){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return new THREE.LineSegments(g,material);}

function mandala(){
  const w=world(),points=[],colors=[];
  const segment=(a,b,tint)=>{points.push(...a,...b);colors.push(...tint,...tint);};
  // Actual nested filigree in slightly separated planes, with arched petal ribs.
  for(let band=0;band<7;band++)for(let i=0;i<288;i++){
    const path=t=>{const a=t*TAU,r=1.1+band*.59+(.15+band*.025)*Math.cos(a*(8+band%3*4));return [Math.cos(a)*r,Math.sin(a)*r,.14*Math.sin(a*8+band)];};
    segment(path(i/288),path((i+1)/288),band%2?[.12,.65,.48]:[1.,.57,.16]);
  }
  for(let leaf=0;leaf<16;leaf++)for(let row=0;row<3;row++)for(let i=0;i<64;i++){
    const petal=t=>{const a=leaf/16*TAU,r=1.6+row*.9+Math.sin(t*Math.PI)*.8,s=Math.sin(t*TAU)*(.2+row*.07);return [Math.cos(a)*r-Math.sin(a)*s,Math.sin(a)*r+Math.cos(a)*s,.2+Math.sin(t*Math.PI)*.5];};
    segment(petal(i/64),petal((i+1)/64),[.75,.4,.10]);
  }
  const uniforms={uTime:{value:0},uMids:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uTime,uMids;varying vec3 vColor;varying float vDepth;void main(){vec3 p=position;float r=length(p.xy),a=atan(p.y,p.x);
      p.xy*=1.+.055*sin(a*6.+uTime*.19+r);p.z+=.22*sin(r*2.-uTime*.16);
      vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=-mv.z;vColor=mix(color,color.gbr,uMids*.08);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vColor;varying float vDepth;void main(){gl_FragColor=vec4(vColor,exp(-vDepth*.014)*.85);}`});
  const prototype=lineSet(points,colors,material),groups=[];
  for(const [x,y,z,size,tilt] of [[4,1,-9,1.5,.22],[11,5,-26,2.1,-.4],[7,-3,-45,2.7,.5],[25,12,-67,3.6,-.35]]){
    const g=new THREE.Group(),mesh=new THREE.LineSegments(prototype.geometry,material);g.add(mesh);g.position.set(x,y,z);g.scale.setScalar(size);g.rotation.x=tilt;w.scene.add(g);groups.push(g);
  }
  w.update=(time,music)=>{uniforms.uTime.value=time;uniforms.uMids.value=music.mids;for(let i=0;i<groups.length;i++){groups[i].rotation.z=time*(i%2?-.023:.017)+i*.5;groups[i].rotation.y=.18*Math.sin(time*.045+i);}};
  return w;
}

function crystals(){
  const w=world(),rand=random(35),count=105,dummy=new THREE.Object3D(),phases=[],tints=[];
  const geometry=new THREE.IcosahedronGeometry(1,0),bary=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<geometry.attributes.position.count;i++)bary[i*3+i%3]=1;
  geometry.setAttribute('barycentric',new THREE.BufferAttribute(bary,3));
  const uniforms={uTime:{value:0},uMids:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,
    vertexShader:`attribute vec3 barycentric;attribute float aPhase;attribute vec3 aTint;uniform float uTime;varying vec3 vBary,vView,vTint;varying float vPhase;
      void main(){vec3 p=position;float a=uTime*(.06+.025*sin(aPhase))+aPhase,c=cos(a),s=sin(a);p.xz=mat2(c,-s,s,c)*p.xz;
      p.y*=.86+.14*sin(uTime*.13+aPhase);p.z+=.1*sin(uTime*.09+aPhase)*p.y;
      vec4 mv=modelViewMatrix*instanceMatrix*vec4(p,1.);vView=mv.xyz;vBary=barycentric;vTint=aTint;vPhase=aPhase;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vBary,vView,vTint;varying float vPhase;uniform float uTime,uMids;
      vec3 environment(vec3 ray){float band=.5+.5*sin(ray.x*8.+ray.y*5.);return mix(vec3(.035,.13,.28),vec3(.33,.6,.85),band)*(.3+.7*abs(ray.z));}
      void main(){vec3 n=normalize(cross(dFdx(vView),dFdy(vView))),ray=normalize(vView);if(dot(n,ray)>0.)n=-n;
        float fresnel=pow(1.-max(0.,dot(-ray,n)),3.);vec3 transmission=vec3(environment(refract(ray,n,.66)).r,environment(refract(ray,n,.68)).g,environment(refract(ray,n,.71)).b);
        float highlight=pow(max(0.,dot(reflect(ray,n),normalize(vec3(-.4,.7,1.)))),48.);
        vec3 aa=fwidth(vBary),a=smoothstep(aa*.3,aa*1.4,vBary);float edge=1.-min(a.x,min(a.y,a.z));
        vec3 c=transmission*.6+vTint*(.12+fresnel*.55)+vec3(.8,.94,1.)*(highlight*1.5+edge*.32);
        c=mix(c,c.brg,uMids*.06);float fog=exp(-length(vView)*.016);
        gl_FragColor=vec4(c*fog,.24+fresnel*.4+edge*.18);}`});
  material.forceSinglePass=true;
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  for(let i=0;i<count;i++){
    const z=-7-rand()*76,spread=7+(-z)*.32;
    dummy.position.set((rand()-.15)*spread*1.6,(rand()-.35)*spread,z);
    dummy.rotation.set(rand()*TAU,rand()*TAU,rand()*TAU);
    const size=.6+rand()*1.7;dummy.scale.set(size*(.3+rand()*.45),size*(1.4+rand()),size*.4);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    phases.push(rand()*TAU);tints.push(.15+rand()*.2,.38+rand()*.3,.85+rand()*.15);
  }
  attributes(geometry,phases,tints);mesh.frustumCulled=false;w.scene.add(mesh);
  w.update=(time,music)=>{uniforms.uTime.value=time;uniforms.uMids.value=music.mids;};return w;
}

function stars(positions,seeds,tints,uniforms){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));g.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));
  return new THREE.Points(g,new THREE.ShaderMaterial({uniforms,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute float seed;uniform float uTime,uHighs,uPixels;varying vec3 vColor;varying float vAlpha;
      void main(){vec3 p=position;p.x+=.13*sin(uTime*.04+seed*31.);p.y+=.12*cos(uTime*.03+seed*41.);vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.8+pow(seed,9.)*14.)*uPixels*20./max(6.,-mv.z),1.,15.);
        vColor=color;vAlpha=(.45+.55*pow(.5+.5*sin(uTime*(.35+seed*.8)+seed*91.),2.))*(.75+uHighs*.1)*exp(-max(0.,-mv.z-45.)*.008);}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;float core=exp(-r*r*14.),halo=exp(-r*r*3.)*.22;
      float crossRay=exp(-min(abs(p.x),abs(p.y))*60.)*exp(-r*6.)*.25;gl_FragColor=vec4(vColor,(core+halo+crossRay)*vAlpha*(1.-smoothstep(.7,1.,r)));}`}));
}
function cosmos(texture){
  const w=world(),rand=random(876),p=[],seeds=[],colors=[],uniforms={uTime:{value:0},uHighs:{value:0},uPixels:{value:1}};
  for(let i=0;i<3200;i++){const z=-8-rand()*115,spread=12-z*.55;p.push((rand()-.35)*spread*2,(rand()-.45)*spread*1.3,z);const seed=rand();seeds.push(seed);colors.push(.6+seed*.4,.7+seed*.24,1.);}
  w.scene.add(stars(p,seeds,colors,uniforms));
  const gp=[],gs=[],gc=[];
  for(let i=0;i<1100;i++){const radius=Math.pow(rand(),.65)*19,a=radius*.43+(i%3)*TAU/3+(rand()-.5)*.25;gp.push(Math.cos(a)*radius,Math.sin(a)*radius*.55,(rand()-.5)*2);gs.push(rand());gc.push(.35+rand()*.4,.4+rand()*.35,1.);}
  const galaxy=stars(gp,gs,gc,uniforms);galaxy.position.set(8,5,-37);galaxy.rotation.x=.25;w.scene.add(galaxy);
  const clouds=[];
  for(let i=0;i<5;i++){
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uMap:{value:texture},uTime:{value:0},uTint:{value:new THREE.Color([0x29399f,0x86367a,0x164e7e,0x40267d,0x14626c][i])},uSeed:{value:i*.19}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform sampler2D uMap;uniform float uTime,uSeed;uniform vec3 uTint;void main(){vec2 p=vUv-.5;
        float n=texture2D(uMap,vUv*.7+vec2(uTime*.0015,uSeed)).r;float filaments=texture2D(uMap,vUv*1.8-vec2(uTime*.001,0.)).r;
        float shape=exp(-dot(p*vec2(1.2,2.5),p*vec2(1.2,2.5))*4.);float fog=pow(max(0.,n-.25),1.6)*shape*(.7+filaments);
        gl_FragColor=vec4(uTint,fog*.8);}`});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(38+i*8,24+i*5),material);mesh.position.set(5+i*2,1+i*2,-18-i*17);mesh.rotation.z=i*.85;w.scene.add(mesh);clouds.push(mesh);
  }
  w.update=(time,music)=>{uniforms.uTime.value=time;uniforms.uHighs.value=music.highs;galaxy.rotation.z=time*.008;for(let i=0;i<clouds.length;i++){clouds[i].material.uniforms.uTime.value=time;clouds[i].rotation.z=i*.85+time*.003*(i%2?1:-1);}};
  w.resize=pixels=>{uniforms.uPixels.value=pixels;};return w;
}

function petalGeometry(){
  const g=new THREE.PlaneGeometry(1,1,12,24),a=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<a.count;i++){const u=uv.getX(i)*2-1,t=uv.getY(i),width=Math.pow(Math.sin(Math.PI*t),.72)*.62;
    a.setXYZ(i,u*width,t*2.6,.75*Math.sin(t*Math.PI)-.55*t+.22*u*u*Math.sin(Math.PI*t));}
  a.needsUpdate=true;g.computeVertexNormals();return g;
}
function flowers(){
  const w=world(),rand=random(521),dummy=new THREE.Object3D(),flowerMatrix=new THREE.Matrix4(),matrix=new THREE.Matrix4(),phases=[],tints=[],pollen=[],pollenSeeds=[],pollenColors=[];
  const geometry=petalGeometry(),count=12*9,uniforms={uTime:{value:0},uMids:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,
    vertexShader:`attribute float aPhase;attribute vec3 aTint;uniform float uTime;varying vec2 vUv;varying vec3 vNormal,vView,vTint;
      void main(){vec3 p=position;float opening=.83+.15*sin(uTime*.12+aPhase);p.xy*=opening;p.z+=uv.y*uv.y*.48*sin(uTime*.12+aPhase);
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(p,1.);vUv=uv;vView=mv.xyz;vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vTint=aTint;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vNormal,vView,vTint;uniform float uTime,uMids;
      void main(){vec3 n=normalize(vNormal);float lit=.32+.68*abs(dot(n,normalize(vec3(-.4,.7,1.))));float rim=pow(1.-abs(dot(n,normalize(-vView))),2.);
        float veins=pow(.5+.5*cos(vUv.x*80.+sin(vUv.y*9.)*2.),12.)*.08;vec3 tip=mix(vTint,vec3(1.,.68,.46),pow(vUv.y,2.)*.42);
        float edge=pow(abs(vUv.x-.5)*2.,8.);vec3 c=tip*(lit+veins)+vec3(1.,.66,.8)*(rim*.32+edge*.12);
        c=mix(c,c.rbg,uMids*.09);float fog=exp(-length(vView)*.013);gl_FragColor=vec4(c*fog,.38+rim*.15);}`});
  material.forceSinglePass=true;const mesh=new THREE.InstancedMesh(geometry,material,count);
  for(let flower=0;flower<12;flower++){
    // Separate flower heads across the photographed sector instead of stacking
    // large petals into a single halo immediately behind the sculpture.
    const z=-12-flower*5.8,distance=8-z,radius=.65+(flower%4)*.72+rand()*.08,angle=.045+Math.floor(flower/4)*.17;
    const x=distance*.383*radius*Math.cos(angle),y=distance*.383*radius*Math.sin(angle);
    dummy.position.set(x,y,z);dummy.rotation.set((rand()-.5)*.9,(rand()-.5)*.7,rand()*TAU);dummy.scale.setScalar(distance*.021);dummy.updateMatrix();flowerMatrix.copy(dummy.matrix);
    for(let petal=0;petal<9;petal++){
      dummy.position.set(0,0,petal%2*.16);dummy.rotation.set(.16*(petal%2),0,petal/9*TAU);dummy.scale.setScalar(petal%2?.82:1.);dummy.updateMatrix();matrix.multiplyMatrices(flowerMatrix,dummy.matrix);mesh.setMatrixAt(flower*9+petal,matrix);
      phases.push(flower*.8);tints.push(...[[1.,.22,.46],[.65,.3,1.],[.96,.6,.35]][flower%3]);
    }
    for(let j=0;j<30;j++){pollen.push(x+(rand()-.5)*6,y+(rand()-.5)*6,z+(rand()-.5)*7);pollenSeeds.push(rand());pollenColors.push(1.,.6+rand()*.3,.15+rand()*.3);}
  }
  attributes(geometry,phases,tints);mesh.frustumCulled=false;w.scene.add(mesh);
  const dustUniforms={uTime:{value:0},uHighs:{value:0},uPixels:{value:1}},dust=stars(pollen,pollenSeeds,pollenColors,dustUniforms);w.scene.add(dust);
  w.update=(time,music)=>{uniforms.uTime.value=time;uniforms.uMids.value=music.mids;mesh.rotation.z=Math.sin(time*.025)*.06;dustUniforms.uTime.value=time;dustUniforms.uHighs.value=music.highs;dust.rotation.z=Math.sin(time*.017)*.035;};w.resize=pixels=>{dustUniforms.uPixels.value=pixels;};return w;
}

function lasers(){
  const w=world(),rand=random(63),points=[],colors=[];
  for(let depth=0;depth<9;depth++)for(let side=0;side<6;side++){
    const radius=7.5,z=-7-depth*9,angle=side/6*TAU,angle2=(side+1)/6*TAU;
    points.push(Math.cos(angle)*radius,Math.sin(angle)*radius,z,Math.cos(angle2)*radius,Math.sin(angle2)*radius,z);
    const c=depth%2?[.8,.08,.4]:[.08,.75,.64];colors.push(...c,...c);
  }
  const tunnel=lineSet(points,colors,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.72,blending:THREE.AdditiveBlending}));w.scene.add(tunnel);
  const g=new THREE.InstancedBufferGeometry(),plane=new THREE.PlaneGeometry(1,1);g.index=plane.index;g.attributes.position=plane.attributes.position;g.attributes.uv=plane.attributes.uv;
  const starts=[],ends=[],phases=[],lags=[],tints=[],count=54;
  for(let beam=0;beam<count;beam++)for(let trail=0;trail<3;trail++){
    const fan=Math.floor(beam/18),spread=(beam%18-8.5)/8.5;
    starts.push([-7,11,5][fan],[-5,-3,8][fan],[-10,-27,-45][fan]);
    ends.push(spread*24,12-fan*9,-68+fan*12);phases.push(fan*2+beam%18*.02);lags.push(trail*.16);
    tints.push(...[[.08,1.,.75],[1.,.06,.35],[.5,.3,1.]][fan]);
  }
  g.setAttribute('aStart',new THREE.InstancedBufferAttribute(new Float32Array(starts),3));g.setAttribute('aEnd',new THREE.InstancedBufferAttribute(new Float32Array(ends),3));
  g.setAttribute('aPhase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));g.setAttribute('aLag',new THREE.InstancedBufferAttribute(new Float32Array(lags),1));g.setAttribute('aTint',new THREE.InstancedBufferAttribute(new Float32Array(tints),3));g.instanceCount=count*3;
  const uniforms={uTime:{value:0},uHeight:{value:600}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 aStart,aEnd,aTint;attribute float aPhase,aLag;uniform float uTime,uHeight;varying vec2 vUv;varying vec3 vTint;varying float vAlpha;
      void main(){float t=uTime-aLag,sweep=.48*sin(t*.18+aPhase);vec3 end=aEnd;end.xy=mat2(cos(sweep),-sin(sweep),sin(sweep),cos(sweep))*end.xy;
        end.y+=4.*sin(t*.13+aPhase);vec4 a=projectionMatrix*modelViewMatrix*vec4(aStart,1.),b=projectionMatrix*modelViewMatrix*vec4(end,1.);
        vec2 delta=b.xy/b.w-a.xy/a.w;vec2 normal=normalize(vec2(-delta.y,delta.x));vec4 p=mix(a,b,uv.y);
        p.xy+=normal*(uv.x-.5)*12./uHeight*p.w;gl_Position=p;vUv=uv;vTint=aTint;vAlpha=aLag==0.?1.:.13;}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vTint;varying float vAlpha;void main(){float x=abs(vUv.x-.5)*2.;float light=exp(-x*x*35.)*.7+exp(-x*x*5.)*.14;float endFade=smoothstep(0.,.03,vUv.y)*(1.-smoothstep(.9,1.,vUv.y));gl_FragColor=vec4(vTint,light*endFade*vAlpha);}`});
  const beams=new THREE.Mesh(g,material);beams.frustumCulled=false;w.scene.add(beams);plane.dispose();
  w.update=time=>{uniforms.uTime.value=time;tunnel.rotation.z=Math.sin(time*.04)*.15;tunnel.position.x=Math.sin(time*.06)*.7;};
  w.resize=(pixels,height)=>{uniforms.uHeight.value=height;};return w;
}

export function createKaleidoWorlds(){
  const texture=noiseTexture(),worlds=[mandala(),crystals(),cosmos(texture),flowers(),lasers()];
  return {worlds,dispose(){const geometries=new Set(),materials=new Set();for(const w of worlds)w.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();texture.dispose();}};
}
