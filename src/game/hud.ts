// HUD: 체력/마나 · 콤보 · 스킬 쿨다운 · 보스 체력 · 웨이브 배너

import type { World } from "./world";
import { Enemy } from "./enemy";
import { VW } from "../core/util";

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  col: string,
  bg = "rgba(0,0,0,0.55)"
) {
  ctx.fillStyle = bg;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

const CLASS_SKILLS: Record<string, { key: string; name: string; cost: number }[]> = {
  knight: [
    { key: "U", name: "파열참", cost: 22 },
    { key: "I", name: "천공참", cost: 30 },
    { key: "O", name: "파열노바", cost: 42 },
  ],
  archer: [
    { key: "U", name: "관통사격", cost: 22 },
    { key: "I", name: "화살비", cost: 30 },
    { key: "O", name: "폭발화살", cost: 42 },
  ],
  mage: [
    { key: "U", name: "화염구", cost: 22 },
    { key: "I", name: "화염벽", cost: 30 },
    { key: "O", name: "비전폭풍", cost: 42 },
  ],
};
const CLASS_NAME: Record<string, string> = { knight: "파열검사", archer: "바람 사수", mage: "균열 술사" };

export function drawHud(ctx: CanvasRenderingContext2D, w: World) {
  const p = w.player;
  const SKILLS = CLASS_SKILLS[p.cls] ?? CLASS_SKILLS.knight;

  // 좌상단 초상 + HP/MP
  ctx.fillStyle = "rgba(10,14,26,0.7)";
  ctx.fillRect(12, 12, 250, 66);
  ctx.strokeStyle = "rgba(120,220,255,0.35)";
  ctx.strokeRect(12, 12, 250, 66);
  ctx.fillStyle = "#dff9ff";
  ctx.font = "700 14px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(CLASS_NAME[p.cls] ?? "파열검사", 22, 30);
  bar(ctx, 22, 38, 230, 12, p.hp / p.maxHp, "#ff5b6e");
  bar(ctx, 22, 56, 230, 8, p.mp / p.maxMp, "#5cc8ff");

  // 점수 / 콤보(우상단)
  ctx.textAlign = "right";
  ctx.fillStyle = "#dff9ff";
  ctx.font = "800 20px 'Segoe UI', sans-serif";
  ctx.fillText(`${w.score}`, VW - 16, 34);
  ctx.font = "600 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(200,230,255,0.6)";
  ctx.fillText("SCORE", VW - 16, 48);

  // 콤보 카운터
  if (w.combo >= 2) {
    ctx.save();
    ctx.textAlign = "center";
    const pop = w.combo !== (drawHud as any)._pc ? 1.35 : 1;
    (drawHud as any)._pc = w.combo;
    ctx.translate(VW - 120, 96);
    ctx.scale(pop, pop);
    ctx.font = "900 40px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffd76a";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 5;
    ctx.strokeText(`${w.combo}`, 0, 0);
    ctx.fillText(`${w.combo}`, 0, 0);
    ctx.font = "800 15px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#fff2c8";
    ctx.fillText("COMBO", 4, 18);
    ctx.restore();
  }

  // 스킬 아이콘 (좌측 세로 — 플레이어 패널 아래, 전장을 가리지 않게)
  const sx = 16;
  const sy = 96;
  const STEP = 60;
  const cds = [p.cd1, p.cd2, p.cd3];
  const cdMax = [66, 120, 190];
  for (let i = 0; i < 3; i++) {
    const x = sx;
    const y = sy + i * STEP;
    const ready = cds[i] <= 0 && p.mp >= SKILLS[i].cost;
    ctx.fillStyle = ready ? "rgba(30,60,90,0.8)" : "rgba(20,26,40,0.8)";
    ctx.fillRect(x, y, 58, 54);
    ctx.strokeStyle = ready ? "#5cf0ff" : "rgba(120,150,190,0.4)";
    ctx.lineWidth = ready ? 2 : 1;
    ctx.strokeRect(x, y, 58, 54);
    // 쿨다운 오버레이
    if (cds[i] > 0) {
      const fr = cds[i] / cdMax[i];
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, y, 58, 54 * fr);
    }
    ctx.textAlign = "center";
    if (cds[i] > 0) {
      // 쿨다운 중엔 키 대신 남은 시간(초) 표시
      const sec = cds[i] / 60;
      ctx.fillStyle = "#ffd76a";
      ctx.font = "900 16px 'Segoe UI', sans-serif";
      ctx.fillText(sec >= 10 ? `${Math.ceil(sec)}` : sec.toFixed(1), x + 29, y + 24);
    } else {
      ctx.fillStyle = ready ? "#dff9ff" : "rgba(200,220,240,0.5)";
      ctx.font = "900 18px 'Segoe UI', sans-serif";
      ctx.fillText(SKILLS[i].key, x + 29, y + 24);
    }
    ctx.font = "600 10px 'Segoe UI', sans-serif";
    ctx.fillText(SKILLS[i].name, x + 29, y + 40);
    ctx.font = "600 9px 'Segoe UI', sans-serif";
    ctx.fillStyle = p.mp >= SKILLS[i].cost ? "#7fd4ff" : "#ff8a8a";
    ctx.fillText(`${SKILLS[i].cost}MP`, x + 29, y + 50);
  }

  // 포션 슬롯 (스킬 아래, H키)
  {
    const x = sx;
    const y = sy + 3 * STEP;
    const has = w.potions > 0;
    ctx.fillStyle = has ? "rgba(60,30,40,0.8)" : "rgba(20,26,40,0.8)";
    ctx.fillRect(x, y, 58, 54);
    ctx.strokeStyle = has ? "#ff8a9a" : "rgba(120,150,190,0.4)";
    ctx.lineWidth = has ? 2 : 1;
    ctx.strokeRect(x, y, 58, 54);
    // 작은 플라스크
    ctx.fillStyle = has ? "#ff5b6e" : "rgba(160,120,130,0.5)";
    ctx.fillRect(x + 23, y + 14, 12, 14);
    ctx.fillRect(x + 26, y + 9, 6, 6);
    ctx.textAlign = "center";
    ctx.fillStyle = has ? "#dff9ff" : "rgba(200,220,240,0.5)";
    ctx.font = "900 12px 'Segoe UI', sans-serif";
    ctx.fillText(`x${w.potions}`, x + 29, y + 40);
    ctx.font = "600 10px 'Segoe UI', sans-serif";
    ctx.fillText("H 포션", x + 29, y + 50);
  }

  // 보스 체력바
  const boss = w.enemies.find((e) => e instanceof Enemy && e.isBoss) as Enemy | undefined;
  if (boss && !boss.dead) {
    ctx.fillStyle = "#ffb0c0";
    ctx.textAlign = "center";
    ctx.font = "800 15px 'Segoe UI', sans-serif";
    // 짧은 2겹 피통(총량 동일): 노란 겹이 먼저 닳고 다 비면 빨간 겹 — 빨강까지 비면 사망.
    // 좌상단 플레이어 패널(x12~262)과 겹치지 않게 x330부터.
    const BOSS_TITLE: Record<string, string> = {
      boss: "균열 감시자 · RIFT WARDEN",
      boss2: "공허 사신 · VOID REAPER",
      boss3: "잿불 거인 · EMBER COLOSSUS",
    };
    ctx.fillText(BOSS_TITLE[boss.kind] ?? BOSS_TITLE.boss, VW / 2, 26);
    const ratio = boss.hp / boss.maxHp;
    const bx = VW / 2 - 150;
    if (ratio > 0.5) {
      bar(ctx, bx, 34, 300, 12, 1, "#ff4d6a");
      ctx.fillStyle = "#ffd24d";
      ctx.fillRect(bx, 34, 300 * (ratio - 0.5) * 2, 12);
    } else {
      bar(ctx, bx, 34, 300, 12, ratio * 2, "#ff4d6a");
    }
  }

  // 튜토리얼 안내
  if (w.tutorialStep >= 0) {
    const cls = p.cls;
    const dashTxt = cls === "mage" ? "L / Shift — 점멸로 순간이동해보자" : "L / Shift — 대시 (짧은 무적!)";
    const atkTxt =
      cls === "knight" ? "J — 검격! 연타하면 콤보" : cls === "archer" ? "J — 화살 발사!" : "J — 매직볼트 발사!";
    const skillTxt =
      cls === "knight" ? "U — 스킬 '파열참' 사용 (MP 소모)" : cls === "archer" ? "U — 스킬 '관통사격' 사용 (MP 소모)" : "U — 스킬 '화염구' 사용 (MP 소모)";
    const MSG = [
      "←→↑↓ / WASD — 자유롭게 움직여보자",
      "K / Space — 점프",
      dashTxt,
      atkTxt + "  — 허수아비를 처치하라",
      skillTxt,
      "튜토리얼 완료! 균열로 향한다...",
    ];
    const msg = MSG[Math.min(w.tutorialStep, MSG.length - 1)];
    ctx.save();
    ctx.textAlign = "center";
    // 단계 표시
    if (w.tutorialStep < 5) {
      ctx.fillStyle = "rgba(200,230,255,0.7)";
      ctx.font = "700 14px 'Segoe UI', sans-serif";
      ctx.fillText(`튜토리얼 ${w.tutorialStep + 1} / 5`, VW / 2, 150);
    }
    ctx.globalAlpha = 0.85 + Math.sin(w.timeMs * 0.006) * 0.15;
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 24px 'Segoe UI', sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 5;
    ctx.strokeText(msg, VW / 2, 185);
    ctx.fillText(msg, VW / 2, 185);
    ctx.restore();
  }

  // 균열의 문 안내
  if (w.gate && !w.transition) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.75 + Math.sin(w.timeMs * 0.008) * 0.25;
    ctx.fillStyle = "#7ce7ff";
    ctx.font = "800 20px 'Segoe UI', sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 4;
    ctx.strokeText("균열의 문이 열렸다 — 문으로 들어가라", VW / 2, 190);
    ctx.fillText("균열의 문이 열렸다 — 문으로 들어가라", VW / 2, 190);
    ctx.restore();
  }

  // 웨이브 배너
  if (w.bannerT > 0) {
    const a = Math.min(1, w.bannerT / 40) * Math.min(1, (150 - w.bannerT) / 20 + 0.2);
    ctx.globalAlpha = Math.min(1, a);
    ctx.textAlign = "center";
    ctx.fillStyle = "#dff9ff";
    ctx.font = "900 30px 'Segoe UI', sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 5;
    ctx.strokeText(w.banner, VW / 2, 150);
    ctx.fillText(w.banner, VW / 2, 150);
    ctx.globalAlpha = 1;
  }
}
