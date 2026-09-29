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

const SKILLS = [
  { key: "U", name: "파열참", cost: 22 },
  { key: "I", name: "천공참", cost: 30 },
  { key: "O", name: "파열노바", cost: 42 },
];

export function drawHud(ctx: CanvasRenderingContext2D, w: World) {
  const p = w.player;

  // 좌상단 초상 + HP/MP
  ctx.fillStyle = "rgba(10,14,26,0.7)";
  ctx.fillRect(12, 12, 250, 66);
  ctx.strokeStyle = "rgba(120,220,255,0.35)";
  ctx.strokeRect(12, 12, 250, 66);
  ctx.fillStyle = "#dff9ff";
  ctx.font = "700 14px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("파열검사", 22, 30);
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

  // 스킬 아이콘 (하단 좌측)
  const sx = 16;
  const sy = 470;
  const cds = [p.cd1, p.cd2, p.cd3];
  const cdMax = [66, 120, 190];
  for (let i = 0; i < 3; i++) {
    const x = sx + i * 66;
    const ready = cds[i] <= 0 && p.mp >= SKILLS[i].cost;
    ctx.fillStyle = ready ? "rgba(30,60,90,0.85)" : "rgba(20,26,40,0.85)";
    ctx.fillRect(x, sy, 58, 54);
    ctx.strokeStyle = ready ? "#5cf0ff" : "rgba(120,150,190,0.4)";
    ctx.lineWidth = ready ? 2 : 1;
    ctx.strokeRect(x, sy, 58, 54);
    // 쿨다운 오버레이
    if (cds[i] > 0) {
      const fr = cds[i] / cdMax[i];
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, sy, 58, 54 * fr);
    }
    ctx.textAlign = "center";
    if (cds[i] > 0) {
      // 쿨다운 중엔 키 대신 남은 시간(초) 표시
      const sec = cds[i] / 60;
      ctx.fillStyle = "#ffd76a";
      ctx.font = "900 16px 'Segoe UI', sans-serif";
      ctx.fillText(sec >= 10 ? `${Math.ceil(sec)}` : sec.toFixed(1), x + 29, sy + 24);
    } else {
      ctx.fillStyle = ready ? "#dff9ff" : "rgba(200,220,240,0.5)";
      ctx.font = "900 18px 'Segoe UI', sans-serif";
      ctx.fillText(SKILLS[i].key, x + 29, sy + 24);
    }
    ctx.font = "600 10px 'Segoe UI', sans-serif";
    ctx.fillText(SKILLS[i].name, x + 29, sy + 40);
    ctx.font = "600 9px 'Segoe UI', sans-serif";
    ctx.fillStyle = p.mp >= SKILLS[i].cost ? "#7fd4ff" : "#ff8a8a";
    ctx.fillText(`${SKILLS[i].cost}MP`, x + 29, sy + 50);
  }

  // 보스 체력바
  const boss = w.enemies.find((e) => e instanceof Enemy && e.kind === "boss") as Enemy | undefined;
  if (boss && !boss.dead) {
    ctx.fillStyle = "#ffb0c0";
    ctx.textAlign = "center";
    ctx.font = "800 15px 'Segoe UI', sans-serif";
    ctx.fillText("균열 감시자 · RIFT WARDEN", VW / 2, 26);
    bar(ctx, VW / 2 - 260, 34, 520, 12, boss.hp / boss.maxHp, "#ff4d6a");
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
