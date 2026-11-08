import * as THREE from '../vendor/three.module.js';

export class KaleidoArtist {
  constructor(view){
    this.view=view;this.enabled=false;this.hasInk=false;this.color='#9fffe3';this.width=5;
    this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=1024;
    this.ctx=this.canvas.getContext('2d');this.texture=new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.pointer=null;this.angle=0;this.listeners=[];
    const canvas=view.renderer.domElement;
    const listen=(type,fn)=>{canvas.addEventListener(type,fn);this.listeners.push([type,fn]);};
    listen('pointerdown',e=>{
      if(!this.enabled||e.button!==0)return;
      e.preventDefault();this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
      this.stroke(e.clientX,e.clientY,e.clientX+.01,e.clientY+.01);view.lastInput=view.time;
    });
    listen('pointermove',e=>{
      if(this.pointer?.id!==e.pointerId)return;
      for(const point of e.getCoalescedEvents?.()||[e]){
        this.stroke(this.pointer.x,this.pointer.y,point.clientX,point.clientY);
        this.pointer.x=point.clientX;this.pointer.y=point.clientY;
      }
      view.lastInput=view.time;
    });
    const release=e=>{if(this.pointer?.id===e.pointerId)this.pointer=null;};
    listen('pointerup',release);listen('pointercancel',release);listen('lostpointercapture',release);
    view.kaleidoscope.uniforms.uInk={value:this.texture};
    view.kaleidoscope.uniforms.uInkAngle={value:0};
    view.kaleidoscope.uniforms.uInkBeat={value:0};
  }
  setEnabled(value){this.enabled=value;this.pointer=null;this.view.pointer=null;this.view.renderer.domElement.classList.toggle('drawing',value);}
  stroke(x0,y0,x1,y1){
    const rect=this.view.renderer.domElement.getBoundingClientRect(),aspect=rect.width/rect.height;
    const sectors=this.view.kaleidoscope.uniforms.uSectors.value,sector=Math.PI*2/sectors;
    const zoom=this.view.kaleidoscope.uniforms.uViewScale.value;
    const project=(x,y)=>{
      const px=((x-rect.left)/rect.width-.5)*2*aspect*zoom,py=(.5-(y-rect.top)/rect.height)*2*zoom;
      const r=Math.hypot(px,py),theta=Math.atan2(py,px)-this.angle;
      const a=Math.abs(((theta+sector)%(sector*2)+sector*2)%(sector*2)-sector);
      return [(r*Math.cos(a)/6+.5)*1024,(.5-r*Math.sin(a)/6)*1024];
    };
    const steps=Math.min(128,Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/2)));
    const ctx=this.ctx;ctx.strokeStyle=this.color;ctx.lineCap=ctx.lineJoin='round';
    ctx.lineWidth=this.width*1024/(3*rect.height)*zoom;ctx.shadowColor=this.color;ctx.shadowBlur=ctx.lineWidth*2;
    ctx.beginPath();let p=project(x0,y0);ctx.moveTo(...p);
    for(let i=1;i<=steps;i++){p=project(x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps);ctx.lineTo(...p);}ctx.stroke();
    this.hasInk=true;this.texture.needsUpdate=true;
  }
  clear(){this.ctx.clearRect(0,0,1024,1024);this.texture.needsUpdate=true;this.hasInk=false;}
  update(dt,music){
    if(!this.enabled)this.angle+=dt*.008;
    this.view.kaleidoscope.uniforms.uInkAngle.value=this.angle;
    this.view.kaleidoscope.uniforms.uInkBeat.value=music.beat;
  }
  dispose(){for(const [type,fn] of this.listeners)this.view.renderer.domElement.removeEventListener(type,fn);this.texture.dispose();}
}
