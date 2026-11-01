/* =====================================================================
   js/audio.js  —  synthétiseur Web Audio (clics, clacs, plops, ronflement,
                   chat, coup de poing…).  Aucun fichier audio externe.
   ===================================================================== */

let AC = null, master = null, noiseBuf = null, humOsc = null;

export function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, (AC.sampleRate * .5) | 0, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function tone(f, dur, type = 'sine', vol = .2, slide = null, delay = 0) {
    if (!AC) return;
    const t0 = AC.currentTime + delay;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + .03);
}

export function noiseHit(dur, freq, vol, delay = 0) {
    if (!AC) return;
    const t0 = AC.currentTime + delay;
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = AC.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + .05);
}

export const sfx = {
    click:    () => { tone(1500, .025, 'square', .09); noiseHit(.02, 3200, .09); },
    ratchet:  () => { noiseHit(.028, 2100, .2); tone(760, .02, 'square', .05); },
    clack:    () => { noiseHit(.045, 1700, .5); noiseHit(.06, 760, .42, .05); },
    plug:     () => { tone(290, .13, 'sine', .55, 72); noiseHit(.055, 520, .28); },
    unplug:   () => { tone(130, .11, 'sine', .4, 320); noiseHit(.03, 900, .16); },
    ok:       () => { tone(659, .09, 'sine', .2); tone(880, .16, 'sine', .2, null, .1); },
    err:      () => { tone(150, .26, 'sawtooth', .18); tone(120, .26, 'sawtooth', .12, null, .03); },
    /* --- nouveautés : manipulation d'objets, chat, combat --- */
    grab:     () => { tone(420, .05, 'triangle', .16); noiseHit(.05, 1200, .2); },
    drop:     () => { noiseHit(.06, 1400, .3); tone(210, .07, 'sine', .22, 120); },
    thud:     () => { noiseHit(.12, 420, .5); tone(88, .16, 'sine', .34, 46); },
    bounce:   () => { noiseHit(.05, 700, .2); },
    scribble: () => { noiseHit(.09, 5200, .07); noiseHit(.07, 4200, .06, .06); },
    msgIn:    () => { tone(880, .05, 'sine', .1); tone(1320, .07, 'sine', .08, null, .05); },
    punch:    () => { noiseHit(.05, 900, .45); tone(180, .09, 'square', .2, 90); },
    hurt:     () => { tone(240, .18, 'sawtooth', .22, 90); noiseHit(.1, 600, .35); },
    join:     () => { tone(523, .08, 'sine', .14); tone(784, .12, 'sine', .12, null, .09); }
};

/* Ronflement 50 Hz du générateur sous tension */
export function hum(on) {
    if (!AC) return;
    if (on && !humOsc) {
        const g = AC.createGain(); g.gain.value = 0; g.connect(master);
        g.gain.linearRampToValueAtTime(.015, AC.currentTime + .6);
        const o1 = AC.createOscillator(), o2 = AC.createOscillator();
        o1.frequency.value = 50; o2.frequency.value = 100; o2.detune.value = 4;
        const g2 = AC.createGain(); g2.gain.value = .35; o2.connect(g2).connect(g);
        o1.connect(g); o1.start(); o2.start();
        humOsc = { g, o1, o2 };
    } else if (!on && humOsc) {
        humOsc.g.gain.linearRampToValueAtTime(0, AC.currentTime + .3);
        const h = humOsc; humOsc = null;
        setTimeout(() => { try { h.o1.stop(); h.o2.stop(); } catch (e) { } }, 420);
    }
}

export const audioReady = () => !!AC;
