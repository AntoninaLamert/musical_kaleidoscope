import * as THREE from '../vendor/three.module.js';

// Two persistent instanced layers: real world-space depth, one behind the body
// and a very faint one in front. No new textures/materials on style/beat changes.
export class DepthAtmosphere {
  constructor(scene, colors){
    this.meshes=[];
    // Periodic noise is baked once; large translucent patches use texture reads
    // instead of evaluating multiple noise octaves for every full-screen pixel.
    const size=128,data=new Uint8Array(size*size*4);
    const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
    const noise=(x,y,period)=>{
      const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
      const a=hash(ix%period,iy%period),b=hash((ix+1)%period,iy%period),c=hash(ix%period,(iy+1)%period),d=hash((ix+1)%period,(iy+1)%period);
      return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
    };
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const v=.6*noise(x/size*8,y/size*8,8)+.28*noise(x/size*16,y/size*16,16)+.12*noise(x/size*32,y/size*32,32),at=(y*size+x)*4;
      data[at]=data[at+1]=data[at+2]=Math.round(v*255);data[at+3]=255;
    }
    this.noiseTexture=new THREE.DataTexture(data,size,size);this.noiseTexture.wrapS=this.noiseTexture.wrapT=THREE.RepeatWrapping;
    this.noiseTexture.minFilter=this.noiseTexture.magFilter=THREE.LinearFilter;this.noiseTexture.needsUpdate=true;
    this.uniforms={uNoise:{value:this.noiseTexture},uTime:{value:0},uEnergy:{value:0},uBass:{value:0},uBeat:{value:0},uColorA:{value:colors[0]},uColorB:{value:colors[1]}};
    this.uniforms.uShowIntensity={value:1};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute vec3 offset;attribute vec2 size;attribute float seed;uniform float uTime;
      varying vec2 vUv;varying float vSeed;varying vec3 vWorld;
      void main(){vUv=uv;vSeed=seed;vec3 p=position;p.xy*=size;p+=offset;
        p.x+=sin(uTime*.055+seed*8.)*.35;p.y+=cos(uTime*.04+seed*6.)*.2;
        vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying vec2 vUv;varying float vSeed;varying vec3 vWorld;
      uniform float uTime,uEnergy,uBass,uBeat,uShowIntensity;uniform vec3 uColorA,uColorB;uniform sampler2D uNoise;
      void main(){vec2 p=vUv-.5;float edge=1.-smoothstep(.15,.52,length(p));
        vec2 flow=p*.42+vec2(uTime*.003,-uTime*.002)+vSeed;
        float mist=texture2D(uNoise,flow).r;
        mist=mix(mist,texture2D(uNoise,flow*1.7-vec2(uTime*.002,0.)).r,.35);
        float shaft=pow(max(0.,1.-abs(p.x+p.y*.36+.06*sin(uTime*.06+vSeed*5.))*8.),5.);
        float centre=mix(.12,1.,smoothstep(.65,1.8,length(vWorld.xy)));
        float foreground=vWorld.z>0.?.50:1.;
        float opacity=(pow(mist,2.)*.11+shaft*.085)*edge*centre*foreground*(1.+uEnergy*.5+uBass*.2+uBeat*.12);
        gl_FragColor=vec4(mix(uColorA,uColorB,fract(vSeed*2.7)),opacity*uShowIntensity);
      }`});
    const layers=[
      [[-2.5,1,-4,6,9,.12],[2.4,.5,-3.5,6,8,.48],[-.2,-1.8,-2.7,8,3,.82]],
      [[-2,-.5,1.8,3,5,.31],[2.1,.8,2.4,2.5,4,.67]],
    ];
    for(let layer=0;layer<layers.length;layer++){
      const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
      geometry.index=plane.index;geometry.attributes.position=plane.attributes.position;geometry.attributes.uv=plane.attributes.uv;
      geometry.setAttribute('offset',new THREE.InstancedBufferAttribute(new Float32Array(layers[layer].flatMap(v=>v.slice(0,3))),3));
      geometry.setAttribute('size',new THREE.InstancedBufferAttribute(new Float32Array(layers[layer].flatMap(v=>v.slice(3,5))),2));
      geometry.setAttribute('seed',new THREE.InstancedBufferAttribute(new Float32Array(layers[layer].map(v=>v[5])),1));
      geometry.instanceCount=layers[layer].length;
      const mesh=new THREE.Mesh(geometry,this.material);mesh.renderOrder=layer===0?-5:5;mesh.frustumCulled=false;
      scene.add(mesh);this.meshes.push(mesh);plane.dispose();
    }
  }
  update(time,signal){this.uniforms.uTime.value=time;this.uniforms.uEnergy.value=signal.energy;this.uniforms.uBass.value=signal.bass;this.uniforms.uBeat.value=signal.beat;}
  // Retain foreground AND background depth at every quality setting.
  setQuality(quality){this.meshes[0].geometry.instanceCount=quality===3?2:3;this.meshes[1].geometry.instanceCount=quality===3?1:2;}
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.geometry.dispose();}this.material.dispose();this.noiseTexture.dispose();}
}
