// RIFTBLADE · 파열검 — 엔트리(루프 + 상태 관리)

import "./style.css";
import { initInput, pressed, endInputFrame } from "./core/input";
import { initAudio, sfx } from "./core/audio";
import { World } from "./game/world";
import { drawScene, drawBackground } from "./game/render";
import { drawHud } from "./game/hud";
import { VW, VH } from "./core/util";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initInput();
initAudio();

type State = "title" | "play" | "pause" | "win" | "lose";
let state: State = "title";
let world = new World();
let titleT = 0;
let loseT = 0; // 사망 연출 경과 틱

function startGame() {
  world = new World();
  state = "play";
  sfx.ui();
}

// 웨이브 점프 치트: 플레이 중 Enter → 숫자 입력 → Enter (Esc 취소)
let waveJumpBuf: string | null = null;
window.addEventListener("keydown", (e) => {
  // 사망 화면에서 Esc → 타이틀로
  if (state === "lose" && e.key === "Escape") {
    state = "title";
    return;
  }
  if (state !== "play") {
    waveJumpBuf = null;
    return;
  }
  if (waveJumpBuf === null) {
    if (e.key === "Enter") {
      waveJumpBuf = "";
      sfx.ui();
    }
    return;
  }
  if (e.key >= "0" && e.key <= "9" && waveJumpBuf.length < 3) waveJumpBuf += e.key;
  else if (e.key === "Backspace") waveJumpBuf = waveJumpBuf.slice(0, -1);
  else if (e.key === "Escape") waveJumpBuf = null;
  else if (e.key === "Enter") {
    const n = parseInt(waveJumpBuf, 10);
    if (n >= 1) {
      world.jumpToWave(n);
      sfx.ui();
    }
    waveJumpBuf = null;
  }
});

function tick() {
  titleT++;
  if (state === "title") {
    if (pressed("start") || pressed("attack")) startGame();
    return;
  }
  if (state === "win" || state === "lose") {
    world.update(); // fx 여운
    if (state === "lose") loseT++;
    // 사망 연출이 자리 잡기 전엔 Enter 무시 (연타로 스킵되는 것 방지)
    if (pressed("start")) {
      if (state === "lose" && loseT > 45) {
        // 마지막 체크포인트에서 계속
        world.respawn();
        state = "play";
        sfx.ui();
      } else if (state === "win") {
        state = "title";
      }
    }
    return;
  }
  if (state === "pause") {
    if (pressed("pause") || pressed("start")) state = "play";
    return;
  }
  // play
  if (waveJumpBuf !== null) return; // 웨이브 입력 중엔 게임 정지
  if (pressed("pause")) {
    state = "pause";
    sfx.ui();
    return;
  }
  world.update();
  if (world.result === "win") {
    state = "win";
  } else if (world.result === "lose") {
    state = "lose";
    loseT = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, VW, VH);
  if (state === "title") {
    drawTitle();
    return;
  }
  drawScene(ctx, world);
  drawHud(ctx, world);
  drawControlsHint();
  if (state === "play" && waveJumpBuf !== null)
    overlay("웨이브 점프", `WAVE  ${waveJumpBuf || "_"}\n숫자 입력 후 Enter · Esc 취소`, "#ffd76a");
  if (state === "pause") overlay("일시정지", "P / Enter 로 계속");
  if (state === "win") overlay("균열 봉인 완료!", `점수 ${world.score} · 최대 콤보 ${world.maxCombo}\nEnter 로 타이틀`, "#8ef0c0");
  if (state === "lose") drawYouDie();
}

function drawTitle() {
  drawBackground(ctx, titleT * 0.4);
  ctx.save();
  ctx.textAlign = "center";
  // 로고
  const cx = VW / 2;
  const pulse = 12 + Math.sin(titleT * 0.05) * 4;
  ctx.shadowColor = "#5cf0ff";
  ctx.shadowBlur = pulse;
  ctx.fillStyle = "#dff9ff";
  ctx.font = "900 78px 'Segoe UI', sans-serif";
  ctx.fillText("RIFTBLADE", cx, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#5cf0ff";
  ctx.font = "800 30px 'Segoe UI', sans-serif";
  ctx.fillText("파 열 검", cx, 232);

  ctx.fillStyle = "rgba(210,235,255,0.85)";
  ctx.font = "500 15px 'Segoe UI', sans-serif";
  ctx.fillText("차원의 균열에서 쏟아지는 그림자 군세를 베어라", cx, 268);

  // 조작 안내
  const lines = [
    "이동 : ← → ↑ ↓  (WASD)      점프 : K / Space      대시(무적) : L / Shift",
    "공격 : J   ·   ↓+J 어퍼(띄우기) → 점프+J 공중 콤보   ·   공중 ↓+J 내려찍기",
    "스킬 : U 파열참   I 천공참   O 파열노바   (MP 소모 · 쿨다운)",
  ];
  ctx.fillStyle = "rgba(190,220,255,0.8)";
  ctx.font = "500 14px 'Segoe UI', sans-serif";
  lines.forEach((l, i) => ctx.fillText(l, cx, 330 + i * 26));

  // 시작
  if (Math.floor(titleT / 30) % 2 === 0) {
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 22px 'Segoe UI', sans-serif";
    ctx.fillText("▶  Enter / J  로 시작", cx, 452);
  }
  ctx.fillStyle = "rgba(150,180,220,0.5)";
  ctx.font = "500 12px 'Segoe UI', sans-serif";
  ctx.fillText("Fable 5 · 원 프롬프트 액션 게임 테스트", cx, 500);
  ctx.restore();
}

function drawControlsHint() {
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(160,190,230,0.5)";
  ctx.font = "500 11px 'Segoe UI', sans-serif";
  ctx.fillText("이동 WASD/화살표 · 공격 J · 점프 K · 대시 L · 스킬 U I O · 포션 H · 일시정지 P", VW - 12, VH - 12);
  ctx.restore();
}

// 사망 화면: 백섬광 → 어두워지는 무대 위로 "YOU DIED"가 뒤에서 앞으로 천천히 다가온다
function drawYouDie() {
  // 서서히 어두워지는 무대
  const dark = Math.min(0.7, loseT * 0.01);
  ctx.fillStyle = `rgba(2,2,8,${dark})`;
  ctx.fillRect(0, 0, VW, VH);
  // 사망 순간 백섬광
  if (loseT < 12) {
    ctx.fillStyle = `rgba(255,240,240,${0.85 * (1 - loseT / 12)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  // YOU DIE — 저 뒤(작게)에서 앞(크게)으로 다가오며 선명해진다
  const t = Math.min(1, loseT / 140);
  const ease = 1 - Math.pow(1 - t, 3);
  const scale = 0.22 + ease * 1.03;
  const alpha = Math.min(1, loseT / 35) * (0.55 + ease * 0.45);
  ctx.save();
  ctx.translate(VW / 2, VH / 2 - 16);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "#8a0012";
  ctx.shadowBlur = 30 + ease * 30;
  ctx.fillStyle = "#c81e2e";
  ctx.font = "900 96px Georgia, 'Times New Roman', serif";
  ctx.fillText("YOU DIED", 0, 0);
  // 실루엣 테두리로 무게감
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(40,0,4,0.8)";
  ctx.lineWidth = 2.5;
  ctx.strokeText("YOU DIED", 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  // 문구가 자리 잡은 뒤 점수·안내 페이드인
  if (loseT > 110) {
    const a = Math.min(1, (loseT - 110) / 30);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(220,240,255,0.9)";
    ctx.font = "600 18px 'Segoe UI', sans-serif";
    ctx.fillText(`점수 ${world.score} · 최대 콤보 ${world.maxCombo}`, VW / 2, VH / 2 + 78);
    if (Math.floor(loseT / 35) % 2 === 0)
      ctx.fillText(`Enter — WAVE ${world.checkpointWave} 체크포인트에서 계속 · Esc — 타이틀`, VW / 2, VH / 2 + 108);
    ctx.globalAlpha = 1;
  }
}

function overlay(title: string, sub: string, col = "#dff9ff") {
  ctx.fillStyle = "rgba(4,6,12,0.62)";
  ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = col;
  ctx.shadowBlur = 16;
  ctx.fillStyle = col;
  ctx.font = "900 52px 'Segoe UI', sans-serif";
  ctx.fillText(title, VW / 2, VH / 2 - 10);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(220,240,255,0.9)";
  ctx.font = "600 18px 'Segoe UI', sans-serif";
  sub.split("\n").forEach((l, i) => ctx.fillText(l, VW / 2, VH / 2 + 34 + i * 26));
  ctx.restore();
}

// ---- 루프 (고정 타임스텝) ----
let acc = 0;
let last = performance.now();
const STEP = 1000 / 60;
function frame(now: number) {
  let dt = now - last;
  last = now;
  if (dt > 120) dt = 120;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    tick();
    endInputFrame(); // 틱 처리 직후에만 입력 엣지 초기화
    acc -= STEP;
    steps++;
  }
  // 틱이 0번 돈 프레임(고주사율)에서는 입력을 지우지 않는다 → 눌림 유실 방지
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 마우스를 움직이면 커서를 보여주고, 잠시 멈추면 다시 숨긴다 (플레이 중 커서 찾기용)
let cursorTimer: number | undefined;
window.addEventListener("mousemove", () => {
  document.body.classList.add("show-cursor");
  window.clearTimeout(cursorTimer);
  cursorTimer = window.setTimeout(() => document.body.classList.remove("show-cursor"), 1600);
});
