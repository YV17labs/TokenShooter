/* ═══════════════════════════ Monster cries ═══════════════════════════
   What each species sounds like when it wakes up, flinches and dies: the watcher growls, the
   seeker shrieks. Each cry plays through the Sound `s` into the voice `v`, from time `t`. */

export const CRIES = {
  watcher: {
    roar(s, t, v) {
      const out = s.filter(s.env(v, t, 0.32, 0.06, 0.7), "lowpass", 1100);
      const o = s.tone(s.distortion(out, 30), "sawtooth", 96, 60, t, 0.76);
      s.wobble(o.frequency, t, 0.76, 27, 16);
      s.noise(s.filter(s.env(v, t, 0.12, 0.05, 0.5), "lowpass", 500), t, 0.6);
    },
    pain: (s, t, v) => s.tone(s.filter(s.env(v, t, 0.3, 0.01, 0.22), "lowpass", 1200), "sawtooth", 190, 95, t, 0.24),
    death(s, t, v) {
      const o = s.tone(s.distortion(s.filter(s.env(v, t, 0.3, 0.02, 0.8), "lowpass", 900), 25), "sawtooth", 140, 30, t, 0.85);
      s.wobble(o.frequency, t, 0.85, 19, 12);
    },
    blast: 1.3,                         // size of the explosion it dies in
  },
  seeker: {
    roar(s, t, v) {
      const o = s.tone(s.filter(s.env(v, t, 0.18, 0.02, 0.45), "bandpass", 1400, 2), "square", 800, 560, t, 0.47, [1500, 0.12]);
      s.wobble(o.frequency, t, 0.5, 22, 90);
      s.noise(s.filter(s.env(v, t, 0.08, 0.02, 0.35), "highpass", 3000), t, 0.4);
    },
    pain: (s, t, v) => s.tone(s.filter(s.env(v, t, 0.16, 0.005, 0.14), "bandpass", 1500, 1.5), "square", 1300, 700, t, 0.15),
    death: (s, t, v) => s.tone(s.filter(s.env(v, t, 0.15, 0.01, 0.5), "bandpass", 1200, 1.5), "square", 1400, 200, t, 0.52),
    blast: 0.9,
  },
};
