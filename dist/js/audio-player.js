import { AudioAnalysis } from './audio-analysis.js';
import { RhythmAnalysis } from './rhythm-analysis.js';

export class AudioPlayer extends EventTarget {
  constructor(signal) {
    super();
    this.signal = signal;
    this.tracks = [];
    this.index = -1;
    this.activeDeck = 0;
    this.playing = false;
    this.volume = .75;
    this.busy = false;
    this.fade = null;
    this.crossfade = 2.5;
    this.operation = 0;
    this.rhythmAnalysis = new RhythmAnalysis();
    this.deckSerial = 0;
    this.preparing = false;
    this.rhythmState = {};
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  init() {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('Этот браузер не поддерживает Web Audio. Откройте приложение в Chrome, Edge или Firefox.');
    if (!window.Meyda) throw new Error('Не удалось загрузить локальную библиотеку Meyda. Проверьте папку vendor.');
    this.context = new Context();
    this.mix = this.context.createGain();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.mix.connect(this.master).connect(this.context.destination);
    this.decks = [0, 1].map(() => {
      const audio = new Audio();
      audio.preload = 'auto';
      const source = this.context.createMediaElementSource(audio);
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.mix);
      audio.addEventListener('ended', () => {
        if (this.playing && audio === this.current && !this.busy && !this.fade) this.next();
      });
      audio.addEventListener('error', () => {
        if (this.playing && audio === this.current && !this.busy) {
          this.emit('error', 'Трек не удалось прочитать. Выберите другой mp3.');
          this.pause();
        }
      });
      const deck = { audio, gain, trackIndex: -1, rhythm: null, id: 0 };
      audio.addEventListener('seeking', () => { deck.id = ++this.deckSerial; });
      return deck;
    });
    this.analysis = new AudioAnalysis(this.context, this.mix, this.signal);
  }
  get current() { return this.decks?.[this.activeDeck].audio; }
  get duration() { return Number.isFinite(this.current?.duration) ? this.current.duration : 0; }
  get time() { return this.current?.currentTime || 0; }
  add(files) {
    let count = 0;
    for (const file of files) {
      if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') continue;
      const track = { name: file.name.replace(/\.mp3$/i, ''), url: URL.createObjectURL(file), file };
      this.tracks.push(track);
      // Start preparing the playlist before playback, one decode/Worker at a
      // time. Selecting a pending track gives it priority in that queue.
      this.rhythmAnalysis.prepare(track).catch(() => {});
      count++;
    }
    if (count && this.index < 0) this.index = 0;
    this.emit('change');
    if (!count) this.emit('error', 'Выберите один или несколько файлов mp3.');
    return count;
  }
  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, .06);
  }
  async toggle() {
    if (this.playing) return this.pause();
    if (!this.tracks.length || this.busy) return;
    try {
      this.init();
      await this.context.resume();
      if (!this.current.src || this.current.ended) return await this.select(this.index, false);
      const token = ++this.operation;
      this.busy = true;
      await Promise.all(this.decks.filter((d, i) => i === this.activeDeck || this.fade).map(d => d.audio.play()));
      if (token !== this.operation) return;
      this.playing = true;
    } catch (error) { this.emit('error', error.message || 'Не удалось воспроизвести трек.'); }
    finally { this.busy = false; this.emit('change'); }
  }
  pause() {
    this.operation++;
    this.playing = false;
    this.decks?.forEach(d => d.audio.pause());
    // Context time also pauses: scheduled crossfade resumes from exactly here.
    this.context?.suspend();
    this.emit('change');
  }
  finishFade() {
    if (!this.fade) return;
    const outgoing = this.decks[this.fade.from];
    outgoing.audio.pause();
    outgoing.gain.gain.cancelScheduledValues(this.context.currentTime);
    outgoing.gain.gain.value = 0;
    const incoming = this.decks[this.activeDeck];
    incoming.gain.gain.cancelScheduledValues(this.context.currentTime);
    incoming.gain.gain.value = 1;
    this.fade = null;
    this.emit('change');
  }
  async select(index, crossfade = true) {
    if (!this.tracks.length || this.busy || this.fade) return;
    const token = ++this.operation;
    this.busy = true;
    this.emit('change');
    try {
      this.init();
      await this.context.resume();
      this.preparing = !this.tracks[index].rhythm;
      this.emit('change');
      const rhythm = await this.rhythmAnalysis.prepare(this.tracks[index], true);
      if (token !== this.operation) return;
      this.preparing = false;
      const from = this.activeDeck;
      const to = 1 - from;
      const incoming = this.decks[to];
      incoming.gain.gain.value = 0;
      incoming.rhythm = rhythm;
      incoming.trackIndex = index;
      incoming.id = ++this.deckSerial;
      incoming.audio.src = this.tracks[index].url;
      await incoming.audio.play();
      if (token !== this.operation) { incoming.audio.pause(); return; }
      const outgoing = this.decks[from];
      const now = this.context.currentTime;
      const remaining = Number.isFinite(outgoing.audio.duration) ? outgoing.audio.duration - outgoing.audio.currentTime : this.crossfade;
      const duration = crossfade && this.playing && !outgoing.audio.ended ? Math.min(this.crossfade, Math.max(.05, remaining)) : .08;
      outgoing.gain.gain.cancelScheduledValues(now);
      incoming.gain.gain.cancelScheduledValues(now);
      outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
      outgoing.gain.gain.linearRampToValueAtTime(0, now + duration);
      incoming.gain.gain.setValueAtTime(0, now);
      incoming.gain.gain.linearRampToValueAtTime(1, now + duration);
      this.activeDeck = to;
      this.index = index;
      this.playing = true;
      this.fade = { from, start: now, end: now + duration, handedOver: !crossfade || !outgoing.rhythm || outgoing.audio.paused || outgoing.audio.ended };
      return true;
    } catch (error) {
      if (!this.current || this.current.paused || this.current.ended) this.playing = false;
      this.emit('error', 'Не удалось открыть mp3. Файл может быть повреждён или иметь неподдерживаемый кодек.');
      return false;
    } finally {
      this.busy = false;
      this.preparing = false;
      this.emit('change');
    }
  }
  async next() {
    if (this.busy || this.fade || !this.tracks.length) return;
    const start = this.index;
    for (let step = 1; step <= this.tracks.length; step++) {
      const result = await this.select((start + step) % this.tracks.length);
      if (result !== false) return;
    }
    this.pause();
    this.emit('error', 'Ни один трек не удалось воспроизвести. Добавьте другие mp3.');
  }
  previous() { return this.select((this.index - 1 + this.tracks.length) % this.tracks.length); }
  seek(fraction) {
    if (!this.duration || this.busy) return;
    this.finishFade();
    this.current.currentTime = Math.min(this.duration - .02, Math.max(0, fraction * this.duration));
    this.decks[this.activeDeck].id = ++this.deckSerial;
  }
  rhythmSource() {
    if (!this.decks) return null;
    let index = this.activeDeck;
    const level = (deck, gain) => {
      if (!deck.rhythm || deck.audio.ended) return 0;
      const map = deck.rhythm;
      const at = Math.min(map.loudness.length - 1, Math.max(0, Math.floor(deck.audio.currentTime / map.loudnessStep)));
      // 225 ms energy window avoids a single kick choosing the owner too early.
      let sum = 0, count = 0;
      for (let i = Math.max(0, at - 4); i <= Math.min(map.loudness.length - 1, at + 4); i++) { sum += map.loudness[i] ** 2; count++; }
      return Math.sqrt(sum / Math.max(1, count)) * gain;
    };
    let gain = 1;
    if (this.fade) {
      const mix = Math.max(0, Math.min(1, (this.context.currentTime - this.fade.start) / (this.fade.end - this.fade.start)));
      const outgoing = this.decks[this.fade.from], incoming = this.decks[this.activeDeck];
      // A single handover with hysteresis, based on audible RMS × gain, avoids
      // two clocks fighting each other on alternating kick drums.
      if (!this.fade.handedOver && (outgoing.audio.ended || mix >= 1 || level(incoming, mix) > Math.max(.00005, level(outgoing, 1 - mix) * 1.15))) this.fade.handedOver = true;
      if (!this.fade.handedOver) { index = this.fade.from; gain = 1 - mix; } else gain = mix;
    }
    const deck = this.decks[index];
    if (!deck.rhythm) return null;
    Object.assign(this.rhythmState, { id: deck.id, map: deck.rhythm, time: deck.audio.currentTime,
      playing: this.playing && !deck.audio.paused && !deck.audio.ended && !deck.audio.seeking,
      seeking: deck.audio.seeking, level: level(deck, gain) * this.volume });
    return this.rhythmState;
  }
  update() {
    if (!this.context || !this.playing) return;
    if (this.fade && this.context.currentTime >= this.fade.end) this.finishFade();
    if (!this.fade && !this.busy && this.duration > .5 && this.duration - this.time <= Math.min(this.crossfade, this.duration * .25)) this.next();
  }
  dispose() {
    this.pause();
    this.analysis?.analyzer.stop();
    this.rhythmAnalysis.dispose();
    this.context?.close();
    this.tracks.forEach(track => URL.revokeObjectURL(track.url));
  }
}
