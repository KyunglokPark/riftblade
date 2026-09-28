// 파티클 · 데미지 텍스트 (월드 x + 화면 y 좌표계; 카메라는 x만 스크롤)

import { rand } from "./util";

type Kind = "spark" | "dust" | "ember" | "ring" | "slash" | "text" | "glow" | "shard";

interface P {
  kind: Kind;
  x: number; // world x
  y: number; // screen y
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  rot: number;
  spin: number;
  text?: string;
  scale?: number;
}

export class Particles {
  list: P[] = [];

  private add(p: P) {
    this.list.push(p);
  }

  spark(x: number, y: number, n: number, color: string, spread = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(2, spread);
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 0,
        max: rand(14, 26),
        size: rand(1.5, 3.5),
        color,
        grav: 0.35,
        rot: 0,
        spin: 0,
      });
    }
  }

  shard(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(3, 8);
      this.add({
        kind: "shard",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: rand(26, 44),
        size: rand(3, 7),
        color,
        grav: 0.5,
        rot: rand(0, 6.28),
        spin: rand(-0.4, 0.4),
      });
    }
  }

  dust(x: number, y: number, n: number, color = "rgba(150,170,200,0.5)") {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: "dust",
        x,
        y: y - rand(0, 4),
        vx: rand(-1.6, 1.6),
        vy: rand(-1.2, -0.2),
        life: 0,
        max: rand(18, 34),
        size: rand(3, 8),
        color,
        grav: -0.02,
        rot: 0,
        spin: 0,
      });
    }
  }

  ember(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: "ember",
        x,
        y,
        vx: rand(-1.2, 1.2),
        vy: rand(-2.5, -0.5),
        life: 0,
        max: rand(24, 48),
        size: rand(1.5, 3),
        color,
        grav: -0.03,
        rot: 0,
        spin: 0,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 10, grow = 3, max = 22) {
    this.add({
      kind: "ring",
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      max,
      size,
      color,
      grav: grow,
      rot: 0,
      spin: 0,
    });
  }

  slash(x: number, y: number, rot: number, color: string, scale = 1) {
    this.add({
      kind: "slash",
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      max: 10,
      size: 46 * scale,
      color,
      grav: 0,
      rot,
      spin: 0,
      scale,
    });
  }

  glow(x: number, y: number, color: string, size = 40, max = 16) {
    this.add({
      kind: "glow",
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      max,
      size,
      color,
      grav: 0,
      rot: 0,
      spin: 0,
    });
  }

  text(x: number, y: number, text: string, color: string, scale = 1) {
    this.add({
      kind: "text",
      x,
      y,
      vx: rand(-0.4, 0.4),
      vy: -1.8,
      life: 0,
      max: 46,
      size: 0,
      color,
      grav: 0.04,
      rot: 0,
      spin: 0,
      text,
      scale,
    });
  }

  update() {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.rot += p.spin;
      if (p.kind === "ring") p.size += p.grav;
      if (p.kind === "text" && p.vy < 0) p.vy *= 0.9;
      if (p.life >= p.max) l.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number) {
    const l = this.list;
    ctx.save();
    for (const p of l) {
      const t = p.life / p.max;
      const sx = p.x - camX;
      const alpha = 1 - t;
      if (p.kind === "spark" || p.kind === "shard") {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.kind === "shard") {
          ctx.save();
          ctx.translate(sx, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(sx, p.y, p.size * (1 - t * 0.5), 0, 6.28);
          ctx.fill();
        }
      } else if (p.kind === "dust" || p.kind === "ember") {
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, p.y, p.size * (1 + t), 0, 6.28);
        ctx.fill();
      } else if (p.kind === "ring") {
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - t);
        ctx.beginPath();
        ctx.arc(sx, p.y, p.size, 0, 6.28);
        ctx.stroke();
      } else if (p.kind === "glow") {
        const r = p.size * (0.6 + t * 0.8);
        const g = ctx.createRadialGradient(sx, p.y, 0, sx, p.y, r);
        g.addColorStop(0, p.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, p.y, r, 0, 6.28);
        ctx.fill();
      } else if (p.kind === "slash") {
        ctx.save();
        ctx.translate(sx, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        const s = p.size;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, s, -0.9, 0.9);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.7, -0.8, 0.8);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "text") {
        ctx.globalAlpha = alpha;
        const sc = p.scale || 1;
        ctx.font = `900 ${Math.round(20 * sc)}px "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.strokeText(p.text!, sx, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text!, sx, p.y);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
