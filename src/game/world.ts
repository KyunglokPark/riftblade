// 게임 월드: 엔티티 오케스트레이션 · 히트 판정 · 히트스톱 · 웨이브/보스

import { Arena, Fighter, ActiveAttack } from "./fighter";
import { Player } from "./player";
import { Enemy, EnemyKind } from "./enemy";
import { Particles } from "../core/particles";
import { Camera } from "../core/camera";
import { sfx } from "../core/audio";
import { beltHit, groundY, rand, clamp, VW, STAGE_LEN } from "../core/util";

export interface Drop {
  x: number;
  z: number;
  life: number;
  dead: boolean;
}

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
  { banner: "제 2 균열 · 돌격 선봉", list: [{ kind: "grunt", count: 2 }, { kind: "charger", count: 1 }, { kind: "wolf", count: 1 }] },
  { banner: "제 3 균열 · 저주술사", list: [{ kind: "grunt", count: 2 }, { kind: "caster", count: 2 }] },
  { banner: "제 4 균열 · 대공세", list: [{ kind: "charger", count: 1 }, { kind: "grunt", count: 2 }, { kind: "caster", count: 1 }, { kind: "bomber", count: 2 }] },
  { banner: "제 5 균열 · 균열 폭주", list: [{ kind: "grunt", count: 3 }, { kind: "charger", count: 1 }, { kind: "wolf", count: 2 }] },
  { banner: "제 6 균열 · 술사 결사대", list: [{ kind: "caster", count: 2 }, { kind: "shaman", count: 1 }, { kind: "grunt", count: 2 }, { kind: "bomber", count: 1 }] },
  { banner: "제 7 균열 · 철갑 돌격대", list: [{ kind: "charger", count: 2 }, { kind: "guard", count: 1 }, { kind: "lancer", count: 1 }] },
  { banner: "제 8 균열 · 그림자 군단", list: [{ kind: "grunt", count: 3 }, { kind: "wolf", count: 2 }, { kind: "caster", count: 1 }, { kind: "lancer", count: 1 }, { kind: "bomber", count: 1 }] },
  { banner: "제 9 균열 · 균열의 정예", list: [{ kind: "guard", count: 1 }, { kind: "charger", count: 1 }, { kind: "caster", count: 1 }, { kind: "wolf", count: 1 }, { kind: "lancer", count: 2 }, { kind: "shaman", count: 1 }] },
  { banner: "최종 균열 · 감시자 강림", list: [{ kind: "boss", count: 1 }, { kind: "guard", count: 1 }, { kind: "grunt", count: 1 }] },
];

export class World implements Arena {
  player: Player;
  enemies: Fighter[] = [];
  bolts: Bolt[] = [];
  drops: Drop[] = []; // 체력 포션
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

  /** 디버그/테스트: 해당 웨이브(1부터 셈)로 즉시 점프 — 판 정리 후 새로 소환, 체력·MP 회복 */
  jumpToWave(n: number) {
    this.wave = Math.max(0, Math.floor(n) - 1);
    this.enemies = [];
    this.bolts = [];
    this.drops = [];
    this.betweenT = 0;
    this.player.hp = this.player.maxHp;
    this.player.mp = this.player.maxMp;
    this.nextWave();
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
        // 엘리트(기습병): 노란 테두리 — 엇박자 예비동작·기습 공격
        const elite =
          grp.kind !== "boss" && Math.random() < Math.min(0.35, 0.04 + widx * 0.03 + cycle * 0.08);
        const e = new Enemy(grp.kind, x, z, hpMul, dmgMul, elite);
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
      // 사망 여운: 시체 쓰러지는 모션 진행 + 잔불
      if (this.player.dead) {
        this.player.deathT++;
        if (this.player.deathT < 70 && this.player.deathT % 5 === 0) {
          this.particles.ember(this.player.x, groundY(this.player.z) - 14, 2, "rgba(255,110,110,0.8)");
        }
      }
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
    // 포션
    this.updateDrops();

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
      // 사망 연출: 화면 번쩍 + 충격파 + 불꽃, 시간이 늘어지듯
      const px = this.player.x;
      const pgy = groundY(this.player.z) - this.player.air - 24;
      this.hitFlash = 26;
      this.particles.ring(px, pgy, "rgba(255,80,80,0.95)", 24, 12, 30);
      this.particles.ring(px, pgy, "rgba(255,255,255,0.9)", 12, 16, 24);
      this.particles.spark(px, pgy, 30, "#ff8a8a", 11);
      this.particles.ember(px, pgy, 20, "rgba(255,120,120,0.9)");
      this.particles.glow(px, pgy, "rgba(255,60,60,0.6)", 70, 24);
      this.cam.shake(18);
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

  private updateDrops() {
    const p = this.player;
    for (const d of this.drops) {
      d.life--;
      if (d.life <= 0) {
        d.dead = true;
        continue;
      }
      // 획득: 가까이 지나가면 흡수 (체력이 가득이면 남겨둔다)
      if (!p.dead && p.hp < p.maxHp && p.air < 30 && beltHit(d.x, d.z, p.x, p.z, 28, 26)) {
        d.dead = true;
        const heal = 30;
        p.hp = Math.min(p.maxHp, p.hp + heal);
        const gy = groundY(d.z) - 30;
        this.particles.text(d.x, gy, `+${heal}`, "#7dff9a", 1.2);
        this.particles.glow(d.x, gy, "rgba(120,255,150,0.6)", 30, 10);
        this.particles.spark(d.x, gy, 8, "#7dff9a", 6);
        sfx.launch();
      }
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  private resolveHits() {
    const p = this.player;
    // 플레이어 → 적
    if (p.active) {
      const a = p.active;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!this.inRange(a, e)) continue;
        // 패링: 적이 공격 직전(예비 후반)~공격 중일 때 검이 닿으면 튕겨낸다 — 일반 공격만. 스킬은 그대로 꽂힌다
        if (e instanceof Enemy && !a.skill && this.tryParry(a, e)) continue;
        // 수호병: 정면 가드 — 일반 공격은 무효, 스킬은 60% 관통. 패링하거나 등 뒤를 노려라
        if (e instanceof Enemy && e.blocksFrontal(p.x) && !e.hitBy.has(a.hitId)) {
          if (!a.skill) {
            e.hitBy.add(a.hitId);
            const ggy = groundY(e.z) - e.air - 30;
            this.particles.spark(e.x + e.facing * 16, ggy, 6, "#cfd6e4", 5);
            this.particles.text(e.x, ggy - 12, "GUARD", "#cfd6e4", 0.9);
            this.freeze(3);
            this.cam.shake(2);
            sfx.hit();
            continue;
          }
          const pierced = { ...a, dmg: Math.max(1, Math.round(a.dmg * 0.6)) };
          const wasAlive = !e.dead;
          if (e.hurt(pierced, p.x, this)) {
            this.particles.text(e.x, groundY(e.z) - e.air - 46, "PIERCE", "#ffd76a", 0.9);
            this.onPlayerLand(pierced, e);
            if (wasAlive && e.dead) this.onEnemyDeath(e);
          }
          continue;
        }
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

    // 보상: MP 대폭 회복 — 패링이 주 MP 수급원
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 22);

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
    if (e.kind === "bomber") {
      // 자폭충은 죽어도 터진다! (직접 터뜨린 것보단 약하게)
      const bgy = groundY(e.z) - e.air;
      this.particles.ring(e.x, bgy - 16, "rgba(255,150,60,0.95)", 20, 10, 26);
      this.particles.spark(e.x, bgy - 18, 20, "#ffb060", 9);
      this.particles.ember(e.x, bgy - 14, 12, "rgba(255,150,60,0.9)");
      this.cam.shake(10);
      sfx.nova();
      if (!this.player.dead && this.player.invuln <= 0 && this.player.air < 60 && beltHit(e.x, e.z, this.player.x, this.player.z, 80, 50)) {
        this.hitPlayer(Math.round(e.spec.dmg * e.dmgMul * 0.6), this.player.x >= e.x ? 1 : -1, 16, e.x);
      }
    }
    // 체력 포션 드랍 (보스 확정, 돌격병 30%, 그 외 18%)
    const dropRate = e.kind === "boss" ? 1 : e.kind === "charger" ? 0.3 : 0.18;
    if (Math.random() < dropRate) {
      this.drops.push({ x: e.x, z: e.z, life: 720, dead: false });
    }
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
