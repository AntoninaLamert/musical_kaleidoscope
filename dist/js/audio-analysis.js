// Atmosphere only. RhythmClock exclusively owns beat, phase and pooled impulses.
export class MusicSignal {
  constructor() {
    this.target = { loudness: 0, bass: 0, mids: 0, highs: 0, energy: 0 };
    this.value = { ...this.target, beat: 0, phase: 0, bpm: 0, active: false };
    this.spectrum = new Float32Array(24);
    this.spectrumTarget = new Float32Array(24);
  }
  step(dt, active) {
    this.value.active = active;
    for (const key of Object.keys(this.target)) {
      const target = active ? this.target[key] : 0;
      const speed = target > this.value[key] ? 7 : 3.2;
      this.value[key] += (target - this.value[key]) * (1 - Math.exp(-dt * speed));
    }
    for (let i = 0; i < 24; i++) this.spectrum[i] += ((active ? this.spectrumTarget[i] : 0) - this.spectrum[i]) * (1 - Math.exp(-dt * 9));
    return this.value;
  }
}

export class AudioAnalysis {
  constructor(context, source, signal) {
    this.signal = signal;
    this.context = context;
    this.analyzer = window.Meyda.createMeydaAnalyzer({
      audioContext: context, source, bufferSize: 2048,
      featureExtractors: ['rms', 'amplitudeSpectrum'],
      callback: features => this.consume(features),
    });
    this.analyzer.start();
  }
  consume({ rms, amplitudeSpectrum: bins }) {
    if (!bins) return;
    const hz = this.context.sampleRate / 2048;
    const band = (low, high) => {
      let sum = 0;
      const start = Math.max(1, Math.floor(low / hz));
      const end = Math.min(bins.length, Math.ceil(high / hz));
      for (let i = start; i < end; i++) sum += bins[i] * bins[i];
      return Math.sqrt(sum / Math.max(1, end - start));
    };
    const bass = band(30, 220), mids = band(220, 3500), highs = band(3500, 14000);
    const compress = (x, scale) => Math.min(1, Math.log1p(x * scale) / 3);
    Object.assign(this.signal.target, {
      loudness: Math.min(1, rms * 4), bass: compress(bass, .6),
      mids: compress(mids, 1.4), highs: compress(highs, 3),
      energy: Math.min(1, rms * 2.2 + compress(bass, .4) * .35),
    });
    for (let i = 0; i < 24; i++) {
      const low = 35 * Math.pow(15000 / 35, i / 24);
      this.signal.spectrumTarget[i] = compress(band(low, low * Math.pow(15000 / 35, 1 / 24)), 1.4);
    }
  }
}
