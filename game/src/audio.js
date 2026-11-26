// Tiny WebAudio sound: an engine hum that follows the throttle and short blips for
// pickups, hits and landings. Everything is synthesised, so the game ships no audio
// files. The context is created lazily on the first user gesture (browsers refuse
// sound before one); until then every call is a quiet no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // The engine: a low sawtooth through a soft lowpass, started once and left running;
    // setEngine() rides its pitch and loudness with the throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
    return true;
  }

  function blip(freq, seconds, type = 'sine', volume = 0.18, slideTo = null) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + seconds);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + seconds);
  }

  function setEngine(throttle, running) {
    if (!ctx || !engineOsc) return;
    const now = ctx.currentTime;
    const target = running ? 0.05 + throttle * 0.035 : 0;
    engineGain.gain.setTargetAtTime(target, now, 0.12);
    engineOsc.frequency.setTargetAtTime(58 + throttle * 46, now, 0.12);
  }

  function setMuted(next) {
    muted = next;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  return {
    unlock: ensure,
    setEngine,
    setMuted,
    isMuted: () => muted,
    mail: () => { blip(880, 0.09, 'sine', 0.16); setTimeout(() => blip(1320, 0.12, 'sine', 0.14), 60); },
    star: () => blip(1560, 0.14, 'triangle', 0.14, 2090),
    fuel: () => blip(320, 0.22, 'sine', 0.16, 520),
    repair: () => { blip(520, 0.1, 'square', 0.08); setTimeout(() => blip(780, 0.14, 'square', 0.08), 80); },
    hit: () => blip(160, 0.28, 'sawtooth', 0.22, 60),
    landed: () => { blip(523, 0.14, 'triangle', 0.16); setTimeout(() => blip(659, 0.14, 'triangle', 0.16), 120); setTimeout(() => blip(784, 0.24, 'triangle', 0.18), 240); },
    over: () => blip(392, 0.5, 'triangle', 0.18, 130),
    lowFuel: () => blip(1100, 0.08, 'square', 0.06),
  };
}
