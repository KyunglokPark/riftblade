// 적: 그림자 졸개 / 돌격병 / 술사 / 보스(균열 감시자)

import { Fighter, Arena } from "./fighter";
import { sfx } from "../core/audio";
import { groundY, clamp, rand, sign } from "../core/util";

export type EnemyKind = "grunt" | "charger" | "caster" | "boss";

interface Spec {
  hp: number;
  speed: number;
  reach: number;
  dmg: number;
  kbx: number;
  launch: number;
  windup: number;
  active: number;
  recover: number;
  hitstun: number;
  radius: number;
  weight: number;
  color: string;
  eye: string;
  score: number;
}

const SPECS: Record<EnemyKind, Spec> = {
  grunt: { hp: 26, speed: 1.5, reach: 46, dmg: 7, kbx: 4, launch: 0, windup: 26, active: 5, recover: 26, hitstun: 12, radius: 16, weight: 1, color: "#2a3350", eye: "#7ce7ff", score: 100 },
  charger: { hp: 40, speed: 1.7, reach: 52, dmg: 12, kbx: 9, launch: 0, windup: 34, active: 10, recover: 40, hitstun: 12, radius: 20, weight: 1.5, color: "#3a2540", eye: "#ff7cae", score: 180 },
  caster: { hp: 20, speed: 1.2, reach: 40, dmg: 8, kbx: 3, launch: 0, windup: 30, active: 4, recover: 30, hitstun: 12, radius: 15, weight: 0.8, color: "#20364a", eye: "#aef7c0", score: 160 },
  boss: { hp: 460, speed: 1.4, reach: 78, dmg: 16, kbx: 10, launch: 0, windup: 34, active: 8, recover: 40, hitstun: 8, radius: 34, weight: 6, color: "#241030", eye: "#ff5c7a", score: 1500 },
};

let swc = 1;

export class Enemy extends Fighter {
  kind: EnemyKind;
  spec: Spec;
  private atkCd = 0;
  private boltCd = 0;
  private phase2 = false;
  telegraph = 0; // 예고(0~1) — 렌더 플래시
  dmgMul = 1; // 웨이브/주기 스케일링 — 데미지 배수
  powerMul = 1; // 점수 보정용 (체력 배수와 동일)
  color: string;
  eye: string;

  constructor(kind: EnemyKind, x: number, z: number, hpMul = 1, dmgMul = 1) {
    const s = SPECS[kind];
    super("enemy", x, z, Math.round(s.hp * hpMul));
    this.kind = kind;
    this.spec = s;
    this.dmgMul = dmgMul;
    this.powerMul = hpMul;
    this.radius = s.radius;
    this.weight = s.weight;
    this.color = s.color;
    this.eye = s.eye;
    this.atkCd = Math.floor(rand(20, 70));
  }

  private separate(arena: Arena) {
    for (const e of arena.enemies) {
      if (e === this || e.dead) continue;
      const dx = this.x - e.x;
      const dz = this.z - e.z;
      const minx = this.radius + e.radius;
      if (Math.abs(dx) < minx && Math.abs(dz) < 26) {
        this.x += sign(dx || rand(-1, 1)) * 0.6;
        this.z += sign(dz || rand(-1, 1)) * 0.3;
      }
    }
  }

  private facePlayer(p: Fighter) {
    this.facing = p.x >= this.x ? 1 : -1;
  }

  private startAttack() {
    this.state = "windup";
    this.t = 0;
    this.telegraph = 1;
  }

  private meleeHit(reachMul = 1) {
    this.active = {
      x: this.x + this.facing * this.spec.reach * 0.5 * reachMul,
      z: this.z,
      rx: this.spec.reach * 0.55 * reachMul,
      rz: 40,
      dmg: Math.round(this.spec.dmg * this.dmgMul),
      kbx: this.spec.kbx,
      kbz: 0,
      launch: this.spec.launch,
      hitstun: 14,
      hitstop: 4,
      shake: 5,
      hitId: `e${this.id}-${swc++}`,
      sfx: "hit",
    };
  }

  update(arena: Arena): void {
    if (this.atkCd > 0) this.atkCd--;
    if (this.boltCd > 0) this.boltCd--;
    if (this.telegraph > 0) this.telegraph = Math.max(0, this.telegraph - 0.05);

    if (this.dead) {
      this.integrate();
      return;
    }
    if (this.hitstun > 0) {
      this.active = null;
      this.state = this.airborne ? "air" : "hurt";
      this.integrate(0.9, 0.9);
      return;
    }

    const p = arena.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.abs(dx);

    // 보스 페이즈 전환
    if (this.kind === "boss" && !this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.telegraph = 1;
      sfx.bossRoar();
      arena.cam.shake(16);
    }

    this.separate(arena);

    switch (this.state) {
      case "windup": {
        this.vx *= 0.8;
        this.vz *= 0.8;
        const w = this.kind === "charger" ? this.spec.windup : this.spec.windup * (this.phase2 ? 0.7 : 1);
        if (this.t >= w) {
          if (this.kind === "charger") {
            this.state = "dashatk";
            this.t = 0;
            this.vx = this.facing * 13;
            sfx.dash();
            arena.particles.slash(
              this.x + this.facing * 30,
              groundY(this.z) - this.air - 36,
              this.facing > 0 ? 0 : Math.PI,
              "#ff8f8f",
              1.0
            );
          } else if (this.kind === "caster") {
            arena.spawnBolt(
              this.x + this.facing * 18,
              this.z,
              this.facing * 6.2,
              Math.round(this.spec.dmg * this.dmgMul)
            );
            sfx.skill();
            this.state = "recover";
            this.t = 0;
            this.boltCd = 90;
          } else {
            this.state = "attack";
            this.t = 0;
            this.meleeHit();
            sfx.swing();
            // 휘두름 참격 이펙트 (적은 붉은 계열로 플레이어와 구분)
            arena.particles.slash(
              this.x + this.facing * 26,
              groundY(this.z) - this.air - 34,
              this.facing > 0 ? 0 : Math.PI,
              "#ff8f8f",
              this.kind === "boss" ? 1.6 : 0.85
            );
            if (this.kind === "boss") {
              // 대검 내려찍기 — 바닥 충격파
              const ix = this.x + this.facing * 46;
              arena.cam.shake(12);
              arena.particles.spark(ix, groundY(this.z) + 2, 14, "#ff8f8f", 9);
              arena.particles.glow(ix, groundY(this.z) - 6, "rgba(255,90,90,0.5)", 46, 10);
            }
          }
        }
        break;
      }
      case "attack": {
        if (this.t < this.spec.active) this.meleeHit();
        else this.active = null;
        if (this.t >= this.spec.active + 2) {
          this.state = "recover";
          this.t = 0;
        }
        break;
      }
      case "dashatk": {
        if (this.t < this.spec.active) {
          this.meleeHit(1.1);
        } else {
          this.active = null;
          this.vx *= 0.85;
        }
        if (this.t >= this.spec.active + 6) {
          this.state = "recover";
          this.t = 0;
          this.atkCd = 40;
        }
        break;
      }
      case "recover": {
        this.vx *= 0.85;
        this.vz *= 0.85;
        if (this.t >= this.spec.recover * (this.phase2 ? 0.7 : 1)) {
          this.state = "chase";
          this.t = 0;
          this.atkCd = Math.floor(rand(16, this.kind === "boss" ? 46 : 60));
        }
        break;
      }
      default: {
        // chase / idle
        this.facePlayer(p);
        const spd = this.spec.speed * (this.phase2 ? 1.35 : 1);
        if (this.kind === "caster") {
          // 거리 유지
          if (dist < 190) {
            this.vx = -sign(dx) * spd;
          } else if (dist > 320) {
            this.vx = sign(dx) * spd;
          } else {
            this.vx *= 0.8;
          }
          this.vz = sign(dz) * spd * 0.7;
          if (this.boltCd <= 0 && Math.abs(dz) < 60 && dist < 360 && this.atkCd <= 0) {
            this.startAttack();
          }
        } else if (this.kind === "charger") {
          if (dist > 90 && dist < 360 && Math.abs(dz) < 46 && this.atkCd <= 0) {
            this.startAttack();
          } else {
            this.vx = sign(dx) * spd;
            this.vz = sign(dz) * spd * 0.7;
          }
        } else {
          // grunt / boss
          const rng = this.spec.reach * 0.82;
          if (dist <= rng && Math.abs(dz) < 40 && this.atkCd <= 0) {
            this.facePlayer(p);
            this.startAttack();
          } else {
            this.vx = sign(dx) * spd;
            this.vz = clamp(dz, -spd, spd);
            if (dist < rng) this.vx = 0;
          }
        }
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1) this.walkPhase += 0.25;
        break;
      }
    }

    // 보스 착지 슬램 콤보(페이즈2): 가끔 큰 도약 후 낙하
    this.integrate(0.9, 0.86);
    if (this.state !== "windup" && this.state !== "attack" && this.state !== "dashatk") {
      this.active = null;
    }
  }

  onLand() {
    if (this.kind === "boss") {
      // 착지 여파
    }
  }

  /** 렌더용: 공격 모션 진행도 — windup/strike 단계와 0..1 진행률. 공격 중이 아니면 null */
  attackAnim(): { phase: "windup" | "strike"; prog: number } | null {
    if (this.state === "windup") {
      const w = this.kind === "charger" ? this.spec.windup : this.spec.windup * (this.phase2 ? 0.7 : 1);
      return { phase: "windup", prog: clamp(this.t / w, 0, 1) };
    }
    if (this.state === "attack" || this.state === "dashatk") {
      return { phase: "strike", prog: clamp(this.t / (this.spec.active + 2), 0, 1) };
    }
    // 술사는 예비 끝에 볼트를 던지고 바로 recover로 가므로, 투척 동작은 recover 초반에 재생
    if (this.kind === "caster" && this.state === "recover" && this.t < 14) {
      return { phase: "strike", prog: clamp(this.t / 14, 0, 1) };
    }
    return null;
  }

  render_shadowScale() {
    return this.radius;
  }
  playDeathFx(arena: Arena) {
    const gy = groundY(this.z) - this.air;
    arena.particles.shard(this.x, gy - 20, this.kind === "boss" ? 40 : 12, this.color);
    arena.particles.spark(this.x, gy - 20, this.kind === "boss" ? 40 : 14, this.eye, 8);
    arena.particles.glow(this.x, gy - 20, "rgba(120,200,255,0.5)", this.kind === "boss" ? 100 : 40, 20);
    if (this.kind === "boss") {
      arena.particles.ring(this.x, gy - 20, "rgba(255,255,255,0.9)", 20, 14, 30);
    }
  }
}
