// 플레이어: 기사(근접 콤보·패링) / 궁사(활 연사) / 법사(마법·점멸) · 대시 · 스킬 3종

export type PlayerClass = "knight" | "archer" | "mage";

// 클래스별 스탯: 기사=탱키+패링 MP, 궁사=빠름+명중 MP, 법사=유리몸+MP 자연회복
const CLASS_STATS: Record<PlayerClass, { hp: number; mp: number; speed: number; mpRegen: number }> = {
  knight: { hp: 130, mp: 100, speed: 3.5, mpRegen: 0.015 },
  archer: { hp: 95, mp: 100, speed: 4.0, mpRegen: 0.03 },
  mage: { hp: 80, mp: 130, speed: 3.4, mpRegen: 0.16 },
};

import { Fighter, Arena, ActiveAttack } from "./fighter";
import { isDown, pressed } from "../core/input";
import { sfx } from "../core/audio";
import { groundY, sign, clamp, lerp } from "../core/util";

interface Swing {
  startup: number;
  active: number;
  recover: number;
  reach: number;
  rz: number;
  dmg: number;
  kbx: number;
  kbz: number;
  launch: number;
  hitstun: number;
  hitstop: number;
  shake: number;
  moveX: number;
  color: string;
  arcH: number; // 슬래시 fx 높이 오프셋
  sfxHit?: ActiveAttack["sfx"];
  airMin?: number;
  airMax?: number;
}

const CYAN = "#5cf0ff";
const WHITE = "#eaffff";
const GOLD = "#ffd76a";
const VIOLET = "#c58bff";

const COMBO: Swing[] = [
  { startup: 5, active: 5, recover: 9, reach: 54, rz: 34, dmg: 8, kbx: 2.2, kbz: 0, launch: 0, hitstun: 10, hitstop: 3, shake: 3, moveX: 2.4, color: CYAN, arcH: 40 },
  { startup: 5, active: 5, recover: 9, reach: 54, rz: 34, dmg: 9, kbx: 2.4, kbz: 0, launch: 0, hitstun: 10, hitstop: 3, shake: 3, moveX: 2.6, color: CYAN, arcH: 46 },
  { startup: 6, active: 6, recover: 12, reach: 58, rz: 36, dmg: 12, kbx: 3, kbz: 1.2, launch: 3, hitstun: 13, hitstop: 4, shake: 5, moveX: 3, color: WHITE, arcH: 38 },
  { startup: 9, active: 7, recover: 22, reach: 66, rz: 40, dmg: 20, kbx: 11, kbz: 0, launch: 2, hitstun: 20, hitstop: 8, shake: 10, moveX: 4.5, color: WHITE, arcH: 42, sfxHit: "heavy" },
];

const UPPER: Swing = { startup: 8, active: 6, recover: 22, reach: 48, rz: 38, dmg: 12, kbx: 1.5, kbz: 0, launch: 16, hitstun: 26, hitstop: 6, shake: 7, moveX: 1.5, color: GOLD, arcH: 20, sfxHit: "launch" };
const AIR: Swing = { startup: 4, active: 5, recover: 11, reach: 52, rz: 32, dmg: 10, kbx: 3, kbz: 0, launch: 5, hitstun: 16, hitstop: 4, shake: 3, moveX: 0, color: CYAN, arcH: 30, airMin: -60, airMax: 200 };
const SPIKE: Swing = { startup: 5, active: 6, recover: 14, reach: 54, rz: 36, dmg: 15, kbx: 2, kbz: 0, launch: -22, hitstun: 22, hitstop: 7, shake: 8, moveX: 0, color: VIOLET, arcH: 30, sfxHit: "heavy", airMin: -80, airMax: 300 };

export class Player extends Fighter {
  cls: PlayerClass = "knight";
  mp = 100;
  maxMp = 100;
  cd1 = 0;
  cd2 = 0;
  cd3 = 0;
  private swingCtr = 0;
  private cur: Swing | null = null;
  private swingId = "";
  private comboIdx = 0;
  private airHits = 0;
  private slammed = false;
  score = 0;
  deathT = 0; // 사망 후 경과 틱 (쓰러지는 모션용)

  // 입력 버퍼(프레임): 바쁜 상태에서 누른 키를 잠깐 저장했다가 가능해지면 발동
  private jumpBuf = 0;
  private atkBuf = 0;
  private dashBuf = 0;
  private s1Buf = 0;
  private s2Buf = 0;
  private s3Buf = 0;

  private pollInput() {
    const B = 7;
    if (pressed("jump")) this.jumpBuf = B;
    if (pressed("attack")) this.atkBuf = B;
    if (pressed("dash")) this.dashBuf = B;
    if (pressed("skill1")) this.s1Buf = B;
    if (pressed("skill2")) this.s2Buf = B;
    if (pressed("skill3")) this.s3Buf = B;
    if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.atkBuf > 0) this.atkBuf--;
    if (this.dashBuf > 0) this.dashBuf--;
    if (this.s1Buf > 0) this.s1Buf--;
    if (this.s2Buf > 0) this.s2Buf--;
    if (this.s3Buf > 0) this.s3Buf--;
  }
  private takeJump() {
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      return true;
    }
    return false;
  }
  private takeAtk() {
    if (this.atkBuf > 0) {
      this.atkBuf = 0;
      return true;
    }
    return false;
  }
  private takeDash() {
    if (this.dashBuf > 0) {
      this.dashBuf = 0;
      return true;
    }
    return false;
  }
  private takeS1() {
    if (this.s1Buf > 0) {
      this.s1Buf = 0;
      return true;
    }
    return false;
  }
  private takeS2() {
    if (this.s2Buf > 0) {
      this.s2Buf = 0;
      return true;
    }
    return false;
  }
  private takeS3() {
    if (this.s3Buf > 0) {
      this.s3Buf = 0;
      return true;
    }
    return false;
  }

  constructor(x: number, z: number, cls: PlayerClass = "knight") {
    super("player", x, z, CLASS_STATS[cls].hp);
    this.cls = cls;
    this.mp = CLASS_STATS[cls].mp;
    this.maxMp = CLASS_STATS[cls].mp;
    this.radius = 18;
    this.weight = 3.2;
  }

  private newSwing(sw: Swing) {
    this.cur = sw;
    this.swingId = `p${this.id}-${this.swingCtr++}`;
    this.hitBy.clear(); // 재사용 안전
    this.state = "melee";
    this.t = 0;
    this.active = null;
  }

  private slashFx(arena: Arena, sw: Swing) {
    const gy = groundY(this.z) - this.air - sw.arcH;
    const fx = this.x + this.facing * 30;
    const big = sw === COMBO[COMBO.length - 1];
    arena.particles.slash(fx, gy, this.facing > 0 ? 0 : Math.PI, sw.color, big ? 1.35 : 1);
    arena.particles.glow(fx, gy, "rgba(120,240,255,0.5)", big ? 44 : 34, 10);
    arena.cam.shake(big ? 3 : 1.5); // 휘두름 자체의 반동 — 빗나가도 묵직하게
    sfx.swing();
  }

  private setHitbox(sw: Swing, freshId: boolean) {
    if (freshId) this.swingId = `p${this.id}-${this.swingCtr++}`;
    this.active = {
      x: this.x + this.facing * sw.reach * 0.5,
      z: this.z,
      rx: sw.reach * 0.55,
      rz: sw.rz,
      airMin: sw.airMin,
      airMax: sw.airMax,
      dmg: sw.dmg,
      kbx: sw.kbx,
      kbz: sw.kbz,
      launch: sw.launch,
      hitstun: sw.hitstun,
      hitstop: sw.hitstop,
      shake: sw.shake,
      hitId: this.swingId,
      sfx: sw.sfxHit ?? "hit",
    };
  }

  /** 치명타 보호: 어떤 공격도 한 방에 최대 체력의 45%를 넘는 피해를 주지 못한다 */
  hurt(a: import("./fighter").ActiveAttack, attackerX: number, arena: Arena): boolean {
    const cap = Math.round(this.maxHp * 0.45);
    const capped = a.dmg > cap ? { ...a, dmg: cap } : a;
    return super.hurt(capped, attackerX, arena);
  }

  update(arena: Arena): void {
    if (this.cd1 > 0) this.cd1--;
    if (this.cd2 > 0) this.cd2--;
    if (this.cd3 > 0) this.cd3--;
    // MP 자연회복 — 기사는 느리게(주 수급원 패링), 궁사는 명중 보너스, 법사는 빠르게
    if (this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + CLASS_STATS[this.cls].mpRegen);

    this.pollInput(); // 매 틱 입력 엣지 → 버퍼 (바쁜 상태여도 유실 방지)

    if (this.dead) {
      this.deathT++;
      this.integrate();
      return;
    }
    if (this.hitstun > 0) {
      this.state = this.airborne ? "air" : "hurt";
      this.integrate();
      return;
    }

    switch (this.state) {
      case "melee":
        this.updateMelee(arena);
        break;
      case "shoot":
        this.updateShoot(arena);
        break;
      case "dash":
        this.updateDash(arena);
        break;
      case "skill1":
        this.updateSkill1(arena);
        break;
      case "skill2":
        this.updateSkill2(arena);
        break;
      case "skill3":
        this.updateSkill3(arena);
        break;
      default:
        this.updateFree(arena);
    }
    this.integrate();
    if (!this.airborne && (this.state === "air")) this.state = "idle";
  }

  // ---- 자유 상태 (지상/공중 이동 + 액션 시작) ----
  private updateFree(arena: Arena) {
    const air = this.airborne;
    // 이동
    let mx = 0,
      mz = 0;
    if (isDown("left")) mx -= 1;
    if (isDown("right")) mx += 1;
    if (!air) {
      if (isDown("up")) mz += 1;
      if (isDown("down")) mz -= 1;
    }
    if (mx !== 0) this.facing = sign(mx);
    const spd = CLASS_STATS[this.cls].speed;
    if (air) {
      this.vx += mx * 0.5;
      this.vx = Math.max(-6, Math.min(6, this.vx));
    } else {
      this.vx = mx * spd;
      this.vz = mz * spd * 0.72;
      this.state = mx !== 0 || mz !== 0 ? "run" : "idle";
      if (mx !== 0 || mz !== 0) this.walkPhase += 0.3;
    }

    // 액션
    if (!air && this.cd3 <= 0 && this.mp >= 42 && this.takeS3()) return this.startSkill3(arena);
    if (this.cd2 <= 0 && this.mp >= 30 && this.takeS2()) return this.startSkill2(arena);
    if (this.cd1 <= 0 && this.mp >= 22 && this.takeS1()) return this.startSkill1(arena);
    if (!air && this.takeDash()) return this.startDash(arena);
    if (!air && this.takeJump()) {
      this.vair = 13.5;
      this.air = 1;
      this.state = "air";
      this.airHits = 0;
      sfx.dash();
      return;
    }
    if (this.takeAtk()) {
      if (this.cls !== "knight") {
        // 궁사/법사: 지상·공중 모두 발사
        this.startShoot();
        return;
      }
      if (air) {
        this.newSwing(isDown("down") ? SPIKE : AIR);
        this.airHits++;
      } else if (isDown("down")) {
        this.newSwing(UPPER);
      } else {
        this.comboIdx = 0;
        this.newSwing(COMBO[0]);
      }
    }
  }

  // ---- 원거리 기본공격 (궁사: 화살 / 법사: 매직볼트) ----
  shootWindup() {
    return this.cls === "archer" ? 8 : 14;
  }
  private startShoot() {
    this.state = "shoot";
    this.t = 0;
    this.active = null;
  }
  private updateShoot(arena: Arena) {
    const archer = this.cls === "archer";
    const windup = this.shootWindup();
    const total = windup + (archer ? 8 : 12);
    if (this.t < windup) {
      if (isDown("left")) this.facing = -1;
      else if (isDown("right")) this.facing = 1;
      this.vx *= 0.7;
      this.vz *= 0.7;
    }
    if (this.t === windup) {
      const h = this.air + 30;
      if (archer) {
        arena.spawnPlayerBolt(this.x + this.facing * 22, this.z, this.facing * 13, 10, {
          color: "#cfffe0",
          h,
          sprite: "fx_arrow",
        });
        sfx.arrow();
      } else {
        arena.spawnPlayerBolt(this.x + this.facing * 24, this.z, this.facing * 7.5, 15, {
          color: "#9fd8ff",
          orb: true,
          h,
          sprite: "fx_magicbolt",
        });
        sfx.magic();
        arena.particles.glow(this.x + this.facing * 28, groundY(this.z) - h, "rgba(130,210,255,0.5)", 24, 7);
      }
    }
    // 발사 직후 캔슬: 연사/스킬/대시
    if (this.t >= windup + 2) {
      if (this.cd1 <= 0 && this.mp >= 22 && this.takeS1()) return this.startSkill1(arena);
      if (this.cd2 <= 0 && this.mp >= 30 && this.takeS2()) return this.startSkill2(arena);
      if (this.cd3 <= 0 && this.mp >= 42 && !this.airborne && this.takeS3()) return this.startSkill3(arena);
      if (!this.airborne && this.takeDash()) return this.startDash(arena);
      if (this.takeAtk()) return this.startShoot();
    }
    if (this.t >= total) this.state = this.airborne ? "air" : "idle";
  }

  // ---- 근접 스윙(콤보/어퍼/공중) ----
  private updateMelee(arena: Arena) {
    const sw = this.cur!;
    // 방향 전환은 스윙 시작 직후 잠깐 허용
    if (this.t < sw.startup) {
      if (isDown("left")) this.facing = -1;
      else if (isDown("right")) this.facing = 1;
    }
    // 살짝 전진
    if (this.t >= sw.startup && this.t < sw.startup + sw.active) {
      if (!this.airborne) this.vx = this.facing * sw.moveX;
    }
    // 액티브 프레임
    if (this.t === sw.startup) {
      this.slashFx(arena, sw);
      this.setHitbox(sw, false);
    } else if (this.t > sw.startup && this.t < sw.startup + sw.active) {
      this.setHitbox(sw, false);
    } else {
      this.active = null;
    }

    // 캔슬 가능 구간(액티브 종료 후)
    const total = sw.startup + sw.active + sw.recover;
    const canCancel = this.t >= sw.startup + sw.active;
    if (canCancel) {
      // 스킬/대시/점프 캔슬
      if (this.cd1 <= 0 && this.mp >= 22 && this.takeS1()) return this.startSkill1(arena);
      if (this.cd2 <= 0 && this.mp >= 30 && this.takeS2()) return this.startSkill2(arena);
      if (this.cd3 <= 0 && this.mp >= 42 && !this.airborne && this.takeS3()) return this.startSkill3(arena);
      if (!this.airborne && this.takeDash()) return this.startDash(arena);
      if (!this.airborne && this.takeJump()) {
        this.vair = 13.5;
        this.air = 1;
        this.state = "air";
        this.airHits = 0;
        sfx.dash();
        return;
      }
      // 다음 콤보로 연결
      if (this.takeAtk()) {
        if (this.airborne) {
          if (this.airHits < 3) {
            this.airHits++;
            this.newSwing(isDown("down") ? SPIKE : AIR);
            return;
          }
        } else if (this.cur !== UPPER && this.comboIdx < COMBO.length - 1) {
          this.comboIdx++;
          this.newSwing(COMBO[this.comboIdx]);
          return;
        }
      }
    }
    if (this.t >= total) {
      this.active = null;
      this.state = this.airborne ? "air" : "idle";
      if (!this.airborne) this.updateFree(arena);
    }
  }

  // ---- 대시(무적) / 법사는 점멸(순간이동) ----
  private startDash(arena: Arena) {
    if (this.cls === "mage") {
      // 점멸: 전방 순간이동 + 무적
      const g0 = groundY(this.z) - 26;
      arena.particles.glow(this.x, g0, "rgba(150,220,255,0.6)", 36, 10);
      arena.particles.ember(this.x, g0, 10, "rgba(150,220,255,0.9)");
      this.x += this.facing * 180;
      this.invuln = 20;
      this.state = "dash";
      this.t = 0;
      this.vx = 0;
      const g1 = groundY(this.z) - 26;
      arena.particles.ring(this.x, g1, "rgba(150,220,255,0.8)", 12, 8, 22);
      arena.particles.ember(this.x, g1, 12, "rgba(150,220,255,0.9)");
      sfx.dash();
      return;
    }
    this.state = "dash";
    this.t = 0;
    this.invuln = 16;
    this.vx = this.facing * 17;
    sfx.dash();
    // 박차고 나가는 먼지·글로우
    arena.particles.dust(this.x - this.facing * 12, groundY(this.z) - 4, 6);
    arena.particles.glow(this.x, groundY(this.z) - 24, "rgba(120,220,255,0.35)", 30, 8);
  }
  private updateDash(arena: Arena) {
    if (this.cls === "mage") {
      // 점멸 후 잔상 포즈 — 곧바로 행동 가능
      this.vx *= 0.6;
      if (this.t >= 6) {
        if (this.takeAtk()) return this.startShoot();
        if (this.takeDash()) return this.startDash(arena);
      }
      if (this.t >= 9) this.state = "idle";
      return;
    }
    if (this.t < 13) {
      this.vx = this.facing * 17 * (1 - this.t / 26); // 더 멀리, 서서히 감속
    } else {
      this.vx *= 0.8;
    }
    // 질주 중 발밑 먼지 트레일
    if (this.t < 14 && this.t % 3 === 0) {
      arena.particles.dust(this.x - this.facing * 14, groundY(this.z) - 3, 1);
    }
    if (this.t >= 24) {
      this.state = "idle";
    }
    // 대시 캔슬: 공격/점프
    if (this.t >= 8) {
      if (this.takeAtk()) {
        if (this.cls !== "knight") return this.startShoot();
        this.comboIdx = 0;
        this.newSwing(COMBO[0]);
      } else if (this.takeJump()) {
        this.vair = 13.5;
        this.air = 1;
        this.state = "air";
        this.airHits = 0;
      }
    }
  }

  // ---- 스킬1: 기사 파열참(돌진 다단히트) / 궁사 관통사격 / 법사 화염구 ----
  private startSkill1(arena: Arena) {
    this.mp -= 22;
    this.cd1 = 66;
    this.state = "skill1";
    this.t = 0;
    if (this.cls !== "knight") {
      this.vx *= 0.5;
      sfx.skill();
      return;
    }
    this.invuln = 8;
    this.vx = this.facing * 9.5;
    this.hitBy.clear();
    sfx.skill();
    arena.particles.glow(this.x, groundY(this.z) - this.air - 30, "rgba(120,240,255,0.6)", 60, 14);
  }
  private updateSkill1(arena: Arena) {
    if (this.cls === "archer") {
      // 관통사격: 전열을 꿰뚫는 한 발
      this.vx *= 0.8;
      if (this.t === 10) {
        arena.spawnPlayerBolt(this.x + this.facing * 24, this.z, this.facing * 17, 18, {
          color: "#ffd76a",
          pierce: 99,
          h: this.air + 30,
          sprite: "fx_pierce",
        });
        sfx.heavy();
        arena.particles.glow(this.x + this.facing * 30, groundY(this.z) - this.air - 30, "rgba(255,215,106,0.6)", 30, 8);
      }
      if (this.t >= 24) this.state = "idle";
      return;
    }
    if (this.cls === "mage") {
      // 화염구: 느리지만 명중 시 폭발
      this.vx *= 0.8;
      if (this.t === 14) {
        arena.spawnPlayerBolt(this.x + this.facing * 26, this.z, this.facing * 5.5, 18, {
          color: "#ffb060",
          orb: true,
          explode: { r: 95, dmg: 24 },
          h: this.air + 30,
          sprite: "fx_fireball",
        });
        sfx.nova();
        arena.particles.glow(this.x + this.facing * 30, groundY(this.z) - this.air - 30, "rgba(255,176,96,0.6)", 34, 10);
      }
      if (this.t >= 30) this.state = "idle";
      return;
    }
    if (this.t < 22) this.vx = this.facing * (9.5 - this.t * 0.28);
    else this.vx *= 0.7;
    if (this.t === 2 || this.t === 12)
      arena.spawnFx("fx_riftslash", this.x + this.facing * 30, this.z, {
        h: this.air + 34,
        scale: 1.1,
        life: 16,
        flip: this.facing,
        mode: "slash",
      });
    // 4프레임마다 새 타격
    if (this.t < 22 && this.t % 4 === 0) {
      this.swingId = `p${this.id}-s1-${this.swingCtr++}`;
      const last = this.t >= 18;
      this.active = {
        x: this.x + this.facing * 34,
        z: this.z,
        rx: 46,
        rz: 44,
        dmg: last ? 12 : 7,
        kbx: last ? 9 : 1.5,
        kbz: 0,
        launch: last ? 2 : 0,
        hitstun: last ? 18 : 8,
        hitstop: last ? 6 : 2,
        shake: last ? 8 : 3,
        hitId: this.swingId,
        sfx: last ? "heavy" : "hit",
        skill: true,
      };
      const gy = groundY(this.z) - this.air - 34;
      arena.particles.slash(this.x + this.facing * 34, gy, this.facing > 0 ? 0 : Math.PI, WHITE, 1.2);
    } else {
      this.active = null;
    }
    if (this.t >= 30) this.state = "idle";
  }

  // ---- 스킬2: 기사 천공참 / 궁사 화살비 / 법사 화염벽 ----
  private startSkill2(_arena: Arena) {
    this.mp -= 30;
    this.cd2 = 120;
    this.state = "skill2";
    this.t = 0;
    if (this.cls === "archer" || this.cls === "mage") {
      this.vx *= 0.5;
      sfx.skill();
      return;
    }
    this.slammed = false;
    this.invuln = 26;
    this.vair = 15;
    this.air = 1;
    this.vx = this.facing * 5;
    sfx.skill();
  }
  private updateSkill2(arena: Arena) {
    if (this.cls === "mage") {
      // 화염벽: 전방에 불의 장벽을 세워 지속 피해
      this.vx *= 0.8;
      if (this.t === 14) {
        arena.spawnZone(this.x + this.facing * 140, this.z, "fire");
        arena.particles.glow(this.x + this.facing * 40, groundY(this.z) - this.air - 30, "rgba(255,150,60,0.6)", 34, 10);
      }
      if (this.t >= 28) this.state = "idle";
      return;
    }
    if (this.cls === "archer") {
      // 화살비: 신호탄을 쏘고, 처음 맞는 적 머리 위로 1초간 화살이 쏟아진다
      this.vx *= 0.8;
      if (this.t === 12) {
        arena.spawnPlayerBolt(this.x + this.facing * 22, this.z, this.facing * 12, 10, {
          color: "#8ef0c0",
          h: this.air + 30,
          rain: true,
          sprite: "fx_pierce",
        });
        sfx.heavy();
        arena.particles.spark(this.x + this.facing * 26, groundY(this.z) - this.air - 32, 8, "#8ef0c0", 6);
      }
      if (this.t >= 26) this.state = "idle";
      return;
    }
    if (!this.slammed) {
      this.active = null;
      if (this.vair < 0 && this.air < 120) this.vair = -18; // 급강하
      if (this.air <= 0.6 && this.t > 8) {
        this.swingId = `p${this.id}-s2-${this.swingCtr++}`;
        this.active = {
          x: this.x,
          z: this.z,
          rx: 120,
          rz: 64,
          dmg: 28,
          kbx: 7,
          kbz: 2,
          launch: 6,
          hitstun: 22,
          hitstop: 10,
          shake: 14,
          hitId: this.swingId,
          sfx: "nova",
          skill: true,
        };
        const gy = groundY(this.z);
        arena.particles.ring(this.x, gy - 10, "rgba(150,240,255,0.9)", 20, 8, 24);
        arena.particles.ring(this.x, gy - 10, "rgba(255,255,255,0.7)", 10, 12, 20);
        arena.particles.spark(this.x, gy - 20, 26, WHITE, 10);
        arena.particles.dust(this.x, gy, 18);
        sfx.nova();
        arena.spawnFx("fx_skyslash", this.x, this.z, { h: 10, scale: 1.4, life: 22 });
        this.slammed = true;
        this.t = 0;
      }
    } else {
      if (this.t >= 3) this.active = null;
      if (this.t >= 16) this.state = "idle";
    }
  }

  // ---- 스킬3: 파열 노바 (제자리 광역 폭발) ----
  private startSkill3(arena: Arena) {
    this.mp -= 42;
    this.cd3 = 190;
    this.state = "skill3";
    this.t = 0;
    this.invuln = 40;
    this.vx = 0;
    this.vz = 0;
    sfx.skill();
    const gy = groundY(this.z) - 26;
    arena.particles.glow(this.x, gy, "rgba(180,140,255,0.7)", 60, 20);
  }
  private updateSkill3(arena: Arena) {
    if (this.cls === "archer") {
      // 폭발 화살: 명중 지점 대폭발
      this.vx *= 0.8;
      if (this.t === 14) {
        arena.spawnPlayerBolt(this.x + this.facing * 24, this.z, this.facing * 12, 16, {
          color: "#ff9a5c",
          explode: { r: 115, dmg: 34, kbx: 15 }, // 강넉백 — 적진을 날려버린다
          h: this.air + 30,
          sprite: "fx_pierce",
        });
        sfx.nova();
      }
      if (this.t >= 30) this.state = "idle";
      return;
    }
    const gy = groundY(this.z);
    if (this.t === 16) {
      // 폭발 — 기사 파열노바(청록) / 법사 비전폭풍(보라)
      arena.spawnFx(this.cls === "mage" ? "fx_arcanestorm" : "fx_riftnova", this.x, this.z, {
        h: this.air + 30,
        scale: 2.2,
        life: 26,
      });
      this.swingId = `p${this.id}-s3-${this.swingCtr++}`;
      this.active = {
        x: this.x,
        z: this.z,
        rx: 160,
        rz: 80,
        dmg: 40,
        kbx: 13,
        kbz: 3,
        launch: 8,
        hitstun: 26,
        hitstop: 12,
        shake: 18,
        hitId: this.swingId,
        sfx: "nova",
        skill: true,
      };
      arena.particles.ring(this.x, gy - 20, "rgba(200,150,255,0.95)", 24, 12, 26);
      arena.particles.ring(this.x, gy - 20, "rgba(255,255,255,0.8)", 12, 16, 22);
      arena.particles.ring(this.x, gy - 20, "rgba(120,220,255,0.7)", 30, 9, 30);
      arena.particles.spark(this.x, gy - 30, 40, VIOLET, 14);
      arena.particles.ember(this.x, gy - 20, 24, "rgba(200,150,255,0.9)");
      sfx.nova();
      sfx.bossRoar();
    } else if (this.t === 17) {
      this.active = null;
    }
    if (this.t < 16) {
      // 차징 연출
      if (this.t % 3 === 0) arena.particles.spark(this.x, gy - 24, 4, VIOLET, 5);
    }
    if (this.t >= 40) this.state = "idle";
  }

  onLand() {
    this.airHits = 0;
    if (this.state === "air") this.state = "idle";
  }

  slammedFlag(): boolean {
    return this.slammed;
  }

  /** 렌더용: 현재 스윙 종류 — 지상 콤보만 키포즈 스프라이트를 쓴다 */
  swingKind(): "combo" | "upper" | "spike" | "air" | null {
    if (this.state !== "melee" || !this.cur) return null;
    if (this.cur === UPPER) return "upper";
    if (this.cur === SPIKE) return "spike";
    if (this.cur === AIR) return "air";
    return "combo";
  }

  /** 렌더용: 스윙 단계 — 예비(windup) → 타격(strike) → 잔여(recover). 근접 스윙이 아니면 null */
  swingPhase(): "windup" | "strike" | "recover" | null {
    if (this.state !== "melee" || !this.cur) return null;
    const sw = this.cur;
    if (this.t < sw.startup) return "windup";
    if (this.t <= sw.startup + sw.active + 2) return "strike";
    return "recover";
  }

  /** 렌더용: 현재 스윙의 칼날 각도(라디안, facing=오른쪽 기준). 스윙 아니면 null */
  bladeAngle(): number | null {
    if (this.state === "melee" && this.cur) {
      const sw = this.cur;
      let a0 = -1.4;
      let a1 = 1.15; // 위→아래 내려베기(콤보/공중)
      if (this.cur === UPPER) {
        a0 = 0.9;
        a1 = -1.7; // 아래→위 올려베기
      } else if (this.cur === SPIKE) {
        a0 = -0.4;
        a1 = 1.5; // 위→아래 내려찍기
      }
      if (this.t < sw.startup) {
        // 예비: 시작 각도에서 스윙 반대 방향으로 조금 더 감아쥔다
        return a0 + (a1 > a0 ? -0.25 : 0.25) * (this.t / sw.startup);
      }
      // 타격: easeOut — 첫 프레임에 궤적 대부분을 지나가 속도감을 만든다
      const prog = clamp((this.t - sw.startup) / (sw.active + 2), 0, 1);
      return lerp(a0, a1, 1 - Math.pow(1 - prog, 3));
    }
    if (this.state === "skill1") return -0.2 + Math.sin(this.t * 0.8) * 1.3; // 난무
    if (this.state === "skill2" && this.slammed) return 1.5;
    return null;
  }
}
