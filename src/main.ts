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

function startGame() {
  world = new World();
  state = "play";
  sfx.ui();
}

function tick() {
  titleT++;
  if (state === "title") {
    if (pressed("start") || pressed("attack")) startGame();
    return;
  }
  if (state === "win" || state === "lose") {
    world.update(); // fx 여운
    if (pressed("start")) state = "title";
    return;
  }
  if (state === "pause") {
    if (pressed("pause") || pressed("start")) state = "play";
    return;
  }
  // play
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
  if (state === "pause") overlay("일시정지", "P / Enter 로 계속");
  if (state === "win") overlay("균열 봉인 완료!", `점수 ${world.score} · 최대 콤보 ${world.maxCombo}\nEnter 로 타이틀`, "#8ef0c0");
  if (state === "lose") overlay("검이 부러졌다…", `점수 ${world.score}\nEnter 로 타이틀`, "#ff8a8a");
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
  ctx.fillText("이동 WASD/화살표 · 공격 J · 점프 K · 대시 L · 스킬 U I O · 일시정지 P", VW - 12, VH - 12);
  ctx.restore();
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
