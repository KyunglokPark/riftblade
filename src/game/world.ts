// 게임 월드: 엔티티 오케스트레이션 · 히트 판정 · 히트스톱 · 웨이브/보스

import { Arena, Fighter, ActiveAttack } from "./fighter";
import { Player, PlayerClass } from "./player";
import { Enemy, EnemyKind } from "./enemy";
import { Particles } from "../core/particles";
import { Camera } from "../core/camera";
import { sfx } from "../core/audio";
import { beltHit, groundY, rand, clamp, VW, STAGE_LEN } from "../core/util";
import { pressed } from "../core/input";
import { playJingle } from "../core/music";

export interface Drop {
  x: number;
  z: number;
  life: number;
  dead: boolean;
}

// 지속 피해 장판: rain=화살비(1초), fire=화염벽(약 2초)
export interface Zone {
  x: number;
  z: number;
  life: number;
  maxLife: number;
  kind: "rain" | "fire";
  dead: boolean;
}

// 스킬 이펙트 스프라이트 (일시 표시)
export interface Fx {
  sprite: string;
  x: number;
  z: number;
  h: number;
  life: number;
  maxLife: number;
  scale: number;
  rot: number;
  flip: number;
  mode: "burst" | "slash" | "static";
}

// 플레이어 투사체 (화살/매직볼트)
export interface PBolt {
  x: number;
  z: number;
  vx: number;
  vz: number;
  h: number; // 지면 위 높이 (렌더용)
  dmg: number;
  life: number;
  dead: boolean;
  pierce: number;
  explode?: { r: number; dmg: number; kbx?: number };
  color: string;
  rain: boolean; // 명중 지점에 화살비 장판 생성
  orb: boolean;
  sprite?: string; // 투사체 렌더용 스프라이트 (화염구/관통탄)
  hitIds: Set<number>;
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
  { banner: "최종 균열 · 감시자 강림", list: [{ kind: "boss", count: 1 }] },
];

export class World implements Arena {
  player: Player;
  enemies: Fighter[] = [];
  bolts: Bolt[] = [];
  pbolts: PBolt[] = [];
  zones: Zone[] = [];
  fx: Fx[] = [];
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

  // 체크포인트·포션: 죽으면 마지막 체크포인트부터, 포션은 H키로 마신다
  static readonly POTION_START = 3;
  static readonly POTION_MAX = 5;
  checkpointWave = 1; // 죽었을 때 복귀할 웨이브 (1부터 셈)
  potions = World.POTION_START;
  private potionCd = 0;

  private freezeT = 0;
  private slowT = 0;
  private slowSkip = false;
  timeMs = 0;
  hitFlash = 0; // 피격 시 화면 붉은 플래시

  constructor(cls: PlayerClass = "knight") {
    this.player = new Player(200, 70, cls);
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
  spawnPlayerBolt(
    x: number,
    z: number,
    vx: number,
    dmg: number,
    opts: { vz?: number; pierce?: number; explode?: { r: number; dmg: number; kbx?: number }; color?: string; orb?: boolean; h?: number; rain?: boolean; sprite?: string } = {}
  ) {
    this.pbolts.push({
      x,
      z,
      vx,
      vz: opts.vz ?? 0,
      h: opts.h ?? 30,
      dmg,
      life: 70,
      dead: false,
      pierce: opts.pierce ?? 1,
      explode: opts.explode,
      color: opts.color ?? "#cfffe0",
      orb: opts.orb ?? false,
      rain: opts.rain ?? false,
      sprite: opts.sprite,
      hitIds: new Set(),
    });
  }

  spawnFx(
    sprite: string,
    x: number,
    z: number,
    opts: { h?: number; scale?: number; life?: number; rot?: number; flip?: number; mode?: "burst" | "slash" | "static" } = {}
  ) {
    const life = opts.life ?? 20;
    this.fx.push({
      sprite,
      x,
      z,
      h: opts.h ?? 30,
      life,
      maxLife: life,
      scale: opts.scale ?? 1,
      rot: opts.rot ?? 0,
      flip: opts.flip ?? 1,
      mode: opts.mode ?? "burst",
    });
  }

  private updateFx() {
    for (const f of this.fx) f.life--;
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  /** 디버그/테스트: 해당 웨이브(1부터 셈)로 즉시 점프 — 판 정리 후 새로 소환, 체력·MP 회복 */
  jumpToWave(n: number) {
    this.wave = Math.max(0, Math.floor(n) - 1);
    this.enemies = [];
    this.bolts = [];
    this.pbolts = [];
    this.zones = [];
    this.fx = [];
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
    // 보스 로테이션: 10웨이브 감시자 → 20웨이브 공허 사신 → 30웨이브 잿불 거인 → 반복
    const bossKind: EnemyKind = (["boss", "boss2", "boss3"] as const)[cycle % 3];
    const BOSS_BANNER: Record<string, string> = {
      boss: "최종 균열 · 감시자 강림",
      boss2: "최종 균열 · 공허 사신 강림",
      boss3: "최종 균열 · 잿불 거인 강림",
    };
    const bannerText = widx === WAVES.length - 1 ? BOSS_BANNER[bossKind] : def.banner;
    this.banner =
      `WAVE ${this.wave + 1} — ${bannerText}` + (cycle > 0 ? ` · ${cycle + 1}주기` : "");
    this.bannerT = 150;
    let side = 1;
    const sideN = [0, 0]; // 같은 쪽 몇 번째인지 — 세로로 줄줄이 겹쳐 스폰되는 것 방지
    for (const grp of def.list) {
      for (let i = 0; i < grp.count; i++) {
        const px = this.player.x;
        const si = side > 0 ? 0 : 1;
        const off = VW * 0.55 + 30 + sideN[si] * 110 + rand(0, 70);
        sideN[si]++;
        let x = clamp(px + side * off, 60, STAGE_LEN - 60);
        side *= -1;
        const z = rand(24, 140);
        const kind: EnemyKind = grp.kind === "boss" ? bossKind : grp.kind;
        // 엘리트(기습병): 노란 테두리 — 엇박자 예비동작·기습 공격
        const elite =
          !kind.startsWith("boss") && Math.random() < Math.min(0.35, 0.04 + widx * 0.03 + cycle * 0.08);
        // 보스는 웨이브(widx) 스케일링 제외 — 기본 스펙 + 완만한 주기 성장만
        const isBossKind = kind.startsWith("boss");
        const e = new Enemy(
          kind,
          x,
          z,
          isBossKind ? 1 + 0.35 * cycle : hpMul,
          isBossKind ? 1 + 0.3 * cycle : dmgMul,
          elite
        );
        if (kind.startsWith("boss")) {
          e.x = clamp(px + (px < STAGE_LEN / 2 ? 420 : -420), 80, STAGE_LEN - 80);
          e.z = 80;
          sfx.bossRoar(kind as "boss" | "boss2" | "boss3");
        }
        this.enemies.push(e);
      }
    }
    this.wave++;
    // 체크포인트: 웨이브 1·4·7·10 (배경 전환 지점 + 보스 직전) — 완전 회복 + 포션 리필
    if (widx % 3 === 0) {
      this.checkpointWave = this.wave;
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.potions = Math.max(this.potions, World.POTION_START);
      const pgy = groundY(this.player.z) - 60;
      this.particles.text(this.player.x, pgy, "CHECKPOINT", "#8ef0c0", 1.3);
      this.particles.ring(this.player.x, pgy + 26, "rgba(142,240,192,0.8)", 14, 10, 30);
      this.particles.glow(this.player.x, pgy + 26, "rgba(142,240,192,0.5)", 50, 16);
      sfx.checkpoint();
    }
  }

  /** 현재 상황에 맞는 BGM 테마 (보스 생존 시 보스 테마 우선) */
  musicTheme(): "canyon" | "ember" | "void" | "boss" | "boss2" {
    const bossAlive = this.enemies.some((e) => !e.dead && e instanceof Enemy && e.isBoss);
    if (bossAlive) return this.wave > 10 ? "boss2" : "boss"; // 2주기부터 강화 보스 테마
    const widx = (this.wave - 1) % 10;
    return widx < 3 ? "canyon" : widx < 6 ? "ember" : "void";
  }

  /** 사망 후 마지막 체크포인트에서 부활 */
  respawn() {
    const pl = this.player;
    pl.dead = false;
    pl.deathT = 0;
    pl.hitstun = 0;
    pl.invuln = 90; // 부활 직후 잠시 무적
    pl.state = "idle";
    pl.vx = 0;
    pl.vz = 0;
    pl.air = 0;
    pl.vair = 0;
    this.result = "playing";
    this.combo = 0;
    this.hitFlash = 0;
    this.potions = World.POTION_START;
    this.jumpToWave(this.checkpointWave);
  }

  /** H키: 포션 마시기 */
  private drinkPotion() {
    if (this.potionCd > 0 || this.player.dead) return;
    if (this.potions <= 0) {
      this.particles.text(this.player.x, groundY(this.player.z) - 60, "포션 없음", "#9fb4cc", 0.9);
      this.potionCd = 20;
      return;
    }
    if (this.player.hp >= this.player.maxHp) return;
    this.potions--;
    this.potionCd = 30;
    const heal = 35;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    const gy = groundY(this.player.z) - this.player.air - 40;
    this.particles.text(this.player.x, gy, `+${heal}`, "#7dff9a", 1.3);
    this.particles.glow(this.player.x, gy + 10, "rgba(120,255,150,0.6)", 36, 12);
    this.particles.spark(this.player.x, gy + 10, 10, "#7dff9a", 6);
    sfx.potion();
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

    // 포션 (H)
    if (this.potionCd > 0) this.potionCd--;
    if (pressed("potion")) this.drinkPotion();

    // 플레이어
    this.player.update(this);
    // 적
    for (const e of this.enemies) e.update(this);
    // 투사체
    this.updateBolts();
    this.updatePlayerBolts();
    this.updateZones();
    this.updateFx();
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

  private updatePlayerBolts() {
    for (const b of this.pbolts) {
      b.x += b.vx;
      b.z += b.vz;
      b.life--;
      if (b.life <= 0 || b.x < -40 || b.x > STAGE_LEN + 40 || b.z < 0 || b.z > 180) {
        b.dead = true;
        if (b.rain) this.spawnZone(b.x, b.z, "rain"); // 빗나가도 그 자리에 쏟아진다
      }
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || !(e instanceof Enemy) || b.hitIds.has(e.id)) continue;
        if (!beltHit(b.x, b.z, e.x, e.z, 16 + e.radius, 26) || e.air > 90) continue;
        b.hitIds.add(e.id);
        // 화살비 신호탄: 처음 맞는 적 머리 위로 장판 소환
        if (b.rain) {
          this.spawnZone(e.x, e.z, "rain");
          b.dead = true;
          break;
        }
        // 수호병 정면 가드: 화살·볼트도 방패에 막힌다
        if (e.blocksFrontal(b.x - b.vx * 4)) {
          const ggy = groundY(e.z) - e.air - 30;
          this.particles.spark(e.x + e.facing * 16, ggy, 5, "#cfd6e4", 5);
          this.particles.text(e.x, ggy - 12, "GUARD", "#cfd6e4", 0.85);
          sfx.hit();
          if (!b.explode) {
            b.pierce--;
            if (b.pierce <= 0) b.dead = true;
          } else {
            this.explodeBolt(b);
          }
          if (b.dead) break;
          continue;
        }
        if (b.explode) {
          this.explodeBolt(b);
          break;
        }
        const crit = e.parryStunned && e.hitstun > 0;
        const atk: ActiveAttack = {
          x: b.x,
          z: b.z,
          rx: 0,
          rz: 0,
          dmg: crit ? Math.round(b.dmg * 1.5) : b.dmg,
          kbx: 2,
          kbz: 0,
          launch: 0,
          hitstun: 10,
          hitstop: 2,
          shake: 3,
          hitId: `pb-${this.timeMs}-${e.id}`,
        };
        const wasAlive = !e.dead;
        if (e.hurt(atk, b.x - b.vx, this)) {
          this.onPlayerLand(atk, e, crit);
          // 궁사: 명중마다 MP 회복
          if (this.player.cls === "archer") this.player.mp = Math.min(this.player.maxMp, this.player.mp + 4);
          if (wasAlive && e.dead) this.onEnemyDeath(e);
        }
        b.pierce--;
        if (b.pierce <= 0) {
          b.dead = true;
          break;
        }
      }
    }
    this.pbolts = this.pbolts.filter((b) => !b.dead);
  }

  /** 폭발형 투사체: 반경 내 모든 적에게 광역 피해 */
  private explodeBolt(b: PBolt) {
    b.dead = true;
    const ex = b.explode!;
    const gy = groundY(b.z) - b.h;
    this.spawnFx("fx_explosion", b.x, b.z, { h: b.h, scale: ex.r / 70, life: 22 });
    this.particles.ring(b.x, gy, "rgba(255,170,90,0.95)", 20, 12, ex.r * 0.35);
    this.particles.ring(b.x, gy, "rgba(255,230,160,0.7)", 10, 14, ex.r * 0.28);
    this.particles.spark(b.x, gy, 22, "#ffb060", 10);
    this.particles.ember(b.x, gy, 14, "rgba(255,150,60,0.9)");
    this.cam.shake(10);
    this.freeze(4);
    sfx.nova();
    for (const e of this.enemies) {
      if (e.dead || !(e instanceof Enemy)) continue;
      if (!beltHit(b.x, b.z, e.x, e.z, ex.r, ex.r * 0.6)) continue;
      const crit = e.parryStunned && e.hitstun > 0;
      const atk: ActiveAttack = {
        x: b.x,
        z: b.z,
        rx: 0,
        rz: 0,
        dmg: crit ? Math.round(ex.dmg * 1.5) : ex.dmg,
        kbx: ex.kbx ?? 7,
        kbz: 1,
        launch: ex.kbx && ex.kbx > 10 ? 7 : 4,
        hitstun: 18,
        hitstop: 4,
        shake: 6,
        hitId: `pbx-${this.timeMs}-${e.id}`,
        sfx: "nova",
      };
      const wasAlive = !e.dead;
      if (e.hurt(atk, b.x, this)) {
        this.onPlayerLand(atk, e, crit);
        if (this.player.cls === "archer") this.player.mp = Math.min(this.player.maxMp, this.player.mp + 4);
        if (wasAlive && e.dead) this.onEnemyDeath(e);
      }
    }
  }

  /** 지속 피해 장판 생성 (rain=화살비, fire=화염벽) */
  spawnZone(x: number, z: number, kind: "rain" | "fire") {
    const life = kind === "rain" ? 60 : 115;
    this.zones.push({
      x: clamp(x, 40, STAGE_LEN - 40),
      z: clamp(z, 10, 160),
      life,
      maxLife: life,
      kind,
      dead: false,
    });
    if (kind === "rain") sfx.launch();
    else sfx.fireWall();
  }

  private updateZones() {
    for (const r of this.zones) {
      r.life--;
      if (r.life <= 0) {
        r.dead = true;
        continue;
      }
      const fire = r.kind === "fire";
      const rx = fire ? 46 : 78;
      const rz = fire ? 70 : 48;
      // 6틱마다 장판 내 적에게 피해
      if (r.life % 6 === 0) {
        for (const e of this.enemies) {
          if (e.dead || !(e instanceof Enemy)) continue;
          if (!beltHit(r.x, r.z, e.x, e.z, rx, rz) || e.air > 80) continue;
          const crit = e.parryStunned && e.hitstun > 0;
          const base = fire ? 7 : 5;
          const atk: ActiveAttack = {
            x: r.x,
            z: r.z,
            rx: 0,
            rz: 0,
            dmg: crit ? Math.round(base * 1.5) : base,
            kbx: 0.5,
            kbz: 0,
            launch: 0,
            hitstun: 8,
            hitstop: 0,
            shake: 1,
            hitId: `zone-${r.kind}-${r.life}-${e.id}`,
          };
          const wasAlive = !e.dead;
          if (e.hurt(atk, e.x - e.facing, this)) {
            this.onPlayerLand(atk, e, crit);
            if (r.kind === "rain" && this.player.cls === "archer")
              this.player.mp = Math.min(this.player.maxMp, this.player.mp + 2);
            if (wasAlive && e.dead) this.onEnemyDeath(e);
          }
        }
      }
      // 장판 분위기 이펙트
      if (r.life % 4 === 0) {
        if (fire) this.particles.ember(r.x + rand(-34, 34), groundY(r.z + rand(-40, 40)) - 8, 1, "rgba(255,150,60,0.85)");
        else this.particles.dust(r.x + rand(-60, 60), groundY(r.z + rand(-30, 30)), 1);
      }
    }
    this.zones = this.zones.filter((r) => !r.dead);
  }

  private updateDrops() {
    const p = this.player;
    for (const d of this.drops) {
      d.life--;
      if (d.life <= 0) {
        d.dead = true;
        continue;
      }
      // 획득: 인벤토리에 적재 (H키로 마심). 가방이 가득이면 남겨둔다
      if (!p.dead && this.potions < World.POTION_MAX && p.air < 30 && beltHit(d.x, d.z, p.x, p.z, 28, 26)) {
        d.dead = true;
        this.potions++;
        const gy = groundY(d.z) - 30;
        this.particles.text(d.x, gy, "+1 포션", "#7dff9a", 1.1);
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
        // 패링 스턴 중 타격은 크리티컬: 1.5배 데미지
        const crit = e instanceof Enemy && e.parryStunned && e.hitstun > 0;
        const atk = crit ? { ...a, dmg: Math.round(a.dmg * 1.5) } : a;
        if (e.hurt(atk, p.x, this)) {
          this.onPlayerLand(atk, e, crit);
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
    if (e.kind === "caster" || e.kind === "shaman") return false; // 마법은 칼로 튕겨낼 수 없다
    if (e.hitBy.has(a.hitId)) return false;
    const anim = e.attackAnim();
    if (!anim) return false;
    if (anim.phase !== "strike" && anim.prog < 0.55) return false;

    e.hitBy.add(a.hitId); // 같은 스윙으로 중복 패링 방지
    const dir = e.x >= this.player.x ? 1 : -1;
    const boss = e.isBoss;
    e.active = null; // 적의 이번 공격은 무효
    e.telegraph = 0;
    e.state = "hurt";
    e.t = 0;
    e.hitstun = boss ? 54 : 100; // 긴 스턴 — 반격 콤보를 확실히 넣을 시간
    e.parryStunned = true; // 스턴 동안의 타격은 크리티컬
    e.vx = (dir * (boss ? 5 : 8)) / e.weight; // 살짝만 밀려나 콤보 사거리 안에 남는다
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
    sfx.parry();
    return true;
  }

  private onPlayerLand(a: ActiveAttack, e: Fighter, crit = false) {
    const gy = groundY(e.z) - e.air - 26;
    const col = crit ? "#ffd54a" : a.sfx === "nova" ? "#c9a8ff" : a.sfx === "heavy" ? "#ffe08a" : "#bff4ff";
    this.particles.spark(e.x, gy, crit ? 16 : a.sfx === "nova" ? 18 : 9, col, crit ? 8 : a.sfx === "heavy" ? 9 : 6);
    this.particles.glow(e.x, gy, crit ? "rgba(255,213,74,0.55)" : "rgba(180,240,255,0.5)", 26, 8);
    this.particles.text(e.x, gy - 8, `${a.dmg}`, col, crit ? 1.5 : a.dmg >= 20 ? 1.5 : 1);
    if (crit) this.particles.text(e.x, gy - 30, "CRITICAL", "#ffd54a", 1.15);
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
      // 주변 적에게도 폭발 피해 — 자폭충을 적진에서 터뜨리는 재미 (연쇄 폭발 가능)
      for (const other of this.enemies) {
        if (other === e || other.dead || !(other instanceof Enemy)) continue;
        if (!beltHit(e.x, e.z, other.x, other.z, 80, 50)) continue;
        const wasAlive = !other.dead;
        const atk: ActiveAttack = {
          x: e.x,
          z: e.z,
          rx: 0,
          rz: 0,
          dmg: Math.round(e.spec.dmg * e.dmgMul * 0.8),
          kbx: 8,
          kbz: 1,
          launch: 4,
          hitstun: 18,
          hitstop: 2,
          shake: 4,
          hitId: `bombd-${e.id}-${other.id}`,
        };
        if (other.hurt(atk, e.x, this) && wasAlive && other.dead) {
          this.onEnemyDeath(other);
        }
      }
    }
    // 체력 포션 드랍 (보스 확정, 돌격병 30%, 그 외 18%)
    const dropRate = e.isBoss ? 1 : e.kind === "charger" ? 0.3 : 0.18;
    if (Math.random() < dropRate) {
      this.drops.push({ x: e.x, z: e.z, life: 720, dead: false });
    }
    this.cam.shake(e.isBoss ? 20 : 6);
    if (e.isBoss) {
      // 주기 보스 격퇴 — 승리 종료 대신 연출 후 다음 주기로 계속
      this.slowmo(50, 0.4);
      this.freeze(16);
      playJingle("victory"); // 팡파레 (파일 없으면 칩튠 승리음)
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
