// This self-contained function also runs unchanged in a Blob Worker. Times are
// measured in decoded audio seconds, never wall-clock or animation-frame time.
export async function analyzeRhythm({ channels, sampleRate }) {
  const yieldWork = () => new Promise(resolve => setTimeout(resolve, 0));
  const hop = Math.max(1, Math.round(sampleRate * .005));
  const step = hop / sampleRate;
  const length = channels[0].length;
  const count = Math.ceil(length / hop);
  const power = new Float64Array(count), fullPower = new Float64Array(count);
  // Two Butterworth biquads: 40 Hz high-pass followed by 200 Hz low-pass.
  const biquad = (frequency, highpass) => {
    const w = 2 * Math.PI * frequency / sampleRate, c = Math.cos(w);
    const a = Math.sin(w) / Math.SQRT2, a0 = 1 + a;
    const b = highpass ? (1 + c) / 2 : (1 - c) / 2;
    return [b / a0, (highpass ? -2 : 2) * b / a0, b / a0, -2 * c / a0, (1 - a) / a0];
  };
  const hp = biquad(40, true), lp = biquad(200, false);
  for (const channel of channels) {
    let h1 = 0, h2 = 0, l1 = 0, l2 = 0;
    for (let block = 0; block < count; block++) {
      let low = 0, wide = 0;
      const end = Math.min(length, (block + 1) * hop);
      for (let i = block * hop; i < end; i++) {
        const x = channel[i];
        const h = hp[0] * x + h1;
        h1 = hp[1] * x - hp[3] * h + h2; h2 = hp[2] * x - hp[4] * h;
        const y = lp[0] * h + l1;
        l1 = lp[1] * h - lp[3] * y + l2; l2 = lp[2] * h - lp[4] * y;
        low += y * y; wide += x * x;
      }
      // Average channel energies, not waveforms: opposite-phase stereo bass
      // must not cancel itself out in the detector.
      power[block] += low / (end - block * hop) / channels.length;
      fullPower[block] += wide / (end - block * hop) / channels.length;
      if (block % 400 === 399) await yieldWork();
    }
  }
  const bass = new Float32Array(count), wide = new Float32Array(count);
  const prefix = array => {
    const sums = new Float64Array(array.length + 1);
    for (let i = 0; i < array.length; i++) sums[i + 1] = sums[i] + array[i];
    return sums;
  };
  const average = (sums, from, to) => {
    const a = Math.max(0, from), b = Math.min(count, to);
    return b > a ? (sums[b] - sums[a]) / (b - a) : 0;
  };
  const powerSum = prefix(power), wideSum = prefix(fullPower);
  for (let i = 0; i < count; i++) {
    bass[i] = Math.sqrt(average(powerSum, i - 3, i + 1)); // 20 ms RMS
    wide[i] = Math.sqrt(average(wideSum, i - 3, i + 1));
  }
  const percentile = (array, p) => {
    // Small representative sample keeps memory/ordering cost bounded.
    const stride = Math.max(1, Math.floor(array.length / 12000)), values = [];
    for (let i = 0; i < array.length; i += stride) values.push(array[i]);
    values.sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
  };
  const bassPeak = percentile(bass, .95), widePeak = percentile(wide, .95);
  const bassFloor = Math.max(.00012, bassPeak * .025);
  const wideFloor = Math.max(.00025, widePeak * .012);
  const flux = new Float32Array(count), fluxSquared = new Float32Array(count);
  const bassSum = prefix(bass);
  for (let i = 0; i < count; i++) {
    flux[i] = Math.max(0, Math.log(bass[i] + bassFloor) - Math.log((bass[Math.max(0, i - 5)] || 0) + bassFloor));
    fluxSquared[i] = flux[i] * flux[i];
  }
  const fluxSum = prefix(flux), fluxSqSum = prefix(fluxSquared);
  const candidates = [];
  for (let i = 1; i < count - 2; i++) {
    if (bass[i] < bassFloor || wide[i] < wideFloor) continue;
    // Symmetric context, excluding this attack; adaptive to both sections and
    // recordings with different mastering levels.
    const mean = (average(fluxSum, i - 60, i - 9) + average(fluxSum, i + 9, i + 60)) * .5;
    const square = (average(fluxSqSum, i - 60, i - 9) + average(fluxSqSum, i + 9, i + 60)) * .5;
    const threshold = mean + .8 * Math.sqrt(Math.max(0, square - mean * mean)) + .13;
    const background = average(bassSum, i - 32, i - 7);
    if (flux[i] < threshold || bass[i] < Math.max(bassFloor, background * 1.22)) continue;
    let maximum = true;
    for (let j = Math.max(0, i - 4); j <= Math.min(count - 1, i + 4); j++) {
      if (flux[j] > flux[i] || (j < i && flux[j] === flux[i])) { maximum = false; break; }
    }
    if (!maximum) continue;
    // Backtrack the rising edge instead of timestamping the late energy peak.
    const onsetLevel = background + (bass[i] - background) * .16;
    let start = i;
    while (start > Math.max(0, i - 18) && bass[start - 1] > onsetLevel) start--;
    // The first rising hop contains actual samples from the attack. Timestamp
    // its end rather than subtracting a delay that could anticipate silence.
    const time = Math.min(length / sampleRate, (start + 1) * step);
    const strength = Math.min(1, Math.sqrt(bass[i] / Math.max(bassPeak, bassFloor)));
    const confidence = Math.min(1, .4 + .24 * (flux[i] / threshold - 1) + .12 * Math.min(2, bass[i] / Math.max(background, bassFloor) - 1));
    const candidate = { time, strength, confidence, novelty: flux[i], frame: i };
    const last = candidates[candidates.length - 1];
    if (last && time - last.time < .16) {
      // Refractory period merges filter ringing / a sustained kick's tail.
      if (confidence * strength > last.confidence * last.strength * 1.15) candidates[candidates.length - 1] = candidate;
    } else candidates.push(candidate);
  }
  await yieldWork();

  // Autocorrelation at 100 Hz, over up to three 60-second sections distributed
  // across the recording. It never runs in the playback/render loop.
  const rate = 100, duration = length / sampleRate;
  const onset = new Float32Array(Math.ceil(duration * rate) + 3);
  for (const event of candidates) {
    const at = Math.round(event.time * rate), weight = event.strength * event.confidence;
    for (let k = -2; k <= 2; k++) if (at + k >= 0 && at + k < onset.length) onset[at + k] += weight * Math.exp(-k * k / 2);
  }
  const spans = onset.length <= 18000 ? [[0, onset.length]] : [[0, 6000], [Math.floor(onset.length / 2) - 3000, Math.floor(onset.length / 2) + 3000], [onset.length - 6000, onset.length]];
  const correlation = new Float32Array(451);
  for (let lag = 27; lag < correlation.length; lag++) {
    let dot = 0, a = 0, b = 0;
    for (const [from, to] of spans) for (let i = from + lag; i < to; i++) {
      dot += onset[i] * onset[i - lag]; a += onset[i] ** 2; b += onset[i - lag] ** 2;
    }
    correlation[lag] = dot / Math.max(1e-12, Math.sqrt(a * b));
    if (lag % 16 === 0) await yieldWork();
  }
  const peaks = [];
  for (let lag = 28; lag <= 150; lag++) if (correlation[lag] >= correlation[lag - 1] && correlation[lag] > correlation[lag + 1]) peaks.push(lag);
  peaks.sort((a, b) => correlation[b] - correlation[a]);
  const periods = new Set();
  for (const lag of peaks.slice(0, 8)) for (const multiple of [.5, 1, 2]) {
    const p = lag / rate * multiple;
    if (p >= 60 / 220 && p <= 1.5) periods.add(p);
  }
  const corrAt = period => correlation[Math.min(450, Math.round(period * rate))] || 0;
  const evaluate = initialPeriod => {
    let period = initialPeriod;
    const bins = Math.max(16, Math.round(period / .008)), histogram = new Float64Array(bins);
    for (const e of candidates) {
      const at = Math.round((e.time % period) / period * bins) % bins;
      for (let k = -3; k <= 3; k++) histogram[(at + k + bins) % bins] += e.strength * e.confidence * Math.exp(-k * k / 4);
    }
    let best = 0;
    for (let i = 1; i < bins; i++) if (histogram[i] > histogram[best]) best = i;
    let phase = best / bins * period;
    // Robust linear fit removes small tempo quantization errors over long files.
    for (let pass = 0; pass < 3; pass++) {
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const e of candidates) {
        const cycle = Math.round((e.time - phase) / period);
        if (Math.abs(e.time - (phase + cycle * period)) > Math.max(.045, period * .1)) continue;
        const w = e.strength * e.confidence;
        sw += w; sx += w * cycle; sy += w * e.time; sxx += w * cycle * cycle; sxy += w * cycle * e.time;
      }
      const denominator = sw * sxx - sx * sx;
      if (denominator > 1e-9) {
        const refined = (sw * sxy - sx * sy) / denominator;
        if (Math.abs(refined - initialPeriod) < initialPeriod * .025) { period = refined; phase = (sy - period * sx) / sw; }
      }
    }
    phase = ((phase % period) + period) % period;
    let aligned = 0, total = 0, matched = 0, error = 0, supportedSlots = 0, activeSlots = 0;
    const occupied = new Set();
    for (const e of candidates) {
      const distance = Math.abs(e.time - (phase + Math.round((e.time - phase) / period) * period));
      const w = e.strength * e.confidence;
      total += w;
      if (distance < Math.max(.04, period * .09)) { aligned += w; matched++; error += distance * w; occupied.add(Math.round((e.time - phase) / period)); }
    }
    // Penalize doubled tempo's empty slots, but not actual rests in the music.
    for (let t = phase, cycle = 0; t < duration; t += period, cycle++) {
      const frame = Math.min(count - 1, Math.floor(t / step));
      if (average(wideSum, frame - 15, frame + 15) > wideFloor * wideFloor * 4) {
        activeSlots++;
        if (occupied.has(cycle)) supportedSlots++;
      }
    }
    const coverage = aligned / Math.max(1e-9, total);
    const occupancy = supportedSlots / Math.max(1, activeSlots);
    const score = (.6 * corrAt(period) + .25 * corrAt(period * 2) + .15 * corrAt(period * 3)) * coverage * (.35 + .65 * Math.min(1, occupancy));
    return { period, phase, coverage, occupancy, matched, error: error / Math.max(1e-9, aligned), score };
  };
  let fit = { period: .5, phase: 0, coverage: 0, occupancy: 0, matched: 0, error: 1, score: 0 };
  for (const period of periods) {
    const candidate = evaluate(period);
    if (candidate.score > fit.score) fit = candidate;
    await yieldWork();
  }
  // Check phase agreement separately across musical sections. An attractive
  // global autocorrelation peak is not enough for changing/live tempos.
  let sections = 0, stableSections = 0;
  for (let start = 0; start < duration; start += 12) {
    let total = 0, aligned = 0;
    for (const e of candidates) if (e.time >= start && e.time < start + 12) {
      total++;
      if (Math.abs(e.time - (fit.phase + Math.round((e.time - fit.phase) / fit.period) * fit.period)) < Math.max(.045, fit.period * .1)) aligned++;
    }
    if (total >= 5) { sections++; if (aligned / total >= .6) stableSections++; }
  }
  const stable = fit.matched >= 8 && fit.coverage >= .64 && fit.occupancy >= .43 && fit.error < .035 && sections > 0 && stableSections / sections >= .75;
  const events = candidates.filter(e => {
    const nearGrid = Math.abs(e.time - (fit.phase + Math.round((e.time - fit.phase) / fit.period) * fit.period)) <= Math.max(.045, fit.period * .1);
    return e.confidence >= (stable && nearGrid ? .43 : .58);
  }).map(e => ({ time: e.time, strength: Math.max(.15, e.strength), confidence: e.confidence }));
  // The theoretical grid is metadata, never a source of synthetic beat events.
  const grid = [];
  if (stable) for (let t = fit.phase; t < duration; t += fit.period) grid.push(t);
  const loudnessStep = step * 5, loudness = new Float32Array(Math.ceil(count / 5));
  for (let i = 0; i < loudness.length; i++) loudness[i] = Math.sqrt(average(wideSum, i * 5, i * 5 + 5));
  return { version: 2, duration, events, grid: new Float32Array(grid), bpm: stable ? 60 / fit.period : 0, period: fit.period, phase: fit.phase, confidence: fit.coverage, stable, loudness, loudnessStep };
}

export class RhythmAnalysis {
  constructor() { this.queue = []; this.running = false; this.disposed = false; }
  prepare(track, priority = false) {
    if (track.rhythm) return Promise.resolve(track.rhythm);
    if (track.rhythmError) return Promise.reject(track.rhythmError);
    if (track.rhythmPromise) {
      if (priority) { const at = this.queue.findIndex(job => job.track === track); if (at > 0) this.queue.unshift(this.queue.splice(at, 1)[0]); }
      return track.rhythmPromise;
    }
    let resolve, reject;
    track.rhythmPromise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const job = { track, resolve, reject };
    if (priority) this.queue.unshift(job); else this.queue.push(job);
    this.drain();
    return track.rhythmPromise;
  }
  async drain() {
    if (this.running || this.disposed) return;
    this.running = true;
    while (this.queue.length && !this.disposed) {
      const job = this.queue.shift();
      try { job.track.rhythm = await this.analyze(job.track.file); job.resolve(job.track.rhythm); }
      catch (error) { job.track.rhythmError = error; job.reject(error); }
    }
    this.running = false;
  }
  async analyze(file) {
    // Decode asynchronously at 22.05 kHz: sufficient for 40–200 Hz detection,
    // substantially less transient memory than full-rate stereo decoding.
    const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const decoder = new Context(2, 1, 22050);
    const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
    if (this.disposed) throw new Error('Analysis cancelled');
    const payload = { channels: [], sampleRate: buffer.sampleRate };
    // Chunk copying also keeps the fallback path responsive for long tracks.
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel), copy = new Float32Array(data.length);
      for (let at = 0; at < data.length; at += 262144) {
        copy.set(data.subarray(at, at + 262144), at);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      payload.channels.push(copy);
    }
    let worker;
    try {
      const source = `const analyze = ${analyzeRhythm.toString()}; onmessage = async e => { try { postMessage({result: await analyze(e.data)}); } catch(error) { postMessage({error: error.message}); } };`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
    } catch { return analyzeRhythm(payload); }
    this.worker = worker;
    try {
      return await new Promise((resolve, reject) => {
        this.cancelWorker = () => reject(new Error('Analysis cancelled'));
        worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
        worker.onerror = event => { event.preventDefault(); reject(new Error('Worker unavailable')); };
        worker.postMessage(payload, payload.channels.map(channel => channel.buffer));
      });
    } catch (error) {
      if (this.disposed) throw error;
      // Some browsers reject Blob Workers asynchronously. Use the same chunked
      // algorithm, reading the retained decoded buffer (transfers were copies).
      return analyzeRhythm({ channels: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), sampleRate: buffer.sampleRate });
    } finally { worker.terminate(); this.worker = null; this.cancelWorker = null; }
  }
  dispose() {
    this.disposed = true;
    this.cancelWorker?.(); this.worker?.terminate();
    for (const job of this.queue.splice(0)) job.reject(new Error('Analysis cancelled'));
  }
}
