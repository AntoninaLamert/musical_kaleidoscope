import * as THREE from '../vendor/three.module.js';
import { createMorphGeometry } from './shapes.js';
import { Kaleidoscope } from './kaleidoscope.js';
import { DepthAtmosphere } from './atmosphere.js';
import { KaleidoArtist } from './artist.js';

const vertex = `
  attribute vec3 targetPosition;
  attribute vec3 barycentric;
  uniform float uMorph, uTime, uBass;
  varying vec3 vBary, vPosition, vView;
  void main(){
    vec3 p=mix(position,targetPosition,uMorph);
    float waves=sin(p.y*8.+uTime*.8)*sin(p.x*6.-uTime*.5)*sin(p.z*7.+uTime*.4);
    p*=1.+waves*(.026+uBass*.055);
    vPosition=p; vBary=barycentric;
    vec4 view=modelViewMatrix*vec4(p,1.); vView=view.xyz;
    gl_Position=projectionMatrix*view;
  }
`;
const fragment = `
  uniform float uTime, uMids, uEnergy, uLoudness, uInner, uBeat,uShowLight;
  uniform vec3 uColorA,uColorB;
  varying vec3 vBary,vPosition,vView;
  vec3 palette(float t){
    vec3 teal=vec3(.11,.95,.75), violet=vec3(.48,.20,1.), ice=vec3(.52,.82,1.);
    vec3 c=mix(mix(teal,uColorA,.45),mix(violet,uColorB,.45),smoothstep(-.65,.75,sin(t)));
    return mix(c,ice,pow(max(0.,cos(t*1.4)),6.)*.65);
  }
  void main(){
    vec3 n=normalize(cross(dFdx(vView),dFdy(vView)));
    float facing=abs(dot(n,normalize(-vView)));
    float fresnel=pow(1.-facing,2.);
    vec3 d=fwidth(vBary);
    vec3 a=smoothstep(d*.25,d*1.15,vBary);
    float edge=1.-min(min(a.x,a.y),a.z);
    float flow=vPosition.y*1.5+vPosition.x*.65+vPosition.z*.6+uTime*.15+uMids*1.2;
    vec3 color=palette(flow);
    float ribbon=pow(.5+.5*sin(vPosition.y*11.+vPosition.x*7.+vPosition.z*8.-uTime*.55),12.);
    float light=pow(max(0.,dot(n,normalize(vec3(-.6,.9,1.)))),5.);
    float detail=.4+.6*pow(.5+.5*sin(vPosition.y*18.+vPosition.x*13.),2.);
    vec3 surface=color*(.075+fresnel*.24+light*.12+ribbon*.14);
    surface+=color*edge*(.21+detail*.33+fresnel*.85)*(1.+uLoudness*.7);
    surface+=vec3(.55,.95,.86)*light*edge*.25;
    surface*=1.+uEnergy*.35;
    surface*=1.+uBeat*1.15;
    surface+=color*uBeat*(.04+edge*.16);
    gl_FragColor=vec4(surface*(1.-uInner*.5)*uShowLight,.67-uInner*.36);
  }
`;

export class Visualizer {
  constructor(container, onQuality, onStyleChange) {
    this.container=container;
    this.onQuality=onQuality;
    this.time=0;
    this.morphTime=1;
    this.quality=0;
    this.slowSeconds=0;
    this.frameAverage=1/60;
    this.auto=1;
    this.lastInput=-10;
    this.rotation={x:.16,y:.2};
    this.pointer=null;
    this.show={motion:1,light:1,atmosphere:1,hue:0,accent:0,arc:0,zoom:1,fov:37};
    this.motionTime=0;this.cameraPhase=0;this.cameraBlend=0;this.manualZoom=1;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x000000,1);
    this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    this.renderer.debug.checkShaderErrors=true;
    container.append(this.renderer.domElement);
    this.scene=new THREE.Scene();
    this.kaleidoscope=new Kaleidoscope(onStyleChange);
    this.camera=new THREE.PerspectiveCamera(37,1,.1,60);
    this.camera.position.set(0,0,7.6);
    this.group=new THREE.Group();
    this.scene.add(this.group);
    const {geometry,targets}=createMorphGeometry();
    this.geometry=geometry;this.targets=targets;
    this.uniforms={uMorph:{value:1},uTime:{value:0},uBass:{value:0},uBeat:{value:0},uMids:{value:0},uEnergy:{value:0},uLoudness:{value:0},uInner:{value:0}};
    this.uniforms.uShowLight={value:1};this.uniforms.uColorA={value:this.kaleidoscope.colors[0]};this.uniforms.uColorB={value:this.kaleidoscope.colors[1]};
    const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:this.uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    // Additive surfaces with depthWrite=false do not need Three's separate
    // back/front transparent passes. Both sides still render in one draw.
    material.forceSinglePass=true;
    this.mesh=new THREE.Mesh(geometry,material);
    this.group.add(this.mesh);
    const innerUniforms={...this.uniforms,uInner:{value:1}};
    this.inner=new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:innerUniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.inner.material.forceSinglePass=true;
    this.inner.scale.setScalar(.89);
    this.inner.rotation.y=.08;
    this.group.add(this.inner);
    this.createAtmosphere();
    this.createParticles();
    this.createTrails();
    this.createBeatEffects();
    this.depthAtmosphere=new DepthAtmosphere(this.scene,this.kaleidoscope.colors);
    this.createPostprocessing();
    this.inkMask=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
    this.maskScene=new THREE.Scene();
    this.maskMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:'void main(){gl_FragColor=vec4(1.);}',uniforms:this.uniforms,side:THREE.DoubleSide});
    this.maskMesh=new THREE.Mesh(this.geometry,this.maskMaterial);this.maskMesh.matrixAutoUpdate=false;this.maskScene.add(this.maskMesh);
    this.kaleidoscope.uniforms.uSculptureMask={value:this.inkMask.texture};
    this.artist=new KaleidoArtist(this);
    this.bindPointer();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  setShape(name) {
    if (!this.targets[name]) return;
    const source=this.geometry.attributes.position;
    const destination=this.geometry.attributes.targetPosition;
    const amount=this.uniforms.uMorph.value;
    // Only update CPU buffers on selection, including interrupted morphs.
    for(let i=0;i<source.array.length;i++) source.array[i]+=(destination.array[i]-source.array[i])*amount;
    destination.array.set(this.targets[name]);
    source.needsUpdate=destination.needsUpdate=true;
    this.morphTime=0;
    this.uniforms.uMorph.value=0;
  }
  createAtmosphere() {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const context=canvas.getContext('2d');
    const gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,.6)');
    gradient.addColorStop(.2,'rgba(255,255,255,.25)');
    gradient.addColorStop(.6,'rgba(255,255,255,.05)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);
    this.glowTexture=new THREE.CanvasTexture(canvas);
    this.halos=[];
    for(const [x,y,z,size,color,opacity] of [[-.7,-.2,-2,8,0x148a75,.22],[1.2,.7,-2.8,6,0x55228d,.24],[0,0,-1,4,0x42b9aa,.09],[-3,1,-6,2,0x345b76,.14],[3,-1,-5,1.3,0x7157af,.12]]) {
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false}));
      sprite.position.set(x,y,z);sprite.scale.set(size,size,1);sprite.userData.base=opacity;this.scene.add(sprite);this.halos.push(sprite);
    }
  }
  createParticles() {
    const count=1800,positions=new Float32Array(count*3),seeds=new Float32Array(count);
    let randomState=73;
    const random=()=>{randomState=(randomState*1664525+1013904223)>>>0;return randomState/4294967296;};
    for(let i=0;i<count;i++) {
      const r=1.8+Math.pow(random(),1.8)*7,angle=random()*Math.PI*2,y=(random()-.5)*8;
      positions.set([Math.cos(angle)*r,y,Math.sin(angle)*r-2],i*3);seeds[i]=random();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    this.particleUniforms={uTime:{value:0},uHighs:{value:0},uEnergy:{value:0},uPixelRatio:{value:1},uColorA:{value:this.kaleidoscope.colors[0]},uColorB:{value:this.kaleidoscope.colors[1]}};
    const material=new THREE.ShaderMaterial({uniforms:this.particleUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float seed;uniform float uTime,uHighs,uEnergy,uPixelRatio;varying float vAlpha,vSeed;
      void main(){vec3 p=position;float t=uTime*(.025+seed*.018);p.x+=sin(t+seed*30.)*.35;p.y+=cos(t*.8+seed*40.)*.25;p.z+=sin(t*.7+seed*17.)*.65;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.4+pow(seed,10.)*13.+uHighs*2.)*uPixelRatio*6./max(.2,-mv.z),1.,28.);
      vAlpha=(.12+seed*.32)*( .65+.35*sin(uTime*(.5+uHighs)+seed*70.))*smoothstep(.3,2.,-mv.z);vSeed=seed;}`,
      fragmentShader:`varying float vAlpha,vSeed;uniform vec3 uColorA,uColorB;void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;
      float soft=exp(-r*r*4.);float spark=pow(max(0.,1.-min(abs(p.x),abs(p.y))*16.),8.)*exp(-r*4.);
      float a=(soft+spark*step(.9,vSeed)*.7)*(1.-smoothstep(.6,1.,r));vec3 c=mix(uColorA,uColorB,vSeed);gl_FragColor=vec4(c,a*vAlpha);}`});
    this.particles=new THREE.Points(geometry,material);this.scene.add(this.particles);
  }
  createTrails() {
    this.trails=new THREE.Group();
    for(let ring=0;ring<3;ring++) {
      const points=[],colors=[];
      for(let i=0;i<240;i++) {
        const t=i/239,angle=t*Math.PI*2;
        const r=2.05+ring*.2;
        points.push(new THREE.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,.08*Math.sin(angle*3)));
        const c=new THREE.Color().setRGB(.09,.42,.35).multiplyScalar(.15+.6*Math.pow(t,3));colors.push(c.r,c.g,c.b);
      }
      const geometry=new THREE.BufferGeometry().setFromPoints(points);geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
      line.rotation.set(1.05+ring*.18,.4-ring*.35,ring*.8);this.trails.add(line);
    }
    this.scene.add(this.trails);
  }
  createBeatEffects() {
    // Allocate the entire pool once. RhythmClock provides ages and strengths
    // for every effect from the same audio event, including overlapping beats.
    this.burstSlots=Array.from({length:8},()=>new THREE.Vector2(-1,0));
    this.beatWaves=[];
    const waveGeometry=new THREE.PlaneGeometry(2,2);
    for(let i=0;i<8;i++) {
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
        uniforms:{age:{value:-1},strength:{value:0},uColorA:{value:this.kaleidoscope.colors[0]},uColorB:{value:this.kaleidoscope.colors[1]}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec2 vUv;uniform float age,strength;uniform vec3 uColorA,uColorB;void main(){
          float r=length(vUv-.5)*2.;float ring=exp(-pow((r-.84)/.010,2.));
          float wake=exp(-pow((r-.82)/.04,2.))*.06;
          float envelope=smoothstep(0.,.016,age)*exp(-age*7.5)*strength;
          vec3 color=mix(uColorA,uColorB,vUv.y);
          gl_FragColor=vec4(color*1.1,(ring+wake)*envelope*.13);
        }`});
      const wave=new THREE.Mesh(waveGeometry,material);
      wave.position.z=-.15;wave.visible=false;this.scene.add(wave);this.beatWaves.push(wave);
    }
    const count=8*128,positions=new Float32Array(count*3),slots=new Float32Array(count),seeds=new Float32Array(count);
    for(let i=0;i<count;i++) {
      const j=i%128,y=1-2*(j+.5)/128,phi=j*2.39996323,r=Math.sqrt(1-y*y);
      positions.set([r*Math.cos(phi),y,r*Math.sin(phi)],i*3);
      // Per-particle seeds let quality reduction thin every pool equally.
      slots[i]=Math.floor(i/128);seeds[i]=(j*.61803398875)%1;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('slot',new THREE.BufferAttribute(slots,1));
    geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{bursts:{value:this.burstSlots},uPixelRatio:{value:1},density:{value:1},uColorA:{value:this.kaleidoscope.colors[0]},uColorB:{value:this.kaleidoscope.colors[1]}},
      vertexShader:`attribute float slot,seed;uniform vec2 bursts[8];uniform float uPixelRatio,density;varying float vAlpha,vSeed;
        void main(){vec2 burst=bursts[int(slot)];float age=burst.x;float strength=burst.y;
          float visibleBurst=step(0.,age)*step(age,.65)*step(seed,density);
          float radius=1.15+max(age,0.)*(.8+seed*.9)*( .65+strength*.6);
          vec4 mv=modelViewMatrix*vec4(position*radius,1.);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((2.+seed*2.5)*uPixelRatio*6./max(.1,-mv.z),1.,18.);
          vAlpha=visibleBurst*strength*.35*smoothstep(0.,.016,age)*exp(-max(age,0.)*6.5);vSeed=seed;
        }`,
      fragmentShader:`varying float vAlpha,vSeed;uniform vec3 uColorA,uColorB;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*4.)*(1.-smoothstep(.7,1.,r));
        vec3 color=mix(uColorA,uColorB,vSeed);gl_FragColor=vec4(color*1.6,a*vAlpha);}`});
    this.beatParticles=new THREE.Points(geometry,material);
    this.beatParticles.frustumCulled=false;
    this.scene.add(this.beatParticles);
  }
  createPostprocessing() {
    const options={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false};
    this.sceneTarget=new THREE.WebGLRenderTarget(1,1,{...options,depthBuffer:true});
    this.blurA=new THREE.WebGLRenderTarget(1,1,options);
    this.blurB=new THREE.WebGLRenderTarget(1,1,options);
    this.postScene=new THREE.Scene();this.postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const vs='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    this.blurMaterial=new THREE.ShaderMaterial({vertexShader:vs,depthTest:false,depthWrite:false,uniforms:{tSource:{value:null},direction:{value:new THREE.Vector2()}},fragmentShader:`varying vec2 vUv;uniform sampler2D tSource;uniform vec2 direction;void main(){vec3 c=texture2D(tSource,vUv).rgb*.227027;c+=texture2D(tSource,vUv+direction*1.384615).rgb*.316216;c+=texture2D(tSource,vUv-direction*1.384615).rgb*.316216;c+=texture2D(tSource,vUv+direction*3.230769).rgb*.070270;c+=texture2D(tSource,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}`});
    this.composite=new THREE.ShaderMaterial({vertexShader:vs,depthTest:false,depthWrite:false,uniforms:{tScene:{value:this.sceneTarget.texture},tBloom:{value:this.blurB.texture},strength:{value:.65}},fragmentShader:`varying vec2 vUv;uniform sampler2D tScene,tBloom;uniform float strength;void main(){vec3 c=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*strength;c=vec3(1.)-exp(-c*1.15);c=pow(c,vec3(.86));float vignette=1.-.34*pow(length((vUv-.5)*1.25),2.);gl_FragColor=vec4(c*vignette,1.);}`});
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.composite);this.postScene.add(this.quad);
    // Background is composited separately, so the sculpture's beat-dependent
    // bloom cannot flash or brighten the entire kaleidoscope.
    this.composite.transparent=true;this.composite.blending=THREE.AdditiveBlending;
  }
  bindPointer() {
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0||this.artist.enabled)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);this.lastInput=this.time;});
    canvas.addEventListener('pointermove',e=>{if(!this.pointer||this.pointer.id!==e.pointerId)return;this.rotation.y+=(e.clientX-this.pointer.x)*.006;this.rotation.x+=(e.clientY-this.pointer.y)*.006;this.pointer.x=e.clientX;this.pointer.y=e.clientY;this.lastInput=this.time;});
    const release=()=>{this.pointer=null;this.lastInput=this.time;};
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    canvas.addEventListener('wheel',e=>{if(this.artist.enabled)return;e.preventDefault();this.manualZoom=Math.max(.94,Math.min(1.45,this.manualZoom+e.deltaY*.0006));this.lastInput=this.time;},{passive:false});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();document.querySelector('#scene-error').hidden=false;document.querySelector('#scene-error').textContent='Графический контекст потерян. Обновите страницу, чтобы восстановить сцену.';});
  }
  resize() {
    const w=this.container.clientWidth,h=this.container.clientHeight;
    const ratios=[1.6,1.25,1,.8];
    const ratio=Math.min(devicePixelRatio||1,ratios[this.quality]);
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;
    const mobile=window.matchMedia('(max-width:760px)').matches;
    this.baseDistance=mobile?10.4:Math.max(7.6,6.2*h/w);
    const fitHalf=Math.min(this.camera.fov*Math.PI/360,Math.atan(Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect));
    this.baseDistance=Math.max(this.baseDistance,2.8/Math.sin(fitHalf));
    this.camera.position.z=this.baseDistance;
    // The canvas now occupies the free space between controls. Both the
    // sculpture and the kaleidoscope use its exact geometric centre.
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.sceneTarget.setSize(Math.round(w*ratio),Math.round(h*ratio));
    const bloomScale=this.quality>1?.22:.35;
    this.blurA.setSize(Math.max(1,Math.round(w*ratio*bloomScale)),Math.max(1,Math.round(h*ratio*bloomScale)));
    this.blurB.setSize(this.blurA.width,this.blurA.height);
    this.particleUniforms.uPixelRatio.value=ratio;
    this.beatParticles.material.uniforms.uPixelRatio.value=ratio;
    this.kaleidoscope.resize(w,h,ratio,this.quality);
    this.inkMask.setSize(Math.max(1,Math.round(w*ratio*.6)),Math.max(1,Math.round(h*ratio*.6)));
  }
  update(dt,signal,rawDt) {
    this.time+=dt*(this.reducedMotion?.45:1);
    // Keep style timing close to wall time even when adaptive quality is active.
    this.kaleidoscope.update(Math.min(rawDt,.25),signal,this.time);
    const show=this.show;
    for(const color of this.kaleidoscope.colors)color.offsetHSL(show.hue,0,0);
    this.kaleidoscope.uniforms.uShowHue.value=show.hue;
    this.motionTime+=dt*show.motion;this.cameraPhase+=dt*.075;
    const cameraAllowed=!this.pointer&&!this.artist.pointer&&this.time-this.lastInput>5;
    this.cameraBlend+=((cameraAllowed?1:0)-this.cameraBlend)*(1-Math.exp(-dt*.8));
    if(cameraAllowed)this.manualZoom+=(1-this.manualZoom)*(1-Math.exp(-dt*.3));
    const cameraWeight=this.cameraBlend*(this.reducedMotion?.2:1);
    const desiredFov=37+(show.fov-37)*cameraWeight;
    this.camera.fov+=(desiredFov-this.camera.fov)*(1-Math.exp(-dt*1.5));
    this.camera.updateProjectionMatrix();
    const half=Math.min(this.camera.fov*Math.PI/360,Math.atan(Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect));
    const safe=2.8/Math.sin(half);
    const distance=Math.max(safe,this.baseDistance*(1+(show.zoom-1)*cameraWeight)*this.manualZoom);
    this.camera.position.z+=(distance-this.camera.position.z)*(1-Math.exp(-dt*1.1));
    this.camera.position.z=Math.max(safe,this.camera.position.z);
    const arc=show.arc*cameraWeight;
    this.camera.position.x+=(Math.sin(this.cameraPhase)*arc-this.camera.position.x)*(1-Math.exp(-dt));
    this.camera.position.y+=(Math.sin(this.cameraPhase*.7)*arc*.35-this.camera.position.y)*(1-Math.exp(-dt));
    this.camera.lookAt(0,0,0);
    this.kaleidoscope.uniforms.uViewScale.value=this.camera.position.z/this.baseDistance*Math.tan(this.camera.fov*Math.PI/360)/Math.tan(37*Math.PI/360);
    this.artist.update(dt,signal);
    this.depthAtmosphere.update(this.time,signal);
    this.depthAtmosphere.uniforms.uShowIntensity.value=show.atmosphere;
    this.depthAtmosphere.uniforms.uBeat.value=signal.beat*(1+show.accent*.4);
    this.morphTime=Math.min(1,this.morphTime+dt/2.2);
    this.uniforms.uMorph.value=this.morphTime*this.morphTime*(3-2*this.morphTime);
    this.uniforms.uTime.value=this.time;
    this.uniforms.uBass.value=signal.bass;
    this.uniforms.uBeat.value=signal.beat*(1+show.accent*.4);
    this.uniforms.uShowLight.value=show.light;
    this.group.scale.setScalar(1+.24*signal.beat);
    for(let i=0;i<this.burstSlots.length;i++) {
      const impulse=signal.impulses?.[i];
      const age=impulse?.strength?impulse.age:-1,strength=(impulse?.strength||0)*Math.min(1.4,show.atmosphere*(1+show.accent*.2));
      this.burstSlots[i].set(age,strength);
      const wave=this.beatWaves[i];
      wave.visible=age>=0&&age<.55&&strength>0;
      if(wave.visible){wave.scale.setScalar(1.6+age*(.75+strength*.35));wave.material.uniforms.age.value=age;wave.material.uniforms.strength.value=strength;}
    }
    this.uniforms.uMids.value=signal.mids;
    this.uniforms.uEnergy.value=signal.energy;
    this.uniforms.uLoudness.value=signal.loudness;
    const autoTarget=this.pointer||this.time-this.lastInput<1?0:1;
    this.auto+=(autoTarget-this.auto)*(1-Math.exp(-dt*2));
    this.rotation.y+=dt*.075*this.auto*(this.reducedMotion?.25:1)*(1+signal.energy*.4)*show.motion;
    this.group.rotation.y+=(this.rotation.y-this.group.rotation.y)*(1-Math.exp(-dt*8));
    this.group.rotation.x+=(this.rotation.x-this.group.rotation.x)*(1-Math.exp(-dt*8));
    this.group.rotation.z=Math.sin(this.time*.12)*.06;
    this.particleUniforms.uTime.value=this.motionTime;
    this.particleUniforms.uHighs.value=signal.highs;
    this.particleUniforms.uEnergy.value=signal.energy;
    this.particles.rotation.y=this.time*.008;
    this.trails.rotation.y=this.time*.025;this.trails.rotation.z=this.time*.015;
    for(let i=0;i<this.halos.length;i++){
      const halo=this.halos[i];halo.material.color.copy(this.kaleidoscope.colors[i%2]).multiplyScalar(.45);
      halo.material.opacity=halo.userData.base*(1+signal.loudness*.6+signal.beat*.1);
    }
    for(let i=0;i<this.trails.children.length;i++)this.trails.children[i].material.color.copy(this.kaleidoscope.colors[i%2]);
    this.composite.uniforms.strength.value=.6+signal.loudness*.4+signal.beat*.06;
    // Hysteresis: degrade only after sustained slow frames, never while hidden.
    if(!document.hidden&&rawDt<1&&this.time>5){
      this.frameAverage=this.frameAverage*.97+rawDt*.03;
      this.slowSeconds=this.frameAverage>1/38?this.slowSeconds+dt:Math.max(0,this.slowSeconds-dt);
      if(this.slowSeconds>4&&this.quality<3){
        this.quality++;this.slowSeconds=0;this.frameAverage=1/60;
        this.particles.geometry.setDrawRange(0,[1800,1300,900,600][this.quality]);
        this.inner.visible=this.quality<3;
        this.beatParticles.material.uniforms.density.value=[1,.8,.6,.4][this.quality];
        this.depthAtmosphere.setQuality(this.quality);
        this.resize();this.onQuality(['ВЫСОКОЕ','СБАЛАНСИРОВАННОЕ','ЭКОНОМНОЕ','МИНИМАЛЬНОЕ'][this.quality]);
      }
    }
    this.kaleidoscope.render(this.renderer);
    this.renderer.setRenderTarget(this.sceneTarget);this.renderer.render(this.scene,this.camera);
    if(this.artist.hasInk){this.maskMesh.matrix.copy(this.group.matrixWorld);this.renderer.setRenderTarget(this.inkMask);this.renderer.render(this.maskScene,this.camera);}
    this.quad.material=this.blurMaterial;
    this.blurMaterial.uniforms.tSource.value=this.sceneTarget.texture;
    this.blurMaterial.uniforms.direction.value.set(2/this.blurA.width,0);
    this.renderer.setRenderTarget(this.blurA);this.renderer.render(this.postScene,this.postCamera);
    this.blurMaterial.uniforms.tSource.value=this.blurA.texture;
    this.blurMaterial.uniforms.direction.value.set(0,2/this.blurA.height);
    this.renderer.setRenderTarget(this.blurB);this.renderer.render(this.postScene,this.postCamera);
    this.quad.material=this.composite;
    this.kaleidoscope.renderBackdrop(this.renderer);
    this.renderer.autoClear=false;this.renderer.render(this.postScene,this.postCamera);this.renderer.autoClear=true;
  }
  dispose(){
    this.resizeObserver.disconnect();this.kaleidoscope.background.removeFromParent();
    this.artist.dispose();this.maskMaterial.dispose();this.inkMask.dispose();
    this.kaleidoscope.dispose();this.depthAtmosphere.dispose();
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
    this.glowTexture.dispose();this.sceneTarget.dispose();this.blurA.dispose();this.blurB.dispose();
    this.quad.geometry.dispose();this.blurMaterial.dispose();this.composite.dispose();this.renderer.dispose();
  }
}

