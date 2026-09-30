// 적: 그림자 졸개 / 돌격병 / 술사 / 보스(균열 감시자)

import { Fighter, Arena } from "./fighter";
import { sfx } from "../core/audio";
import { groundY, clamp, rand, sign } from "../core/util";

export type EnemyKind = "grunt" | "charger" | "caster" | "boss" | "wolf" | "guard" | "bomber" | "lancer" | "shaman";

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
  wolf: { hp: 22, speed: 2.6, reach: 42, dmg: 9, kbx: 5, launch: 0, windup: 20, active: 14, recover: 34, hitstun: 10, radius: 15, weight: 0.9, color: "#1d3242", eye: "#bfeaff", score: 140 },
  guard: { hp: 70, speed: 1.0, reach: 50, dmg: 14, kbx: 8, launch: 0, windup: 30, active: 6, recover: 44, hitstun: 12, radius: 20, weight: 4, color: "#2c2c34", eye: "#ffb84a", score: 220 },
  bomber: { hp: 14, speed: 2.2, reach: 46, dmg: 18, kbx: 9, launch: 6, windup: 26, active: 2, recover: 10, hitstun: 20, radius: 13, weight: 0.7, color: "#22283a", eye: "#ff9a3c", score: 120 },
  lancer: { hp: 24, speed: 1.6, reach: 88, dmg: 10, kbx: 6, launch: 0, windup: 24, active: 6, recover: 30, hitstun: 12, radius: 15, weight: 1, color: "#232744", eye: "#c58bff", score: 170 },
  shaman: { hp: 26, speed: 1.1, reach: 40, dmg: 6, kbx: 3, launch: 0, windup: 40, active: 2, recover: 50, hitstun: 12, radius: 15, weight: 0.9, color: "#1e2a30", eye: "#e8f4ff", score: 260 },
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
  elite = false; // 기습병(노란 테두리): 엇박자 예비동작 + 잦은 공격
  private windupMul = 1; // 이번 공격의 예비동작 배율 (엘리트는 매번 랜덤)
  color: string;
  eye: string;

  constructor(kind: EnemyKind, x: number, z: number, hpMul = 1, dmgMul = 1, elite = false) {
    const s = SPECS[kind];
    super("enemy", x, z, Math.round(s.hp * hpMul));
    this.kind = kind;
    this.spec = s;
    this.dmgMul = dmgMul;
    this.powerMul = hpMul;
    this.elite = elite;
    this.radius = s.radius;
    this.weight = s.weight;
    this.color = s.color;
    this.eye = s.eye;
    this.atkCd = Math.floor(rand(20, 70));
    if (kind === "guard") this.lockFacingOnHurt = true; // 맞아도 홱 돌지 않는다
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

  private turnT = 0; // 수호병 방향 전환 지연 타이머

  private facePlayer(p: Fighter) {
    const want = p.x >= this.x ? 1 : -1;
    if (want === this.facing) {
      this.turnT = 0;
      return;
    }
    // 수호병은 무겁게 돈다 — 뒤를 잡으면 한동안 등이 열려 있다
    if (this.kind === "guard" && ++this.turnT < 45) return;
    this.turnT = 0;
    this.facing = want;
  }

  private startAttack() {
    this.state = "windup";
    this.t = 0;
    this.telegraph = 1;
    // 엘리트는 예비동작 길이가 매번 달라진다 — 빠른 기습(0.45)부터 낚시성 지연(1.35)까지
    this.windupMul = this.elite ? rand(0.45, 1.35) : 1;
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
        const w =
          (this.kind === "charger" ? this.spec.windup : this.spec.windup * (this.phase2 ? 0.7 : 1)) *
          this.windupMul;
        if (this.t >= w) {
          if (this.kind === "wolf") {
            // 도약 물기: 포물선으로 덮친다
            this.state = "dashatk";
            this.t = 0;
            this.vx = this.facing * 10.5;
            this.vair = 7.5;
            this.air = Math.max(this.air, 1);
            sfx.dash();
          } else if (this.kind === "charger") {
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
          } else if (this.kind === "bomber") {
            // 폭발! (한 번의 광역 판정 후 소멸)
            this.state = "attack";
            this.t = 0;
            this.active = {
              x: this.x,
              z: this.z,
              rx: 74,
              rz: 54,
              dmg: Math.round(this.spec.dmg * this.dmgMul),
              kbx: 9,
              kbz: 1,
              launch: 6,
              hitstun: 20,
              hitstop: 8,
              shake: 12,
              hitId: `e${this.id}-${swc++}`,
              sfx: "nova",
            };
            const bgy = groundY(this.z) - this.air;
            arena.particles.ring(this.x, bgy - 16, "rgba(255,150,60,0.95)", 20, 10, 26);
            arena.particles.ring(this.x, bgy - 16, "rgba(255,220,120,0.8)", 10, 14, 20);
            arena.particles.spark(this.x, bgy - 18, 24, "#ffb060", 10);
            arena.particles.ember(this.x, bgy - 14, 16, "rgba(255,150,60,0.9)");
            arena.particles.dust(this.x, bgy, 10);
            arena.cam.shake(10);
            sfx.nova();
          } else if (this.kind === "shaman") {
            // 치유 의식: 주변 아군 회복
            let healed = 0;
            for (const ally of arena.enemies) {
              if (ally === this || ally.dead || ally.hp >= ally.maxHp) continue;
              if (Math.abs(ally.x - this.x) < 220 && Math.abs(ally.z - this.z) < 80) {
                const amt = Math.round(10 * this.powerMul);
                ally.hp = Math.min(ally.maxHp, ally.hp + amt);
                arena.particles.text(ally.x, groundY(ally.z) - ally.air - 40, `+${amt}`, "#eafff2", 1);
                arena.particles.glow(ally.x, groundY(ally.z) - ally.air - 26, "rgba(230,255,240,0.55)", 26, 8);
                healed++;
              }
            }
            if (healed > 0) sfx.skill();
            this.state = "recover";
            this.t = 0;
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
        if (this.kind === "bomber") {
          // 폭발 판정 유지 후 소멸 (active는 windup 종료 시 이미 설정됨)
          if (this.t >= this.spec.active) {
            this.active = null;
            this.hp = 0;
            this.dead = true;
          }
          break;
        }
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
          this.atkCd = Math.floor(rand(16, this.kind === "boss" ? 46 : 60) * (this.elite ? 0.55 : 1));
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
        } else if (this.kind === "wolf") {
          if (dist > 110 && dist < 300 && Math.abs(dz) < 44 && this.atkCd <= 0) {
            this.startAttack(); // 웅크렸다가 도약
          } else {
            this.vx = sign(dx) * spd;
            this.vz = sign(dz) * spd * 0.7;
            if (dist <= 110 && this.atkCd > 0) this.vx = -sign(dx) * spd * 0.6; // 재정비 거리 벌리기
          }
        } else if (this.kind === "bomber") {
          // 곧장 달라붙어 자폭 카운트다운
          this.vx = sign(dx) * spd;
          this.vz = sign(dz) * spd * 0.8;
          if (dist < 48 && Math.abs(dz) < 30) this.startAttack();
        } else if (this.kind === "lancer") {
          // 창 사거리 유지하며 긴 찌르기
          if (dist < 90) this.vx = -sign(dx) * spd;
          else if (dist > 190) this.vx = sign(dx) * spd;
          else this.vx *= 0.8;
          this.vz = sign(dz) * spd * 0.7;
          if (dist >= 90 && dist < 165 && Math.abs(dz) < 40 && this.atkCd <= 0) {
            this.facePlayer(p);
            this.startAttack();
          }
        } else if (this.kind === "shaman") {
          // 플레이어와 거리 유지, 다친 아군이 있으면 치유 의식
          if (dist < 240) this.vx = -sign(dx) * spd;
          else this.vx *= 0.8;
          this.vz = sign(dz) * spd * 0.5;
          const hurtAlly = arena.enemies.some(
            (al) => al !== this && !al.dead && al.hp < al.maxHp && Math.abs(al.x - this.x) < 220
          );
          if (hurtAlly && this.atkCd <= 0) this.startAttack();
        } else {
          // grunt / guard / boss
          const rng = this.spec.reach * 0.82;
          const facingPlayer = this.facing === (dx >= 0 ? 1 : -1);
          if (dist <= rng && Math.abs(dz) < 40 && this.atkCd <= 0 && (this.kind !== "guard" || facingPlayer)) {
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

  /** 수호병: 전면 가드 — 자기 공격 중이나 경직 중이 아닐 때 정면에서 오는 공격을 막는다 */
  blocksFrontal(fromX: number): boolean {
    if (this.kind !== "guard" || this.dead || this.hitstun > 0) return false;
    if (this.state === "attack") return false; // 휘두르는 순간이 빈틈
    return this.facing === (fromX >= this.x ? 1 : -1);
  }

  /** 렌더용: 공격 모션 진행도 — windup/strike 단계와 0..1 진행률. 공격 중이 아니면 null */
  attackAnim(): { phase: "windup" | "strike"; prog: number } | null {
    if (this.state === "windup") {
      const w =
        (this.kind === "charger" ? this.spec.windup : this.spec.windup * (this.phase2 ? 0.7 : 1)) *
        this.windupMul;
      return { phase: "windup", prog: clamp(this.t / w, 0, 1) };
    }
    if (this.state === "attack" || this.state === "dashatk") {
      return { phase: "strike", prog: clamp(this.t / (this.spec.active + 2), 0, 1) };
    }
    // 술사/주술사는 예비 끝에 발동하고 바로 recover로 가므로, 릴리즈 동작은 recover 초반에 재생
    if ((this.kind === "caster" || this.kind === "shaman") && this.state === "recover" && this.t < 14) {
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
