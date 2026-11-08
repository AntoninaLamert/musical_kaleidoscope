import * as THREE from '../vendor/three.module.js';

export const KALEIDO_STYLES = ['Мандала', 'Кристаллы', 'Космос', 'Цветы', 'Лазерное шоу'];

import { kaleidoFragment } from './kaleido-shaders.js';
import { createKaleidoWorlds } from './kaleido-worlds.js';

export class Kaleidoscope {
  constructor(onChange = () => {}) {
    this.onChange=onChange;this.style=0;this.autoMode=true;
    this.weights=new Float32Array([1,0,0,0,0]);this.fromWeights=this.weights.slice();
    this.transition=1;this.elapsed=0;this.interval=22+Math.random()*4;this.bag=[];this.lastBeat=0;this.time=0;
    this.intensity=.62;this.intensityTarget=.62;
    this.symmetryTarget=12;this.symmetryTransition=1;
    // A multi-second envelope supports the background mood, never beat pulses.
    this.ambient={bass:0,mids:0,highs:0,energy:0};
    this.colors=[new THREE.Color(),new THREE.Color()];
    this.palettes=[[0xf5ad64,0x50d5c5],[0x72c6ff,0xb697ff],[0x6b8bff,0xc25ab5],[0xff86aa,0xb6ad75],[0x43f6da,0xff4eb9]].map(pair=>pair.map(c=>new THREE.Color(c)));
    this.uniforms={uAspect:{value:1},uSectors:{value:12},uSectorsFrom:{value:12},uSymmetryMix:{value:1},uIntensity:{value:.62},uWeights:{value:this.weights},uTime:{value:0},uMood:{value:0},uViewScale:{value:1},uShowHue:{value:0}};
    this.targets=Array.from({length:5},()=>new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}));
    for(let i=0;i<5;i++)this.uniforms['world'+i]={value:this.targets[i].texture};
    this.worldSet=createKaleidoWorlds();
    this.camera=new THREE.PerspectiveCamera(48,1,.1,180);
    this.camera.position.set(0,0,8);this.lookAt=new THREE.Vector3(0,0,-32);
    this.width=1;this.height=1;
    this.geometry=new THREE.PlaneGeometry(2,2);
    this.backgroundMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,depthWrite:false,depthTest:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:kaleidoFragment});
    this.background=new THREE.Mesh(this.geometry,this.backgroundMaterial);this.background.frustumCulled=false;this.background.renderOrder=-1000;
    this.screenScene=new THREE.Scene();this.screenScene.add(this.background);
    this.screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.artTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    this.displayMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{map:{value:this.artTarget.texture}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=texture2D(map,vUv);}'});
    this.displayScene=new THREE.Scene();this.displayScene.add(new THREE.Mesh(this.geometry,this.displayMaterial));
    this.mixColors();this.notify();
  }
  notify(){this.onChange({style:this.style,auto:this.autoMode});}
  select(index,manual=true){
    if(index<0||index>=5)return;
    if(manual)this.autoMode=false;
    if(index!==this.style){this.fromWeights.set(this.weights);this.style=index;this.transition=0;}
    this.elapsed=0;this.interval=22+Math.random()*4;this.notify();
  }
  setAuto(enabled){this.autoMode=enabled;this.elapsed=0;this.interval=22+Math.random()*4;this.notify();}
  setSymmetry(value){if(Number.isFinite(value))this.symmetryTarget=Math.max(4,Math.min(24,Math.round(value/2)*2));}
  setIntensity(value){this.intensityTarget=Math.max(0,Math.min(1,value));}
  nextStyle(){
    this.bag=this.bag.filter(style=>style!==this.style);
    if(!this.bag.length){
      this.bag=[0,1,2,3,4].filter(style=>style!==this.style);
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
    }
    return this.bag.pop();
  }
  mixColors(){
    for(let channel=0;channel<2;channel++){
      const color=this.colors[channel];color.setRGB(0,0,0);
      for(let i=0;i<5;i++){const p=this.palettes[i][channel],w=this.weights[i];color.r+=p.r*w;color.g+=p.g*w;color.b+=p.b*w;}
    }
  }
  update(dt,signal,time){
    const freshBeat=signal.beatId!==this.lastBeat;
    this.lastBeat=signal.beatId;
    if(this.autoMode&&!this.externallyDirected){
      this.elapsed+=dt;
      const confident=freshBeat&&signal.active&&signal.impulses?.some(event=>event.id===signal.beatId&&event.confidence>=.65);
      if(this.elapsed>=this.interval&&(!signal.active||confident||this.elapsed>=this.interval+2.5))this.select(this.nextStyle(),false);
    }
    this.transition=Math.min(1,this.transition+dt/2.6);
    const blend=this.transition*this.transition*(3-2*this.transition);
    for(let i=0;i<5;i++)this.weights[i]=this.fromWeights[i]*(1-blend)+(i===this.style?blend:0);
    this.intensity+=(this.intensityTarget-this.intensity)*(1-Math.exp(-dt*7));
    // Crossfade two valid mirror tilings. Never interpolate a fractional sector
    // count: that would leave an unmatched seam at the angular wraparound.
    if(this.symmetryTransition>=1&&this.symmetryTarget!==this.uniforms.uSectors.value){
      this.uniforms.uSectorsFrom.value=this.uniforms.uSectors.value;
      this.uniforms.uSectors.value=this.symmetryTarget;this.symmetryTransition=0;
    }
    this.symmetryTransition=Math.min(1,this.symmetryTransition+dt/.24);
    this.uniforms.uSymmetryMix.value=this.symmetryTransition*this.symmetryTransition*(3-2*this.symmetryTransition);
    this.mixColors();
    for(const key in this.ambient)this.ambient[key]+=(signal[key]-this.ambient[key])*(1-Math.exp(-dt*.35));
    this.time=time;
    this.uniforms.uTime.value=time;this.uniforms.uMood.value=this.ambient.mids;
    this.uniforms.uIntensity.value=this.intensity;
    // Sideways parallax, no forward zoom or radial expansion on a beat.
    this.camera.position.x=Math.sin(time*.037)*.65;
    this.camera.position.y=Math.cos(time*.029)*.28;
    this.camera.lookAt(this.lookAt);
  }
  resize(width,height,pixelRatio,quality){
    const scale=[.75,.68,.60,.55][quality];const factor=Math.min(pixelRatio*scale,1440/width);
    this.width=Math.max(1,Math.round(width*factor));this.height=Math.max(1,Math.round(height*factor));
    this.uniforms.uAspect.value=width/height;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  }
  render(renderer){
    for(let i=0;i<5;i++)if(this.weights[i]>.001){
      const target=this.targets[i],world=this.worldSet.worlds[i];
      if(target.width!==this.width||target.height!==this.height)target.setSize(this.width,this.height);
      world.resize(this.width/1100,this.height);world.update(this.time,this.ambient);
      renderer.setRenderTarget(target);renderer.render(world.scene,this.camera);
    }else if(this.targets[i].width>1){this.targets[i].setSize(1,1);}
  }
  renderBackdrop(renderer){
    if(this.artTarget.width!==this.width||this.artTarget.height!==this.height)this.artTarget.setSize(this.width,this.height);
    renderer.setRenderTarget(this.artTarget);renderer.render(this.screenScene,this.screenCamera);
    renderer.setRenderTarget(null);renderer.render(this.displayScene,this.screenCamera);
  }
  dispose(){for(const target of this.targets)target.dispose();this.artTarget.dispose();this.displayMaterial.dispose();this.worldSet.dispose();this.geometry.dispose();this.backgroundMaterial.dispose();}
}
