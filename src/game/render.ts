// 프로시저럴 렌더링: 배경 · 캐릭터 · 적 · 투사체 (외부 이미지 없음)

import type { World } from "./world";
import { Enemy } from "./enemy";
import { Player } from "./player";
import { Fighter } from "./fighter";
import { groundY, depthScale, VW, VH, ZMAX, GROUND_BACK, GROUND_FRONT } from "../core/util";

// ---- 스프라이트 (Pixellab 에셋) 로더 ----
const SPRITE_SCALE = 1.2;

interface Spr {
  img: HTMLImageElement;
  ready: boolean;
  white: HTMLCanvasElement | null; // 피격 백색 실루엣
  red: HTMLCanvasElement | null; // 예고 붉은 실루엣
}
function tintCanvas(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
function loadSpr(src: string): Spr {
  const s: Spr = { img: new Image(), ready: false, white: null, red: null };
  s.img.onload = () => {
    s.ready = true;
    s.white = tintCanvas(s.img, "#eaffff");
    s.red = tintCanvas(s.img, "#ff6a6a");
  };
  s.img.src = src;
  return s;
}

const heroSpr = loadSpr("/sprites/hero.png");
// Idle 숨쉬기 프레임 애니메이션 (Pixellab breathing-idle, 200ms/프레임)
const IDLE_FRAME_TICKS = 12; // 200ms @ 60fps
const heroIdle = [0, 1, 2, 3].map((i) => loadSpr(`/sprites/hero_idle_${i}.png`));
// 걷기 프레임 (Pixellab v3 walking, 88x88 캔버스 — 발 73행, 중심 44열)
const WALK_FRAME_PHASE = 1.5; // walkPhase 1.5당 1프레임 (틱당 0.3 증가 → 약 12fps)
const heroWalk = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => loadSpr(`/sprites/hero_walk_${i}.png`));
// 공격 키포즈 (Create State, 88x88 — 발 75행, 중심 40열). 예비→타격 전환 + 코드 연출로 휘두름을 합성
const heroAtkWindup = loadSpr("/sprites/hero_atk_windup.png");
const heroAtkStrike = loadSpr("/sprites/hero_atk_strike.png");
// 점프 프레임 (88 캔버스, 수직 속도에 매핑: 도약→상승→정점→하강). 프레임별 발/중심 앵커
const heroJump = [0, 1, 2, 3].map((i) => loadSpr(`/sprites/hero_jump_${i}.png`));
const HERO_JUMP_ANCHOR = [
  { cx: 43, foot: 70 },
  { cx: 39, foot: 52 },
  { cx: 42, foot: 54 },
  { cx: 44, foot: 75 },
];
const enemySpr: Record<string, Spr> = {
  grunt: loadSpr("/sprites/grunt.png"),
  charger: loadSpr("/sprites/charger.png"),
  caster: loadSpr("/sprites/caster.png"),
  boss: loadSpr("/sprites/boss.png"),
};
const ENEMY_SCALE: Record<string, number> = { grunt: 1.0, charger: 1.18, caster: 1.02, boss: 2.6 };

// 적 걷기 프레임 (Pixellab v3 walking). 캔버스가 88/84 혼재라 종류별 발/중심 앵커 사용.
const enemyWalk: Record<string, Spr[]> = Object.fromEntries(
  ["grunt", "charger", "caster", "boss"].map((k) => [
    k,
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => loadSpr(`/sprites/${k}_walk_${i}.png`)),
  ])
);
// cx: 몸 중심 열, foot: 발 행, size: 캔버스 크기 (gif2frames.cjs 바운딩박스 실측값)
const ENEMY_WALK_ANCHOR: Record<string, { cx: number; foot: number; size: number }> = {
  grunt: { cx: 46, foot: 75, size: 88 },
  charger: { cx: 43, foot: 75, size: 88 },
  caster: { cx: 40, foot: 71, size: 84 },
  boss: { cx: 47, foot: 74, size: 88 },
};
const ENEMY_WALK_PHASE = 1.5; // walkPhase(틱당 0.25)당 프레임 진행 → 약 10fps
// 적 공격 프레임 (Pixellab 템플릿): frames 앞쪽 windup개는 예비, 나머지는 타격.
// cx/foot/size는 캔버스별 실측 앵커.
interface EnemyAtkCfg {
  frames: Spr[];
  windup: number;
  size: number;
  anchors: { cx: number; foot: number }[]; // 프레임별 앵커 (길이 1이면 전 프레임 공통)
}
const ENEMY_ATK: Record<string, EnemyAtkCfg> = {
  grunt: {
    frames: [0, 1, 2, 3, 4, 5].map((i) => loadSpr(`/sprites/grunt_atk_${i}.png`)),
    windup: 5,
    size: 64,
    anchors: [{ cx: 32, foot: 62 }],
  },
  charger: {
    frames: [0, 1, 2, 3, 4, 5].map((i) => loadSpr(`/sprites/charger_atk_${i}.png`)),
    windup: 5,
    size: 88,
    anchors: [{ cx: 44, foot: 74 }],
  },
  caster: {
    // 0~2 오브 충전(예비), 3~6 투척+복귀 (볼트 발사 직후 recover 초반에 재생)
    frames: [0, 1, 2, 3, 4, 5, 6].map((i) => loadSpr(`/sprites/caster_atk_${i}.png`)),
    windup: 3,
    size: 84,
    anchors: [{ cx: 38, foot: 70 }],
  },
  boss: {
    // Create State 키포즈 2장: 0 대검 치켜들기(예비), 1 내려찍기(타격, 웅크려서 발이 낮음)
    frames: [0, 1].map((i) => loadSpr(`/sprites/boss_atk_${i}.png`)),
    windup: 1,
    size: 96,
    anchors: [
      { cx: 48, foot: 78 },
      { cx: 54, foot: 88 },
    ],
  },
};

function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// 원경 배경 이미지 (Retro Diffusion, 1920x1080 → 960x540 스케일)
const bgFar = new Image();
let bgFarReady = false;
bgFar.onload = () => (bgFarReady = true);
bgFar.src = "/sprites/bg_rift.png";
// 무대 세트: 기둥+원근 바닥 일체 이미지 (체커보드 배경 키잉됨) — 기둥 사이로 원경이 보임
const bgMid = new Image();
let bgMidReady = false;
bgMid.onload = () => (bgMidReady = true);
bgMid.src = "/sprites/bg_temple.png";

export function drawBackground(ctx: CanvasRenderingContext2D, camX: number) {
  if (bgFarReady) {
    // 이미지 배경: 미러 타일링(홀수 타일 좌우 반전)으로 이음매 제거, 패럴럭스 0.22
    const off = camX * 0.22;
    const w = VW;
    for (let i = Math.floor(off / w); i * w - off < VW; i++) {
      const dx = i * w - off;
      if (((i % 2) + 2) % 2 === 1) {
        ctx.save();
        ctx.translate(dx + w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(bgFar, 0, 0, w, VH);
        ctx.restore();
      } else {
        ctx.drawImage(bgFar, dx, 0, w, VH);
      }
    }
    // 대기 원근: 원경 하단을 어둠으로 가라앉혀 지평선에서 무대 바닥과 경계가 안 생기게
    const haze = ctx.createLinearGradient(0, 180, 0, GROUND_BACK);
    haze.addColorStop(0, "rgba(5,8,16,0)");
    haze.addColorStop(1, "rgba(5,8,16,0.95)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 180, VW, VH - 180);
  } else {
    // 폴백: 프로시저럴 배경 (이미지 로딩 전)
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, "#0a0b16");
    sky.addColorStop(0.55, "#0d1224");
    sky.addColorStop(1, "#070810");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);

    // 원경 균열(패럴럭스 0.3)
    ctx.save();
    const px = -camX * 0.3;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 380 + px) % (VW + 400)) - 200;
      const g = ctx.createLinearGradient(x, 40, x + 40, 300);
      g.addColorStop(0, "rgba(90,160,255,0.0)");
      g.addColorStop(0.5, "rgba(120,180,255,0.15)");
      g.addColorStop(1, "rgba(90,160,255,0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.lineTo(x + 18, 30);
      ctx.lineTo(x + 30, 320);
      ctx.lineTo(x + 8, 320);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 중경 기둥(패럴럭스 0.6)
    const mx = -camX * 0.6;
    for (let i = -1; i < 10; i++) {
      const x = i * 260 + (mx % 260);
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(x, 120, 46, GROUND_BACK - 120);
      ctx.fillStyle = "rgba(70,120,200,0.12)";
      ctx.fillRect(x + 6, 120, 6, GROUND_BACK - 120);
      // 룬 글로우
      ctx.fillStyle = "rgba(120,220,255,0.16)";
      ctx.fillRect(x + 18, 160, 10, 10);
      ctx.fillRect(x + 18, 210, 10, 10);
    }
  }

  // 무대 세트: 기둥+원근 바닥 일체 — 이미지의 지평선(바닥 시작 라인)을 GROUND_BACK에
  // 정렬해 캐릭터가 이 바닥 위에서 움직인다. 발 미끄러짐이 없도록 카메라와 1:1 스크롤,
  // 이미지가 seamless가 아니므로 미러 타일링.
  const TEMPLE_HORIZON = 404 / 724; // 이미지에서 바닥이 시작되는 세로 비율 (실측)
  if (bgMidReady) {
    const s = GROUND_BACK / (bgMid.naturalHeight * TEMPLE_HORIZON);
    const mw = bgMid.naturalWidth * s;
    const mh = bgMid.naturalHeight * s;
    for (let i = Math.floor(camX / mw); i * mw - camX < VW; i++) {
      const dx = i * mw - camX;
      if (((i % 2) + 2) % 2 === 1) {
        ctx.save();
        ctx.translate(dx + mw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(bgMid, 0, 0, mw, mh);
        ctx.restore();
      } else {
        ctx.drawImage(bgMid, dx, 0, mw, mh);
      }
    }
    // 가독성 셰이드 + 지평선 안개 — 단일 그라디언트로 부드럽게 (계단식 경계 금지:
    // 오버레이가 특정 y에서 뚝 시작되면 그 높이에 가로선이 생긴다)
    const shade = ctx.createLinearGradient(0, GROUND_BACK - 20, 0, VH);
    shade.addColorStop(0, "rgba(5,8,16,0)");
    shade.addColorStop(0.14, "rgba(5,8,16,0.5)"); // 지평선 바로 아래가 가장 어두움
    shade.addColorStop(0.42, "rgba(5,8,16,0.3)");
    shade.addColorStop(1, "rgba(5,8,16,0.16)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, GROUND_BACK - 20, VW, VH - (GROUND_BACK - 20));
  } else {
    // 폴백: 그라디언트 바닥
    const floor = ctx.createLinearGradient(0, GROUND_BACK, 0, GROUND_FRONT + 20);
    floor.addColorStop(0, "#141a2c");
    floor.addColorStop(1, "#0a0d16");
    ctx.fillStyle = floor;
    if (bgFarReady) {
      ctx.globalAlpha = 0.82;
      ctx.fillRect(0, GROUND_BACK, VW, VH - GROUND_BACK);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillRect(0, GROUND_BACK, VW, VH - GROUND_BACK);
    }
  }

  // 바닥 격자 (깊이 라인) — 무대 이미지가 있으면 자체 타일 원근이 있어 생략
  if (!bgMidReady) {
    ctx.strokeStyle = "rgba(90,150,230,0.10)";
    ctx.lineWidth = 1;
    for (let z = 0; z <= ZMAX; z += 30) {
      const y = groundY(z);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VW, y);
      ctx.stroke();
    }
    // 세로 격자(스크롤)
    const gx = -(camX % 120);
    for (let x = gx; x < VW; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_BACK);
      ctx.lineTo(x + (x - VW / 2) * 0.06, GROUND_FRONT + 20);
      ctx.stroke();
    }
  }

  // 바닥 균열 글로우
  ctx.fillStyle = "rgba(90,180,255,0.05)";
  ctx.fillRect(0, GROUND_FRONT - 6, VW, 6);
}

function shadow(ctx: CanvasRenderingContext2D, f: Fighter, camX: number) {
  const sx = f.x - camX;
  const gy = groundY(f.z);
  const sc = depthScale(f.z);
  const shrink = 1 - Math.min(0.6, f.air / 160);
  ctx.save();
  ctx.globalAlpha = 0.35 * shrink;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(sx, gy + 2, (f.radius + 6) * sc * shrink, 6 * sc * shrink, 0, 0, 6.28);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, camX: number) {
  const sx = p.x - camX;
  const gy = groundY(p.z) - p.air;
  const sc = depthScale(p.z);
  const f = p.facing;

  // 스프라이트 로딩 전엔 프로시저럴 폴백
  if (!heroSpr.ready) {
    ctx.save();
    ctx.translate(sx, gy);
    ctx.scale(sc, sc);
    drawHeroBody(ctx, f, p, p.flash > 0 && p.flash % 2 === 0);
    ctx.restore();
    return;
  }

  const S = SPRITE_SCALE * sc;
  const t = p.t;
  const st = p.state;
  let sxs = 1;
  let sys = 1;
  let lean = 0;
  if (st === "run") {
    const b = Math.sin(p.walkPhase * 2);
    sys = 1 + b * 0.06;
    sxs = 1 - b * 0.04;
    lean = f * 0.05;
  } else if (st === "melee") {
    // 예비(뒤로 감기) → 타격(앞으로 스냅 + 전방 스트레치) → 잔여 (공중 공격 포함)
    const ph = p.swingPhase();
    if (ph === "windup") {
      lean = -f * 0.1;
      sxs = 0.94;
      sys = 1.04;
    } else if (ph === "strike") {
      // 내려찍기는 몸을 더 깊게 앞으로 꺾는다
      lean = f * (p.swingKind() === "spike" ? 0.45 : 0.26);
      sxs = 1.12;
      sys = 0.94;
    } else {
      lean = f * 0.14;
    }
  } else if (p.airborne) {
    // 점프 프레임이 준비되면 프레임이 자세를 표현 (스쿼시 없음)
    if (!(st === "air" && heroJump[0].ready)) {
      const up = p.vair > 0;
      sys = up ? 1.12 : 0.94;
      sxs = up ? 0.9 : 1.06;
    }
  } else if (st === "skill1") {
    lean = f * 0.22;
  } else if (st === "skill3") {
    sys = 1.06;
  }
  // idle 숨쉬기: 스케일 펄스 대신 다리는 바닥에 고정하고 상체 행만 1px 오르내리는 픽셀 슬라이스
  const breathing = st === "idle" && !p.airborne;
  // 걷기: 프레임 애니메이션이 준비되면 스쿼시 대신 프레임이 걸음을 표현한다
  const wf = heroWalk[Math.floor(p.walkPhase / WALK_FRAME_PHASE) % heroWalk.length];
  const walkFrame = st === "run" && !p.airborne && wf.ready ? wf : null;
  if (walkFrame) {
    sxs = 1;
    sys = 1;
  }

  const flash = p.flash > 0 && Math.floor(p.flash / 2) % 2 === 0;
  const img: CanvasImageSource = flash && heroSpr.white ? heroSpr.white : heroSpr.img;
  const dashing = st === "dash" || st === "skill1";
  const striking = st === "melee" && p.swingPhase() === "strike";
  // 공격 키포즈: 지상 콤보·공중 공격·내려찍기는 예비/타격 포즈, 파열참(대시 스킬)은 타격 포즈 고정
  // (어퍼는 위로 올려베기라 전방 포즈가 안 맞아 기존 스프라이트 유지)
  const kind = p.swingKind();
  const usePose = kind === "combo" || kind === "air" || kind === "spike";
  const atkPose = usePose
    ? p.swingPhase() === "windup"
      ? heroAtkWindup
      : heroAtkStrike
    : st === "skill1"
      ? heroAtkStrike
      : null;
  const atkReady = atkPose !== null && atkPose.ready;

  ctx.save();
  ctx.translate(sx, gy);
  ctx.rotate(lean);
  ctx.scale(f * S * sxs, S * sys);
  if (dashing) {
    // 파열참은 타격 포즈로 잔상을 길게 끌어 돌진 난무 느낌을 강화
    if (st === "skill1" && atkReady) {
      ctx.globalAlpha = 0.14;
      ctx.drawImage(atkPose!.img, -40 - 22, -75, 88, 88);
      ctx.globalAlpha = 0.24;
      ctx.drawImage(atkPose!.img, -40 - 13, -75, 88, 88);
      ctx.globalAlpha = 0.34;
      ctx.drawImage(atkPose!.img, -40 - 6, -75, 88, 88);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(heroSpr.img, -32 - 10, -62, 64, 64);
      ctx.drawImage(heroSpr.img, -32 - 5, -62, 64, 64);
      ctx.globalAlpha = 1;
    }
  }
  if (striking) {
    // 타격 순간 잔상 — 몸이 확 나가는 속도감
    const gImg = atkReady ? atkPose!.img : heroSpr.img;
    const gx = atkReady ? -40 : -32;
    const gy2 = atkReady ? -75 : -62;
    const gsz = atkReady ? 88 : 64;
    ctx.globalAlpha = 0.22;
    ctx.drawImage(gImg, gx - 7, gy2, gsz, gsz);
    ctx.globalAlpha = 0.1;
    ctx.drawImage(gImg, gx - 14, gy2, gsz, gsz);
    ctx.globalAlpha = 1;
  }
  const idleFrame = breathing ? heroIdle[Math.floor(t / IDLE_FRAME_TICKS) % heroIdle.length] : null;
  if (walkFrame) {
    // 88x88 캔버스: 발(73행)이 지면, 몸 중심이 44열에 오도록 배치
    ctx.drawImage(flash && walkFrame.white ? walkFrame.white : walkFrame.img, -44, -73, 88, 88);
  } else if (atkReady) {
    // 공격 키포즈 (88x88 — 발 75행, 중심 40열)
    ctx.drawImage(flash && atkPose!.white ? atkPose!.white : atkPose!.img, -40, -75, 88, 88);
  } else if (st === "air" && heroJump[0].ready) {
    // 점프: 수직 속도로 도약/상승/정점/하강 프레임 선택
    const ji = p.vair > 7 ? 0 : p.vair > 2 ? 1 : p.vair > -3 ? 2 : 3;
    const jf = heroJump[ji];
    const ja = HERO_JUMP_ANCHOR[ji];
    if (jf.ready) {
      ctx.drawImage(flash && jf.white ? jf.white : jf.img, -ja.cx, -ja.foot, 88, 88);
    } else {
      ctx.drawImage(img, -32, -62, 64, 64);
    }
  } else if (idleFrame && idleFrame.ready) {
    ctx.drawImage(flash && idleFrame.white ? idleFrame.white : idleFrame.img, -32, -62, 64, 64);
  } else if (breathing) {
    // 프레임 로딩 전 폴백: 상체 행만 1px 오르내리는 픽셀 슬라이스
    const CHEST = 52;
    const bob = Math.sin(t * 0.05) > 0 ? 1 : 0;
    ctx.drawImage(img, 0, CHEST, 64, 64 - CHEST, -32, -62 + CHEST, 64, 64 - CHEST);
    ctx.drawImage(img, 0, 0, 64, CHEST, -32, -62 + bob, 64, CHEST);
  } else {
    ctx.drawImage(img, -32, -62, 64, 64);
  }
  ctx.restore();

  drawSwing(ctx, p, sx, gy, S, f);
}

/** 칼 휘두름 궤적(크레센트) — bladeAngle에 따라 위→아래로 휨 */
function drawSwing(
  ctx: CanvasRenderingContext2D,
  p: Player,
  sx: number,
  gy: number,
  S: number,
  f: number
) {
  const a0 = p.bladeAngle();
  if (a0 === null) return;
  // 근접 스윙: 예비 동작 중엔 궤적 없음, 타격 순간 굵고 밝게, 잔여에선 흐려짐
  const ph = p.swingPhase();
  if (ph === "windup") return;
  const striking = ph === "strike" || p.state === "skill1"; // 파열참도 굵은 궤적
  const alpha = ph === "recover" ? 0.3 : 1;
  const wMul = striking ? 1.4 : 1;
  const a = f > 0 ? a0 : Math.PI - a0;
  const R = 46 * S;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx + f * 4 * S, gy - 40 * S);
  ctx.rotate(a);
  ctx.lineCap = "round";
  ctx.shadowColor = "#7cf0ff";
  ctx.shadowBlur = striking ? 24 : 16;
  ctx.strokeStyle = "#eaffff";
  ctx.lineWidth = 6 * S * wMul;
  ctx.beginPath();
  ctx.arc(0, 0, R, -0.55, 0.55);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.6 * alpha;
  ctx.strokeStyle = "#5cf0ff";
  ctx.lineWidth = 2.5 * S * wMul;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.76, -0.5, 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawHeroBody(ctx: CanvasRenderingContext2D, f: number, p: Player, flash: boolean) {
  const coat = flash ? "#eaffff" : "#173a44";
  const coat2 = flash ? "#ffffff" : "#1f5666";
  const trim = flash ? "#ffffff" : "#5cf0ff";
  const skin = flash ? "#ffffff" : "#e7c9a0";

  const run = p.state === "run";
  const wp = p.walkPhase;
  const legSwing = run ? Math.sin(wp) * 8 : p.airborne ? -6 : 0;
  const legSwing2 = run ? Math.sin(wp + Math.PI) * 8 : p.airborne ? 6 : 0;

  // 다리
  capsule(ctx, -4, -20, -6 + legSwing * 0.3, -1 + Math.abs(legSwing) * 0.2, 7, coat);
  capsule(ctx, 4, -20, 6 + legSwing2 * 0.3, -1 + Math.abs(legSwing2) * 0.2, 7, coat);

  // 몸통(코트)
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-9, -46);
  ctx.lineTo(9, -46);
  ctx.lineTo(11, -18);
  ctx.lineTo(-11, -18);
  ctx.closePath();
  ctx.fill();
  // 코트 앞자락
  ctx.fillStyle = coat2;
  ctx.fillRect(-3, -44, 6, 30);
  // 트림 라인
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(0, -16);
  ctx.stroke();

  // 스카프(휘날림)
  ctx.strokeStyle = trim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-2, -44);
  const t = p.t * 0.3;
  ctx.quadraticCurveTo(-f * 14, -44 + Math.sin(t) * 3, -f * 24, -34 + Math.cos(t) * 5);
  ctx.stroke();

  // 머리
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -52, 7, 0, 6.28);
  ctx.fill();
  // 머리카락/후드
  ctx.fillStyle = coat2;
  ctx.beginPath();
  ctx.arc(0, -54, 7.5, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();
  // 눈 글로우
  ctx.fillStyle = trim;
  ctx.fillRect(f * 2 - 1, -53, 3, 2);

  // 팔 + 검 (상태별 포즈)
  drawArmAndSword(ctx, f, p, coat, trim, flash);
}

function drawArmAndSword(
  ctx: CanvasRenderingContext2D,
  f: number,
  p: Player,
  coat: string,
  trim: string,
  flash: boolean
) {
  let ang = -0.5; // 기본 검 각도
  let ext = 1;
  const st = p.state;
  if (st === "melee" && p.t < 16) {
    const prog = Math.min(1, p.t / 12);
    ang = -1.4 + prog * 2.4; // 내려긋기
    ext = 1.1;
  } else if (st === "skill1") {
    ang = 0.2 + Math.sin(p.t * 0.6) * 0.3;
    ext = 1.2;
  } else if (st === "skill2") {
    ang = p.slammedFlag() ? 1.2 : -1.7;
    ext = 1.2;
  } else if (st === "skill3") {
    ang = -1.2;
    ext = 0.8;
  } else if (p.airborne) {
    ang = -0.9;
  }

  const sh = { x: f * 6, y: -40 }; // 어깨
  const handLen = 12 * ext;
  const hx = sh.x + Math.cos(ang) * handLen * f;
  const hy = sh.y + Math.sin(ang) * handLen;
  // 팔
  capsule(ctx, sh.x, sh.y, hx, hy, 5, coat);

  // 검 (글로우)
  const bladeLen = 34;
  const tipx = hx + Math.cos(ang) * bladeLen * f;
  const tipy = hy + Math.sin(ang) * bladeLen;
  ctx.save();
  ctx.shadowColor = "#5cf0ff";
  ctx.shadowBlur = flash ? 4 : 14;
  capsule(ctx, hx, hy, tipx, tipy, 5, flash ? "#ffffff" : "#dff9ff");
  ctx.shadowBlur = 0;
  capsule(ctx, hx, hy, tipx, tipy, 2, trim);
  ctx.restore();
  // 가드
  capsule(ctx, hx - 4 * f, hy - 3, hx + 4 * f, hy + 3, 3, "#9fe8ff");
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, camX: number) {
  const spr = enemySpr[e.kind];
  const sx = e.x - camX;
  const gy = groundY(e.z) - e.air;
  const sc = depthScale(e.z);
  const f = e.facing;

  if (!spr || !spr.ready) {
    drawEnemyShapes(ctx, e, camX);
    return;
  }

  const S = (ENEMY_SCALE[e.kind] ?? 1) * sc;
  let sys = 1;
  let sxs = 1;
  let lean = 0;
  const inAttack = e.state === "windup" || e.state === "attack" || e.state === "dashatk";
  const lunging = (e.state === "attack" || e.state === "dashatk") && e.kind !== "caster";
  // 공격 프레임 애니메이션 (설정된 적만): windup 진행에 따라 예비 프레임, 타격 구간은 나머지 프레임
  const atkCfg = ENEMY_ATK[e.kind];
  const anim = atkCfg ? e.attackAnim() : null;
  let afIdx = 0;
  if (atkCfg && anim) {
    if (anim.phase === "windup") {
      afIdx = Math.min(atkCfg.windup - 1, Math.floor(anim.prog * atkCfg.windup));
    } else {
      const n = atkCfg.frames.length - atkCfg.windup;
      afIdx = atkCfg.windup + Math.min(n - 1, Math.floor(anim.prog * n));
    }
  }
  const afRaw = atkCfg && anim ? atkCfg.frames[afIdx] : null;
  const attackFrame = afRaw !== null && afRaw.ready ? afRaw : null;
  const afAnchor = atkCfg ? atkCfg.anchors[Math.min(afIdx, atkCfg.anchors.length - 1)] : null;
  // 이동 중이면 걷기 프레임 — 단, 공격 프레임이 재생 중일 땐(술사의 recover 투척 등) 걷기보다 우선
  const moving = e.air === 0 && (Math.abs(e.vx) > 0.1 || Math.abs(e.vz) > 0.1);
  const wfArr = enemyWalk[e.kind];
  const wf =
    !inAttack && !attackFrame && moving && wfArr
      ? wfArr[Math.floor(e.walkPhase / ENEMY_WALK_PHASE) % wfArr.length]
      : null;
  const walking = wf !== null && wf.ready;
  if (inAttack) {
    if (attackFrame) {
      // 프레임이 모션을 표현 — 타격/돌진 순간에만 살짝 내지르는 보정
      if (e.state === "attack" || e.state === "dashatk") {
        lean = f * 0.12;
        sxs = 1.06;
      }
    } else if (e.kind === "caster") {
      // 시전: 맥동하며 부풀어오름
      const c = Math.sin(e.t * 0.35);
      sys = 1 + c * 0.05;
      sxs = 1 - c * 0.03;
    } else if (e.state === "windup") {
      // 예비: 뒤로 움츠려 힘 모으기
      lean = -f * 0.12;
      sxs = 0.92;
      sys = 1.06;
    } else {
      // 타격/돌진: 확 앞으로 내지르기
      lean = f * 0.3;
      sxs = 1.16;
      sys = 0.92;
    }
  } else if (!walking) {
    const b = Math.sin(e.walkPhase * 2);
    sys = 1 + b * 0.05;
    sxs = 1 - b * 0.03;
  }
  const flashNow = e.flash > 0 && Math.floor(e.flash / 2) % 2 === 0;
  // 공격 예고의 붉은 점멸은 제거 — 피격 백색 플래시와 헷갈림. 예비 동작(움츠림)이 예고를 대신한다.

  ctx.save();
  ctx.translate(sx, gy);
  ctx.rotate(lean);
  ctx.scale(f * S * sxs, S * sys);
  if (lunging && spr.ready) {
    // 내지르는 순간 잔상
    ctx.globalAlpha = 0.2;
    if (attackFrame && atkCfg && afAnchor) {
      ctx.drawImage(attackFrame.img, -afAnchor.cx - 9, -afAnchor.foot, atkCfg.size, atkCfg.size);
    } else {
      ctx.drawImage(spr.img, -32 - 9, -62, 64, 64);
    }
    ctx.globalAlpha = 1;
  }
  if (walking) {
    const a = ENEMY_WALK_ANCHOR[e.kind];
    const img = flashNow && wf!.white ? wf!.white : wf!.img;
    ctx.drawImage(img, -a.cx, -a.foot, a.size, a.size);
  } else if (attackFrame && atkCfg && afAnchor) {
    const img = flashNow && attackFrame.white ? attackFrame.white : attackFrame.img;
    ctx.drawImage(img, -afAnchor.cx, -afAnchor.foot, atkCfg.size, atkCfg.size);
  } else {
    const img = flashNow && spr.white ? spr.white : spr.img;
    ctx.drawImage(img, -32, -62, 64, 64);
  }
  ctx.restore();

  // HP 바 (보스 제외)
  if (e.kind !== "boss" && e.hp < e.maxHp) {
    const topY = gy - 60 * S - 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(sx - 15, topY - 1, 30, 5);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(sx - 15, topY - 1, 30 * (e.hp / e.maxHp), 5);
  }
}

function drawEnemyShapes(ctx: CanvasRenderingContext2D, e: Enemy, camX: number) {
  const sx = e.x - camX;
  const gy = groundY(e.z) - e.air;
  const sc = depthScale(e.z);
  const f = e.facing;
  const teleg = e.telegraph;
  const flash = e.flash > 0 && e.flash % 2 === 0;

  ctx.save();
  ctx.translate(sx, gy);
  ctx.scale(sc, sc);

  let body = flash ? "#ffffff" : e.color;
  if (teleg > 0.1 && !flash) {
    // 예고: 붉게 점멸
    const on = Math.floor(e.t / 3) % 2 === 0;
    if (on) body = "#ff5a5a";
  }
  const eye = flash ? "#ffffff" : e.eye;
  const wp = e.walkPhase;

  if (e.kind === "boss") {
    // 거대 실루엣 + 갈라진 갑주
    const h = 92;
    // 다리
    capsule(ctx, -14, -30, -18 + Math.sin(wp) * 6, -1, 12, body);
    capsule(ctx, 14, -30, 18 + Math.sin(wp + 3.14) * 6, -1, 12, body);
    // 몸통
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-24, -h);
    ctx.lineTo(24, -h);
    ctx.lineTo(30, -26);
    ctx.lineTo(-30, -26);
    ctx.closePath();
    ctx.fill();
    // 균열 글로우
    ctx.strokeStyle = "rgba(255,90,120,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -h + 10);
    ctx.lineTo(-2, -60);
    ctx.lineTo(-12, -40);
    ctx.stroke();
    // 뿔/머리
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-16, -h);
    ctx.lineTo(-26, -h - 24);
    ctx.lineTo(-8, -h - 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -h);
    ctx.lineTo(26, -h - 24);
    ctx.lineTo(8, -h - 4);
    ctx.fill();
    // 눈
    ctx.fillStyle = eye;
    ctx.shadowColor = eye;
    ctx.shadowBlur = 12;
    ctx.fillRect(-14, -h - 2, 10, 5);
    ctx.fillRect(4, -h - 2, 10, 5);
    ctx.shadowBlur = 0;
    // 무기(거대 클리버)
    if (e.state === "windup" || e.state === "attack") {
      const ang = e.state === "attack" ? 0.6 : -1.5;
      capsule(ctx, f * 20, -70, f * (20 + Math.cos(ang) * 60), -70 + Math.sin(ang) * 60, 10, "#b06a8a");
    }
  } else {
    const h = e.kind === "charger" ? 52 : 44;
    // 다리
    capsule(ctx, -5, -18, -7 + Math.sin(wp) * 5, -1, 6, body);
    capsule(ctx, 5, -18, 7 + Math.sin(wp + 3.14) * 5, -1, 6, body);
    // 몸통
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-9, -h);
    ctx.lineTo(9, -h);
    ctx.lineTo(12, -16);
    ctx.lineTo(-12, -16);
    ctx.closePath();
    ctx.fill();

    if (e.kind === "charger") {
      // 뿔
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-8, -h);
      ctx.lineTo(-16, -h - 12);
      ctx.lineTo(-4, -h - 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, -h);
      ctx.lineTo(16, -h - 12);
      ctx.lineTo(4, -h - 2);
      ctx.fill();
    } else if (e.kind === "caster") {
      // 후드 + 오브
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -h - 2, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "rgba(174,247,192,0.8)";
      ctx.shadowColor = "#aef7c0";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(f * 12, -h + 6, 5, 0, 6.28);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 머리
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -h - 3, 6, 0, 6.28);
    ctx.fill();
    // 눈
    ctx.fillStyle = eye;
    ctx.shadowColor = eye;
    ctx.shadowBlur = 8;
    ctx.fillRect(f * 1 - 3, -h - 4, 3, 3);
    ctx.fillRect(f * 1 + 2, -h - 4, 3, 3);
    ctx.shadowBlur = 0;
  }

  // 적 HP 바 (보스 제외 소형)
  if (e.kind !== "boss" && e.hp < e.maxHp) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-14, -e.radius * 3.4 - 4, 28, 4);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(-14, -e.radius * 3.4 - 4, 28 * (e.hp / e.maxHp), 4);
  }
  ctx.restore();
}

function drawBolts(ctx: CanvasRenderingContext2D, w: World, camX: number) {
  for (const b of w.bolts) {
    const sx = b.x - camX;
    const gy = groundY(b.z) - 22;
    ctx.save();
    ctx.shadowColor = "#aef7c0";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#d7ffe0";
    ctx.beginPath();
    ctx.ellipse(sx, gy, 8, 5, 0, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, w: World) {
  const camX = w.cam.renderX;
  const camY = w.cam.oy;
  ctx.save();
  ctx.translate(0, camY);
  drawBackground(ctx, camX);

  // 깊이 정렬: 뒤(z 큼) 먼저
  const ents: Fighter[] = [w.player, ...w.enemies];
  ents.sort((a, b) => b.z - a.z);
  for (const f of ents) shadow(ctx, f, camX);
  drawBolts(ctx, w, camX);
  for (const f of ents) {
    if (f instanceof Player) drawPlayer(ctx, f, camX);
    else if (f instanceof Enemy) drawEnemy(ctx, f, camX);
  }

  w.particles.draw(ctx, camX);
  ctx.restore();

  // 피격 붉은 플래시
  if (w.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,40,40,${0.18 * (w.hitFlash / 8)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}
