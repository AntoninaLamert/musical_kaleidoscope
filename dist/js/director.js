// Musical decisions are cheap envelopes over the shared analysis, never a
// second beat detector. All accents retain RhythmClock's audio timestamps.
export class ShowDirector {
  constructor(view,onShape){
    this.view=view;this.onShape=onShape;view.kaleidoscope.externallyDirected=true;
    this.energy=0;this.baseline=.1;this.elapsed=0;this.duration=24;this.scene=0;
    this.lastBeat=0;this.accentBeat=-1;this.cooldown=20;this.shape='crystal';
    this.state={motion:1,light:1,atmosphere:1,hue:0,accent:0,arc:0,zoom:1,fov:37};
    this.target={motion:1,light:1,atmosphere:1,hue:0,arc:.18,zoom:1.08,fov:36};
  }
  setAuto(enabled){this.view.kaleidoscope.setAuto(enabled);if(enabled)this.elapsed=this.duration;}
  choose(music){
    const calm=this.energy<.25,hot=this.energy>.55;
    const forms=calm?['sphere','torus','crystal']:hot?['star','crystal','cube','pyramid']:['sphere','cube','pyramid','crystal','star','torus'];
    const choices=forms.filter(s=>s!==this.shape);this.shape=choices[Math.floor(Math.random()*choices.length)];
    this.view.setShape(this.shape);this.onShape(this.shape);
    const styles=(calm?[0,2,3]:hot?[1,4,0]:[0,1,2,3,4]).filter(s=>s!==this.view.kaleidoscope.style);
    this.view.kaleidoscope.select(styles[Math.floor(Math.random()*styles.length)],false);
    this.scene++;this.target.hue=(this.scene%7)*.07;
    this.target.arc=calm?.18:.48;
    this.target.zoom=[1.12,1,1.06,1.17,1][this.scene%5];
    this.target.fov=[37,35,39,36,37][this.scene%5];
    this.elapsed=0;this.duration=calm?28:hot?21:25;
  }
  update(dt,music){
    const active=this.view.kaleidoscope.autoMode;
    this.energy+=(music.energy-this.energy)*(1-Math.exp(-dt*.45));
    this.baseline+=(this.energy-this.baseline)*(1-Math.exp(-dt*.055));
    this.cooldown+=dt;
    const fresh=music.beatId!==this.lastBeat;this.lastBeat=music.beatId;
    const accent=fresh&&music.active&&music.impulses?.some(e=>e.id===music.beatId&&e.confidence>=.65&&e.strength>.4);
    if(active){
      this.elapsed+=dt;
      if(this.elapsed>=this.duration&&(!music.active||accent||this.elapsed>this.duration+3))this.choose(music);
      if(accent&&this.cooldown>12&&music.energy>.45&&music.energy>this.baseline*1.25){this.accentBeat=music.beatId;this.cooldown=0;}
      this.target.motion=.40+this.energy*1.65;
      this.target.light=.73+this.energy*.55;
      this.target.atmosphere=.48+this.energy*1.15;
    }else{
      this.target.motion=this.target.light=this.target.atmosphere=1;
      this.target.arc=0;this.target.zoom=1;this.target.fov=37;
    }
    for(const key in this.target)this.state[key]+=(this.target[key]-this.state[key])*(1-Math.exp(-dt*.45));
    this.state.accent=active&&this.accentBeat===music.beatId?music.beat:0;
    return this.state;
  }
}
