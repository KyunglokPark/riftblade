// 게임 월드: 엔티티 오케스트레이션 · 히트 판정 · 히트스톱 · 웨이브/보스

import { Arena, Fighter, ActiveAttack } from "./fighter";
import { Player } from "./player";
import { Enemy, EnemyKind } from "./enemy";
import { Particles } from "../core/particles";
import { Camera } from "../core/camera";
import { sfx } from "../core/audio";
import { beltHit, groundY, rand, clamp, VW, STAGE_LEN } from "../core/util";

export interface Bolt {
  x: number;
  z: number;
  vx: number;
  dmg: number;
  life: number;
  dead: boolean;
}

interface WaveDef {
  list: { kind: EnemyKind; count: number }[];
  banner: string;
}

const WAVES: WaveDef[] = [
  { banner: "제 1 균열 · 그림자 정찰대", list: [{ kind: "grunt", count: 3 }] },
  { banner: "제 2 균열 · 돌격 선봉", list: [{ kind: "grunt", count: 3 }, { kind: "charger", count: 1 }] },
  { banner: "제 3 균열 · 저주술사", list: [{ kind: "grunt", count: 2 }, { kind: "caster", count: 2 }] },
  { banner: "제 4 균열 · 대공세", list: [{ kind: "charger", count: 2 }, { kind: "grunt", count: 2 }, { kind: "caster", count: 1 }] },
  { banner: "제 5 균열 · 균열 폭주", list: [{ kind: "grunt", count: 4 }, { kind: "charger", count: 2 }] },
  { banner: "제 6 균열 · 술사 결사대", list: [{ kind: "caster", count: 3 }, { kind: "grunt", count: 2 }] },
  { banner: "제 7 균열 · 철갑 돌격대", list: [{ kind: "charger", count: 3 }, { kind: "caster", count: 1 }] },
  { banner: "제 8 균열 · 그림자 군단", list: [{ kind: "grunt", count: 5 }, { kind: "charger", count: 1 }, { kind: "caster", count: 2 }] },
  { banner: "제 9 균열 · 균열의 정예", list: [{ kind: "charger", count: 3 }, { kind: "caster", count: 3 }, { kind: "grunt", count: 2 }] },
  { banner: "최종 균열 · 감시자 강림", list: [{ kind: "boss", count: 1 }, { kind: "grunt", count: 2 }] },
];

export class World implements Arena {
  player: Player;
  enemies: Fighter[] = [];
  bolts: Bolt[] = [];
  particles = new Particles();
  cam = new Camera();

  result: "playing" | "win" | "lose" = "playing";
  score = 0;
  combo = 0;
  private comboTimer = 0;
  maxCombo = 0;

  wave = 0;
  banner = "";
  bannerT = 0;
  private betweenT = 0;

  private freezeT = 0;
  private slowT = 0;
  private slowSkip = false;
  timeMs = 0;
  hitFlash = 0; // 피격 시 화면 붉은 플래시

  constructor() {
    this.player = new Player(200, 70);
    this.cam.x = 0;
    this.nextWave();
  }

  freeze(frames: number) {
    this.freezeT = Math.max(this.freezeT, frames);
  }
  slowmo(frames: number, _scale: number) {
    this.slowT = Math.max(this.slowT, frames);
  }
  addScore(n: number) {
    this.score += n;
    this.player.score = this.score;
  }
  addCombo() {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = 100;
  }
  spawnBolt(x: number, z: number, vx: number, dmg: number) {
    this.bolts.push({ x, z, vx, dmg, life: 150, dead: false });
  }

  private nextWave() {
    // 무한 모드: 10웨이브가 한 주기. 11웨이브부터는 1웨이브 패턴이 더 강하게 반복된다.
    const widx = this.wave % WAVES.length;
    const cycle = Math.floor(this.wave / WAVES.length);
    const def = WAVES[widx];
    // 스케일링: 같은 몹이라도 뒤 웨이브일수록, 다음 주기일수록 강하다
    const hpMul = (1 + 0.15 * widx) * (1 + 0.9 * cycle);
    const dmgMul = (1 + 0.08 * widx) * (1 + 0.45 * cycle);
    this.banner =
      `WAVE ${this.wave + 1} — ${def.banner}` + (cycle > 0 ? ` · ${cycle + 1}주기` : "");
    this.bannerT = 150;
    let side = 1;
    for (const grp of def.list) {
      for (let i = 0; i < grp.count; i++) {
        const px = this.player.x;
        const off = VW * 0.55 + rand(20, 200);
        let x = clamp(px + side * off, 60, STAGE_LEN - 60);
        side *= -1;
        const z = rand(24, 140);
        const e = new Enemy(grp.kind, x, z, hpMul, dmgMul);
        if (grp.kind === "boss") {
          e.x = clamp(px + (px < STAGE_LEN / 2 ? 420 : -420), 80, STAGE_LEN - 80);
          e.z = 80;
          sfx.bossRoar();
        }
        this.enemies.push(e);
      }
    }
    this.wave++;
  }

  private aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }

  update() {
    this.timeMs += 16.67;
    if (this.bannerT > 0) this.bannerT--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer === 0) this.combo = 0;
    }

    if (this.result !== "playing") {
      this.particles.update();
      this.cam.update();
      return;
    }

    // 히트스톱: 시뮬 정지, 이펙트만 진행
    if (this.freezeT > 0) {
      this.freezeT--;
      this.particles.update();
      this.cam.update();
      return;
    }
    // 슬로모: 격프레임 스킵
    if (this.slowT > 0) {
      this.slowT--;
      this.slowSkip = !this.slowSkip;
      if (this.slowSkip) {
        this.particles.update();
        this.cam.update();
        return;
      }
    }

    // 플레이어
    this.player.update(this);
    // 적
    for (const e of this.enemies) e.update(this);
    // 투사체
    this.updateBolts();

    // 히트 판정
    this.resolveHits();

    // 사망 처리 / 정리
    this.cleanup();

    // 웨이브 진행
    if (this.aliveEnemies().length === 0 && this.result === "playing") {
      if (this.betweenT <= 0) this.betweenT = 90;
      else {
        this.betweenT--;
        if (this.betweenT === 0) this.nextWave();
      }
    }

    // 게임오버
    if (this.player.dead && this.result === "playing") {
      this.result = "lose";
      sfx.lose();
      this.slowmo(60, 0.5);
    }

    this.cam.follow(this.player.x);
    this.cam.update();
    this.particles.update();
  }

  private updateBolts() {
    const p = this.player;
    for (const b of this.bolts) {
      b.x += b.vx;
      b.life--;
      if (b.life <= 0 || b.x < 0 || b.x > STAGE_LEN) b.dead = true;
      if (!b.dead && p.invuln <= 0 && !p.dead && beltHit(b.x, b.z, p.x, p.z, 22, 26) && Math.abs(p.air - b.z * 0) < 999) {
        // air 무시(간단화): 지상 근처만
        if (p.air < 40) {
          this.hitPlayer(b.dmg, b.vx > 0 ? 1 : -1, 5, b.x);
          b.dead = true;
          this.particles.spark(b.x, groundY(b.z) - 24, 8, "#aef7c0", 6);
        }
      }
      if (!b.dead) {
        if (b.life % 2 === 0)
          this.particles.ember(b.x, groundY(b.z) - 22, 1, "rgba(174,247,192,0.9)");
      }
    }
    this.bolts = this.bolts.filter((b) => !b.dead);
  }

  private resolveHits() {
    const p = this.player;
    // 플레이어 → 적
    if (p.active) {
      const a = p.active;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!this.inRange(a, e)) continue;
        // 패링: 적이 공격 직전(예비 후반)~공격 중일 때 검이 닿으면 튕겨낸다
        if (e instanceof Enemy && this.tryParry(a, e)) continue;
        const wasAlive = !e.dead;
        if (e.hurt(a, p.x, this)) {
          this.onPlayerLand(a, e);
          if (wasAlive && e.dead) this.onEnemyDeath(e as Enemy);
        }
      }
    }
    // 적 → 플레이어
    for (const e of this.enemies) {
      if (!e.active || e.dead) continue;
      const a = e.active;
      if (p.invuln > 0 || p.dead) continue;
      if (!this.inRange(a, p)) continue;
      if (p.hurt(a, e.x, this)) {
        this.hitPlayerFx(a, e.x);
      }
    }
  }

  private inRange(a: ActiveAttack, f: Fighter): boolean {
    if (!beltHit(a.x, a.z, f.x, f.z, a.rx + f.radius, a.rz)) return false;
    const amin = a.airMin ?? -20;
    const amax = a.airMax ?? 60;
    return f.air >= amin && f.air <= amax;
  }

  /**
   * 패링 판정·처리. 적의 공격 타이밍(예비 55% 이후~타격 중)에 플레이어의 참격이 닿으면:
   * 적의 공격을 취소하고 뒤로 밀어내며 잠시 스턴. 데미지 대신 확실한 반격 기회를 준다.
   */
  private tryParry(a: ActiveAttack, e: Enemy): boolean {
    if (e.hitBy.has(a.hitId)) return false;
    const anim = e.attackAnim();
    if (!anim) return false;
    if (anim.phase !== "strike" && anim.prog < 0.55) return false;

    e.hitBy.add(a.hitId); // 같은 스윙으로 중복 패링 방지
    const dir = e.x >= this.player.x ? 1 : -1;
    const boss = e.kind === "boss";
    e.active = null; // 적의 이번 공격은 무효
    e.telegraph = 0;
    e.state = "hurt";
    e.t = 0;
    e.hitstun = boss ? 36 : 60; // 스턴 — 반격 콤보 넣을 시간
    e.vx = (dir * (boss ? 14 : 22)) / e.weight; // 뒤로 밀려남
    e.vz = 0;
    e.flash = 8;
    e.facing = -dir;

    // 보상: MP 소량 회복
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 8);

    const gy = groundY(e.z) - 34;
    const mx = (this.player.x + e.x) / 2;
    this.particles.spark(mx, gy, 16, "#ffe08a", 9);
    this.particles.glow(mx, gy, "rgba(255,224,138,0.6)", 40, 10);
    this.particles.text(mx, gy - 14, "PARRY!", "#ffe08a", 1.4);
    this.freeze(9);
    this.cam.shake(9);
    sfx.heavy();
    return true;
  }

  private onPlayerLand(a: ActiveAttack, e: Fighter) {
    const gy = groundY(e.z) - e.air - 26;
    const col = a.sfx === "nova" ? "#c9a8ff" : a.sfx === "heavy" ? "#ffe08a" : "#bff4ff";
    this.particles.spark(e.x, gy, a.sfx === "nova" ? 18 : 9, col, a.sfx === "heavy" ? 9 : 6);
    this.particles.glow(e.x, gy, "rgba(180,240,255,0.5)", 26, 8);
    this.particles.text(e.x, gy - 8, `${a.dmg}`, col, a.dmg >= 20 ? 1.5 : 1);
    this.freeze(a.hitstop);
    this.cam.shake(a.shake);
    this.addScore(a.dmg);
    this.addCombo();
    if (a.sfx === "heavy") sfx.heavy();
    else if (a.sfx === "launch") sfx.launch();
    else if (a.sfx === "nova") sfx.nova();
    else sfx.hit();
  }

  private hitPlayer(dmg: number, dir: number, hitstun: number, fromX: number) {
    const a: ActiveAttack = {
      x: fromX,
      z: this.player.z,
      rx: 0,
      rz: 0,
      dmg,
      kbx: 6 * dir,
      kbz: 0,
      launch: 0,
      hitstun,
      hitstop: 4,
      shake: 6,
      hitId: `bolt-${Math.random()}`,
    };
    if (this.player.hurt(a, fromX, this)) this.hitPlayerFx(a, fromX);
  }

  private hitPlayerFx(a: ActiveAttack, fromX: number) {
    const p = this.player;
    const gy = groundY(p.z) - p.air - 30;
    this.particles.spark(p.x, gy, 10, "#ff6b6b", 6);
    this.particles.text(p.x, gy - 10, `-${a.dmg}`, "#ff8a8a", 1.1);
    this.freeze(a.hitstop);
    this.cam.shake(Math.max(6, a.shake ?? 6));
    this.hitFlash = 8;
    this.combo = 0;
    this.comboTimer = 0;
    sfx.hurt();
    void fromX;
  }

  private onEnemyDeath(e: Enemy) {
    e.playDeathFx(this);
    this.addScore(Math.round(e.spec.score * e.powerMul));
    this.cam.shake(e.kind === "boss" ? 20 : 6);
    if (e.kind === "boss") {
      // 주기 보스 격퇴 — 승리 종료 대신 연출 후 다음 주기로 계속
      this.slowmo(50, 0.4);
      this.freeze(16);
      sfx.win();
    }
  }

  private cleanup() {
    // 죽은 적은 잠깐 남아 소멸 연출 후 제거 (여기선 즉시 제거, fx는 이미 생성)
    this.enemies = this.enemies.filter((e) => {
      if (e.dead) {
        // 이미 death fx 생성됨
        return false;
      }
      return true;
    });
  }
}
