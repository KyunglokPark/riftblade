// 절차적 효과음 (WebAudio) — 외부 파일 없이 코드로 생성.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null; // BGM 전용 버스 (볼륨 분리)
let enabled = true;
let onReady: (() => void) | null = null;

export function initAudio(): void {
  const resume = () => {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.42;
      musicBus.connect(master);
      onReady?.();
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
}

/** BGM 시퀀서가 사용할 컨텍스트/버스 — 첫 입력 전엔 null */
export function audioNodes(): { ctx: AudioContext; music: GainNode } | null {
  return ctx && musicBus ? { ctx, music: musicBus } : null;
}
/** 오디오 컨텍스트가 준비되면 호출될 콜백 (BGM 시작용) */
export function setAudioReady(cb: () => void) {
  onReady = cb;
  if (ctx) cb();
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
  arrow() {
    // 활: 시위 퉁김 + 바람 가르는 소리
    noise(0.08, 0.16, 2000, 9000);
    tone(880, 0.06, "triangle", 0.1, 440);
  },
  magic() {
    // 매직볼트: 웅웅거리는 발사음
    tone(320, 0.18, "sine", 0.14, 640);
    tone(480, 0.14, "triangle", 0.08, 720);
    noise(0.1, 0.1, 800, 4000);
  },
  potion() {
    // 포션: 보글보글 + 상승음
    tone(520, 0.08, "sine", 0.12, 660);
    setTimeout(() => tone(660, 0.08, "sine", 0.12, 820), 70);
    setTimeout(() => tone(820, 0.12, "sine", 0.12, 1040), 140);
  },
  parry() {
    // 패링: 금속성 챙! + 여운
    tone(1320, 0.18, "triangle", 0.2, 990);
    tone(2640, 0.1, "sine", 0.08, 1980);
    noise(0.06, 0.25, 3000, 10000);
  },
  checkpoint() {
    // 체크포인트: 포근한 상승 아르페지오
    [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 0.25, "triangle", 0.14), i * 90));
  },
  lose() {
    [440, 349, 262].forEach((f, i) =>
      setTimeout(() => tone(f, 0.4, "sawtooth", 0.2, f * 0.7), i * 200)
    );
  },
};
