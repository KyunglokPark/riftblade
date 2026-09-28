// 공용 상수 · 수학 유틸

export const VW = 960;
export const VH = 540;

// 벨트스크롤 깊이(z) 설정: z=0 앞(아래), z=ZMAX 뒤(위)
export const ZMAX = 150;
export const GROUND_FRONT = 508; // z=0 일 때 바닥 화면 y
export const GROUND_BACK = 372; // z=ZMAX 일 때 바닥 화면 y
export const STAGE_LEN = 2600; // 월드 x 길이

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
export function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}

/** z(깊이) → 바닥 화면 y */
export function groundY(z: number): number {
  return lerp(GROUND_FRONT, GROUND_BACK, clamp(z, 0, ZMAX) / ZMAX);
}
/** z(깊이) → 원근 스케일 */
export function depthScale(z: number): number {
  return lerp(1.0, 0.78, clamp(z, 0, ZMAX) / ZMAX);
}

/** 벨트스크롤 히트 판정: x 간격 + z 간격 이내 */
export function beltHit(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rangeX: number,
  rangeZ: number
): boolean {
  return Math.abs(ax - bx) <= rangeX && Math.abs(az - bz) <= rangeZ;
}
