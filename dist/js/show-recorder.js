// A fixed-size capture canvas keeps the encoded video valid across resizes,
// fullscreen changes and adaptive WebGL resolution changes. No second render.
export class ShowRecorder {
  constructor(view,player,onState,onReady,onError){
    this.view=view;this.player=player;this.onState=onState;this.onReady=onReady;this.onError=onError;
    this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});
    this.active=false;this.url=null;this.recorder=null;this.seconds=0;
    this.onPlayer=()=>this.syncPause();player.addEventListener('change',this.onPlayer);
  }
  start(){
    if(this.active||this.stopping)return;
    try{
      if(!this.player.playing||!this.player.context)throw new Error('Сначала загрузите MP3 и включите воспроизведение, затем начните запись.');
      if(!window.MediaRecorder||!this.canvas.captureStream||!this.player.context.createMediaStreamDestination)throw new Error('Запись видео со звуком недоступна в этом браузере. Попробуйте актуальный Chrome или Edge.');
      const source=this.view.renderer.domElement,scale=Math.min(1,1920/source.width,1080/source.height);
      this.canvas.width=Math.max(2,Math.floor(source.width*scale/2)*2);this.canvas.height=Math.max(2,Math.floor(source.height*scale/2)*2);
      this.fps=this.view.quality===0&&this.view.frameAverage<1/48?60:30;this.lastCapture=-Infinity;
      this.videoStream=this.canvas.captureStream(this.fps);
      this.destination=this.player.context.createMediaStreamDestination();this.player.master.connect(this.destination);
      const audio=this.destination.stream.getAudioTracks();
      if(!audio.length||audio[0].readyState!=='live')throw new Error('Браузер не предоставил звуковую дорожку для записи.');
      this.stream=new MediaStream([...this.videoStream.getVideoTracks(),...audio]);
      const types=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
      let recorder;
      for(const mimeType of types){if(!MediaRecorder.isTypeSupported(mimeType))continue;try{recorder=new MediaRecorder(this.stream,{mimeType,videoBitsPerSecond:6000000,audioBitsPerSecond:192000});break;}catch{}}
      if(!recorder)throw new Error('Не найден поддерживаемый формат видео со звуком (MP4 или WebM).');
      this.recorder=recorder;this.chunks=[];this.bytes=0;this.failed=false;this.seconds=0;this.lastTick=performance.now();
      recorder.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);this.bytes+=e.data.size;}if(this.bytes>384*1024*1024&&this.active){this.stop();this.onError('Запись завершена, чтобы не переполнить память. Сохраните видео и начните следующую запись.');}};
      recorder.onerror=e=>{this.failed=true;this.onError('Браузер прервал запись: '+(e.error?.message||'ошибка кодирования'));if(recorder.state!=='inactive')recorder.stop();else this.release();};
      recorder.onstop=()=>{
        if(!this.failed&&this.chunks.length){
          const mime=recorder.mimeType||this.chunks[0].type;
          const blob=new Blob(this.chunks,{type:mime});if(this.url)URL.revokeObjectURL(this.url);
          this.url=URL.createObjectURL(blob);this.onReady(this.url,'Kaleido-'+new Date().toISOString().replace(/[:.]/g,'-')+(mime.includes('mp4')?'.mp4':'.webm'),mime);
        }
        if(!this.failed&&!this.chunks.length)this.onError('Браузер не создал видеоданные. Попробуйте повторить запись в другом поддерживаемом формате или браузере.');
        this.chunks=[];this.release();
      };
      recorder.start(1000);this.active=true;this.onState(true,0,false);
    }catch(error){this.release();this.onError(error.message);}
  }
  syncPause(){
    const r=this.recorder;if(!this.active||!r)return;
    this.tick();
    if(!this.player.playing&&r.state==='recording')r.pause();
    else if(this.player.playing&&r.state==='paused')r.resume();
  }
  tick(){const now=performance.now();if(this.active&&this.recorder?.state==='recording')this.seconds+=(now-this.lastTick)/1000;this.lastTick=now;}
  capture(now){
    if(!this.active)return;this.tick();this.onState(true,this.seconds,this.recorder.state==='paused');
    if(this.recorder.state!=='recording'||now-this.lastCapture<1000/this.fps)return;this.lastCapture=now;
    const source=this.view.renderer.domElement,w=this.canvas.width,h=this.canvas.height,s=Math.min(w/source.width,h/source.height);
    this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,w,h);this.ctx.drawImage(source,(w-source.width*s)/2,(h-source.height*s)/2,source.width*s,source.height*s);
  }
  stop(){if(this.recorder&&this.recorder.state!=='inactive'){this.tick();this.active=false;this.stopping=true;this.recorder.stop();this.onState(false,this.seconds,false);}}
  release(){
    this.active=false;this.stopping=false;
    if(this.destination){try{this.player.master.disconnect(this.destination);}catch{}this.destination.stream.getTracks().forEach(t=>t.stop());this.destination=null;}
    this.videoStream?.getTracks().forEach(t=>t.stop());this.videoStream=null;this.stream=null;this.onState(false,this.seconds,false);
  }
  dispose(){if(this.recorder){this.recorder.onstop=null;this.recorder.ondataavailable=null;if(this.recorder.state!=='inactive')this.recorder.stop();}this.release();if(this.url)URL.revokeObjectURL(this.url);this.player.removeEventListener('change',this.onPlayer);}
}
