// 파이터 베이스 (플레이어/적 공용): 위치·물리·피격·히트박스

import { Particles } from "../core/particles";
import { Camera } from "../core/camera";
import { clamp, ZMAX, STAGE_LEN } from "../core/util";

export type Team = "player" | "enemy";

export interface ActiveAttack {
  x: number;
  z: number;
  rx: number; // x 사거리
  rz: number; // z 사거리
  airMin?: number; // 피격 대상 air 최소 (기본 -inf)
  airMax?: number; // 피격 대상 air 최대 (기본 +inf)
  dmg: number;
  kbx: number; // 넉백 x (공격자 방향으로 부호 적용됨)
  kbz: number;
  launch: number; // 띄우기(vair)
  hitstun: number;
  hitstop: number;
  shake: number;
  hitId: string; // 같은 스윙 중복 타격 방지
  sfx?: "hit" | "heavy" | "launch" | "nova";
  onHit?: (t: Fighter) => void;
}

/** 아레나: 플레이어/적이 접근하는 월드 컨텍스트 */
export interface Arena {
  particles: Particles;
  cam: Camera;
  player: Fighter;
  enemies: Fighter[];
  freeze(frames: number): void;
  slowmo(frames: number, scale: number): void;
  addScore(n: number): void;
  addCombo(): void;
  spawnBolt(x: number, z: number, vx: number, dmg: number): void;
  timeMs: number;
}

let ID = 1;

export abstract class Fighter {
  id = ID++;
  team: Team;
  x: number;
  z: number;
  air = 0;
  vx = 0;
  vz = 0;
  vair = 0;
  facing = 1;
  hp: number;
  maxHp: number;
  radius = 16;
  weight = 1; // 넉백 저항 (클수록 덜 밀림)
  state = "idle";
  t = 0; // 상태 타이머(프레임)
  hitstun = 0;
  invuln = 0;
  flash = 0;
  dead = false;
  active: ActiveAttack | null = null;
  hitBy = new Set<string>();
  walkPhase = 0;

  constructor(team: Team, x: number, z: number, hp: number) {
    this.team = team;
    this.x = x;
    this.z = z;
    this.hp = hp;
    this.maxHp = hp;
  }

  get airborne() {
    return this.air > 0.5 || this.vair !== 0;
  }
  get sx() {
    return this.x;
  }
  get screenY() {
    // groundY 계산은 render에서 하므로 여기선 z만 반환용
    return this.z;
  }

  hurt(a: ActiveAttack, attackerX: number, _arena: Arena) {
    if (this.dead || this.invuln > 0) return false;
    if (this.hitBy.has(a.hitId)) return false;
    this.hitBy.add(a.hitId);

    const dir = this.x >= attackerX ? 1 : -1;
    this.hp -= a.dmg;
    this.flash = 6;
    this.hitstun = Math.max(this.hitstun, a.hitstun);
    this.invuln = 2; // 아주 짧은 무적으로 멀티프레임 중복만 방지
    const w = this.weight;
    this.vx += (a.kbx * dir) / w;
    this.vz += a.kbz * (Math.random() < 0.5 ? 1 : -1) * 0.4;
    if (a.launch > 0) {
      this.vair = a.launch / w;
      this.air = Math.max(this.air, 1);
      this.state = "air";
    }
    this.facing = -dir; // 맞으면 공격자 쪽을 향함
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    a.onHit?.(this);
    return true;
  }

  protected integrate(gravity = 0.9, friction = 0.82) {
    if (this.airborne) {
      this.vair -= gravity;
      this.air += this.vair;
      this.x += this.vx;
      if (this.air <= 0) {
        this.air = 0;
        this.vair = 0;
        this.vx *= 0.4;
        this.onLand?.();
      }
    } else {
      this.x += this.vx;
      this.z += this.vz;
      this.vx *= friction;
      this.vz *= friction;
      this.z = clamp(this.z, 0, ZMAX);
    }
    this.x = clamp(this.x, 20, STAGE_LEN - 20);
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    if (Math.abs(this.vz) < 0.05) this.vz = 0;

    if (this.hitstun > 0) this.hitstun--;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    this.t++;
  }

  onLand?(): void;
  abstract update(arena: Arena): void;
}
