// A single audio-position-driven event stream for scale, light, waves and sparks.
// All pooled effects share these event timestamps; no effect owns a timer.
export class RhythmClock {
  constructor(signal) {
    this.signal = signal;
    this.slots = Array.from({ length: 8 }, () => ({ time: -10, age: -1, strength: 0, confidence: 0, id: 0 }));
    signal.value.impulses = this.slots;
    this.sourceId = -1; this.cursor = 0; this.serial = 0; this.slot = 0;
    this.lastTime = 0; this.wasSeeking = false;
  }
  lowerBound(events, time) {
    let lo = 0, hi = events.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid].time < time) lo = mid + 1; else hi = mid; }
    return lo;
  }
  reset(source) {
    for (const slot of this.slots) { slot.age = -1; slot.strength = 0; }
    this.sourceId = source?.id ?? -1;
    this.lastTime = source?.time || 0;
    this.cursor = source ? this.lowerBound(source.map.events, source.time - .00001) : 0;
    this.signal.value.beat = 0;
  }
  update(source) {
    const value = this.signal.value;
    if (!source?.map) { this.reset(null); value.bpm = 0; value.rhythmReady = false; return; }
    value.rhythmReady = true;
    if (this.sourceId !== source.id || source.time < this.lastTime - .03 || source.seeking || this.wasSeeking) this.reset(source);
    this.wasSeeking = source.seeking;
    this.lastTime = source.time;
    value.bpm = source.map.bpm ? Math.round(source.map.bpm) : 0;
    value.phase = ((source.time - source.map.phase) / source.map.period % 1 + 1) % 1;
    if (source.playing && !source.seeking) {
      const events = source.map.events;
      // A dropped frame/background tab must not replay a backlog of flashes.
      if (this.cursor < events.length && events[this.cursor].time < source.time - .12) this.cursor = this.lowerBound(events, source.time - .12);
      while (this.cursor < events.length && events[this.cursor].time <= source.time) {
        const event = events[this.cursor++];
        if (source.level < .00015) continue;
        const slot = this.slots[this.slot++ % this.slots.length];
        slot.time = event.time; slot.strength = event.strength; slot.confidence = event.confidence; slot.id = ++this.serial;
      }
    }
    let pulse = 0;
    for (const slot of this.slots) {
      if (!slot.strength) continue;
      slot.age = Math.max(0, source.time - slot.time);
      if (slot.age > 1.2) { slot.strength = 0; slot.age = -1; continue; }
      // Give the sculpture a readable physical beat: fast attack, a brief peak
      // visible across several frames, then a clean return before the next hit.
      // Compress strength only for the body; surrounding effects keep the raw
      // event strength and remain subordinate. No independent pulse clock.
      const attack = Math.min(1, slot.age / .016);
      const envelope = attack * attack * (3 - 2 * attack) * Math.exp(-Math.max(0, slot.age - .05) / .14);
      pulse = Math.max(pulse, Math.sqrt(slot.strength) * envelope);
    }
    value.beat = pulse;
    value.beatId = this.serial;
  }
}
