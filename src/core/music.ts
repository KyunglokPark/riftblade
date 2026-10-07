// 칩튠 BGM 시퀀서 (WebAudio) — 외부 파일 없이 코드로 작곡한 루프.
// 룩어헤드 스케줄링: 90ms 간격 타이머가 0.25초 앞까지 노트를 예약해 타이밍이 정확하다.

import { audioNodes, setAudioReady } from "./audio";

export type MusicName = "canyon" | "ember" | "void" | "boss" | "boss2" | "title" | null;

// 파일이 없을 때 대신 재생할 칩튠 패턴 (title/boss2는 전용 칩튠이 없다)
const CHIP_FALLBACK: Record<string, "canyon" | "ember" | "void" | "boss"> = {
  title: "canyon",
  boss2: "boss",
};

type Pat = (number | null)[]; // 루트 기준 반음 오프셋, null=쉼표
type DrumPat = ("k" | "s" | "h" | null)[];

interface Song {
  bpm: number;
  root: number; // 루트 음 주파수 (베이스 옥타브)
  bass: Pat;
  lead: Pat;
  arp?: Pat;
  drums: DrumPat;
}

const st = (semi: number) => Math.pow(2, semi / 12); // 반음 → 배율

// ---- 작곡 (32스텝 = 16분음표 2마디 루프) ----
const SONGS: Record<"canyon" | "ember" | "void" | "boss", Song> = {
  // 균열 협곡: 신비롭고 차분한 Am — 느린 맥동 베이스 + 성긴 선율
  canyon: {
    bpm: 96,
    root: 110, // A2
    bass: [0,null,null,null, 0,null,null,7, 3,null,null,null, 3,null,null,2, -2,null,null,null, -2,null,null,5, -4,null,null,null, -4,null,2,null],
    lead: [null,null,12,null, null,15,null,null, 12,null,null,10, null,null,null,null, 7,null,null,10, null,12,null,null, 10,null,7,null, null,null,null,null],
    drums: ["k",null,null,null, null,null,"h",null, "k",null,null,null, "s",null,null,null, "k",null,null,null, null,null,"h",null, "k",null,null,null, "s",null,"h",null],
  },
  // 불타는 폐허: 질주하는 Dm 프리지안 — 8분 베이스 드라이브
  ember: {
    bpm: 122,
    root: 146.83, // D3
    bass: [0,null,0,null, 0,null,-2,null, 0,null,0,null, 1,null,-2,null, 0,null,0,null, 0,null,-2,null, -4,null,-4,null, -2,null,1,null],
    lead: [12,null,null,12, null,13,12,null, 10,null,null,null, 8,null,10,null, 12,null,null,12, null,15,13,null, 12,null,10,null, 8,null,null,null],
    drums: ["k",null,"h",null, "s",null,"h",null, "k",null,"h",null, "s",null,"h","h", "k",null,"h",null, "s",null,"h",null, "k","k","h",null, "s",null,"h","h"],
  },
  // 심연 성채: 긴장감 있는 Em 아르페지오가 쉼 없이 흐른다
  void: {
    bpm: 112,
    root: 164.81, // E3
    bass: [0,null,null,null, null,null,null,null, -4,null,null,null, null,null,null,null, -2,null,null,null, null,null,null,null, -5,null,null,null, -5,null,null,null],
    arp: [12,15,19,24, 12,15,19,24, 8,12,15,20, 8,12,15,20, 10,14,17,22, 10,14,17,22, 7,10,14,19, 7,10,14,19],
    lead: [null,null,null,null, 24,null,22,null, null,null,null,null, 20,null,null,null, null,null,null,null, 22,null,19,null, null,null,null,null, null,null,null,null],
    drums: ["k",null,null,null, null,null,null,null, "s",null,null,null, null,null,"h",null, "k",null,null,null, null,null,null,null, "s",null,null,null, "h",null,"h",null],
  },
  // 보스전: 공격적인 16분 페달 베이스 + 트라이톤 리프
  boss: {
    bpm: 140,
    root: 110, // A2
    bass: [0,0,12,0, 0,0,12,0, 0,0,12,0, 1,1,13,1, 0,0,12,0, 0,0,12,0, -2,-2,10,-2, 6,6,6,null],
    lead: [12,null,null,15, null,null,18,null, 17,null,15,null, 12,null,null,null, 12,null,null,15, null,null,18,null, 20,null,18,null, 17,null,15,null],
    drums: ["k",null,"h",null, "s",null,"h","h", "k",null,"h",null, "s",null,"k",null, "k",null,"h",null, "s",null,"h","h", "k","k","h",null, "s","s","h",null],
  },
};

let current: MusicName = null;
let pending: MusicName = null;
let step = 0;
let nextT = 0;
let timer: number | undefined;

// ---- 파일 BGM 지원: public/audio/<테마>.mp3 가 있으면 칩튠 대신 파일을 루프 재생 ----
// 트랙마다 개별 게인 노드를 달아 1.3초 크로스페이드로 전환한다. (뮤트는 공용 뮤직 버스)
const FADE = 1.3; // 크로스페이드 시간(초)
const fileTracks: Partial<Record<Exclude<MusicName, null>, HTMLAudioElement>> = {};
// 원샷 징글 (루프 없음): 보스 격파 팡파레, 사망 스팅
const jingleTracks: Partial<Record<"victory" | "death", HTMLAudioElement>> = {};
const fileGains = new Map<HTMLAudioElement, GainNode>();
let activeFile: HTMLAudioElement | null = null;

async function probeFileTracks() {
  for (const name of ["canyon", "ember", "void", "boss", "boss2", "title"] as const) {
    try {
      const res = await fetch(`/audio/${name}.mp3`, { method: "HEAD" });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("audio")) {
        const el = new Audio(`/audio/${name}.mp3`);
        el.loop = true;
        el.preload = "auto";
        fileTracks[name] = el;
      }
    } catch {
      /* 없음 — 칩튠 사용 */
    }
  }
  for (const name of ["victory", "death"] as const) {
    try {
      const res = await fetch(`/audio/${name}.mp3`, { method: "HEAD" });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("audio")) {
        const el = new Audio(`/audio/${name}.mp3`);
        el.loop = false;
        el.preload = "auto";
        jingleTracks[name] = el;
      }
    } catch {
      /* 없음 */
    }
  }
}
void probeFileTracks().then(() => {
  // 프로브가 곡 시작보다 늦게 끝난 경우 — 파일 트랙으로 다시 전환
  if (current && fileTracks[current] && activeFile !== fileTracks[current]) {
    const c = current;
    current = null;
    playMusic(c);
  }
});

function hookFileTrack(el: HTMLAudioElement): GainNode | null {
  const got = fileGains.get(el);
  if (got) return got;
  const nodes = audioNodes();
  if (!nodes) return null;
  const src = nodes.ctx.createMediaElementSource(el);
  const g = nodes.ctx.createGain();
  g.gain.value = 0;
  src.connect(g).connect(nodes.music);
  fileGains.set(el, g);
  return g;
}

/** 페이드아웃 후 정지 (페이드 중 같은 트랙으로 복귀하면 정지 취소) */
function fadeOutTrack(el: HTMLAudioElement) {
  const nodes = audioNodes();
  const g = fileGains.get(el);
  if (!nodes || !g) {
    el.pause();
    return;
  }
  const t = nodes.ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + FADE);
  window.setTimeout(() => {
    if (activeFile !== el) el.pause();
  }, FADE * 1000 + 120);
}

function fadeInTrack(el: HTMLAudioElement) {
  const nodes = audioNodes();
  const g = hookFileTrack(el);
  if (!nodes || !g) return;
  if (el.paused) {
    el.currentTime = 0;
    el.play().catch(() => {
      // 자동재생 차단 등으로 거부되면 현재 곡을 초기화 — 메인 루프가 다음 틱에 재시도
      current = null;
    });
  }
  const t = nodes.ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(1, t + FADE);
}

// 칩튠도 전환 시 부드럽게 — 시퀀서 전용 게인
let chipGain: GainNode | null = null;
function getChipGain(): GainNode | null {
  if (chipGain) return chipGain;
  const nodes = audioNodes();
  if (!nodes) return null;
  chipGain = nodes.ctx.createGain();
  chipGain.gain.value = 1;
  chipGain.connect(nodes.music);
  return chipGain;
}

function voice(
  ctx: AudioContext,
  bus: GainNode,
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  lp?: number
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    o.connect(f).connect(g).connect(bus);
  } else {
    o.connect(g).connect(bus);
  }
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(ctx: AudioContext, bus: GainNode, kind: "k" | "s" | "h", t: number) {
  if (kind === "k") {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.14);
    return;
  }
  // 스네어/햇: 짧은 노이즈
  const dur = kind === "s" ? 0.08 : 0.03;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = kind === "s" ? 900 : 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(kind === "s" ? 0.14 : 0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function scheduleStep(song: Song, i: number, t: number, stepDur: number) {
  const nodes = audioNodes();
  if (!nodes) return;
  const ctx = nodes.ctx;
  const music = getChipGain() ?? nodes.music;
  const b = song.bass[i % song.bass.length];
  if (b !== null && b !== undefined) voice(ctx, music, song.root * st(b), t, stepDur * 1.8, "square", 0.11, 500);
  const l = song.lead[i % song.lead.length];
  if (l !== null && l !== undefined) voice(ctx, music, song.root * 2 * st(l), t, stepDur * 1.6, "square", 0.05);
  if (song.arp) {
    const a = song.arp[i % song.arp.length];
    if (a !== null && a !== undefined) voice(ctx, music, song.root * 2 * st(a), t, stepDur * 0.9, "triangle", 0.045);
  }
  const dr = song.drums[i % song.drums.length];
  if (dr) drum(ctx, music, dr, t);
}

function tick() {
  const nodes = audioNodes();
  if (!nodes || !current) return;
  if (nodes.ctx.state === "suspended") void nodes.ctx.resume();
  const song = SONGS[(current in SONGS ? current : CHIP_FALLBACK[current] ?? "canyon") as keyof typeof SONGS];
  const stepDur = 60 / song.bpm / 4;
  const now = nodes.ctx.currentTime;
  if (nextT < now) nextT = now + 0.05; // 탭 비활성 등으로 밀렸으면 재정렬
  while (nextT < now + 0.25) {
    scheduleStep(song, step, nextT, stepDur);
    step = (step + 1) % 32;
    nextT += stepDur;
  }
}

/** 테마 전환 — 같은 곡이면 무시. null이면 정지 */
export function playMusic(name: MusicName) {
  if (name === current) return;
  if (!audioNodes()) {
    pending = name; // 첫 입력 전 — 오디오 준비되면 시작
    return;
  }
  current = name;
  step = 0;
  nextT = 0;

  const nodes = audioNodes()!;
  const file = name ? fileTracks[name] : undefined;

  // 이전 파일 트랙은 페이드아웃
  if (activeFile && activeFile !== file) fadeOutTrack(activeFile);
  activeFile = file ?? null;

  if (file) {
    // 파일 트랙 페이드인, 칩튠 시퀀서는 정지
    fadeInTrack(file);
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    return;
  }

  // 칩튠: 페이드인으로 시작
  const cg = getChipGain();
  if (cg) {
    const t = nodes.ctx.currentTime;
    cg.gain.cancelScheduledValues(t);
    cg.gain.setValueAtTime(0, t);
    cg.gain.linearRampToValueAtTime(1, t + FADE * 0.7);
  }
  if (current && timer === undefined) {
    timer = window.setInterval(tick, 90);
  }
  if (!current && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

export function stopMusic() {
  playMusic(null);
}

/** 원샷 징글: 보스 격파 팡파레 / 사망 스팅 (파일 없으면 무음) */
export function playJingle(name: "victory" | "death") {
  const el = jingleTracks[name];
  if (!el) return;
  const g = hookFileTrack(el);
  if (!g) return;
  const nodes = audioNodes();
  if (nodes) {
    const t = nodes.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(1, t);
  }
  el.currentTime = 0;
  void el.play().catch(() => {});
}

// 오디오 컨텍스트가 뜨면(첫 키/클릭) 대기 중이던 곡 시작
setAudioReady(() => {
  if (pending) {
    const p = pending;
    pending = null;
    playMusic(p);
  }
});
