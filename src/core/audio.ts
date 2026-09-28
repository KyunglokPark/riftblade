// 절차적 효과음 (WebAudio) — 외부 파일 없이 코드로 생성.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function initAudio(): void {
  const resume = () => {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
}

export function toggleMute(): boolean {
  enabled = !enabled;
  if (master) master.gain.value = enabled ? 0.5 : 0;
  return enabled;
}

function now(): number {
  return ctx ? ctx.currentTime : 0;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number
): void {
  if (!ctx || !master || !enabled) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, hp: number, lp: number): void {
  if (!ctx || !master || !enabled) return;
  const t = now();
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = hp;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hpf).connect(lpf).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  swing() {
    noise(0.12, 0.22, 900, 6000);
    tone(520, 0.1, "triangle", 0.08, 300);
  },
  hit() {
    noise(0.09, 0.35, 300, 3200);
    tone(180, 0.12, "square", 0.18, 80);
  },
  heavy() {
    noise(0.18, 0.5, 120, 2200);
    tone(90, 0.22, "sawtooth", 0.28, 45);
  },
  launch() {
    tone(300, 0.25, "sine", 0.2, 900);
    noise(0.14, 0.25, 600, 5000);
  },
  skill() {
    tone(220, 0.35, "sawtooth", 0.22, 660);
    tone(440, 0.3, "sine", 0.14, 880);
    noise(0.2, 0.28, 400, 6000);
  },
  nova() {
    tone(80, 0.5, "sawtooth", 0.32, 300);
    noise(0.4, 0.4, 200, 4000);
  },
  hurt() {
    tone(320, 0.2, "square", 0.22, 120);
    noise(0.1, 0.2, 500, 3000);
  },
  dash() {
    noise(0.16, 0.24, 1200, 8000);
  },
  ui() {
    tone(660, 0.08, "square", 0.12, 880);
  },
  bossRoar() {
    tone(70, 0.7, "sawtooth", 0.4, 40);
    noise(0.6, 0.35, 80, 1400);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.3, "triangle", 0.2), i * 130)
    );
  },
  lose() {
    [440, 349, 262].forEach((f, i) =>
      setTimeout(() => tone(f, 0.4, "sawtooth", 0.2, f * 0.7), i * 200)
    );
  },
};
