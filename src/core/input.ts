// 키보드 입력: 눌림 상태 + "이번 프레임에 새로 눌림(pressed)" 엣지 감지

export type Action =
  | "left"
  | "right"
  | "up"
  | "down"
  | "attack"
  | "jump"
  | "dash"
  | "skill1"
  | "skill2"
  | "skill3"
  | "pause"
  | "start";

const MAP: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  KeyJ: "attack",
  KeyK: "jump",
  Space: "jump",
  KeyL: "dash",
  ShiftLeft: "dash",
  KeyU: "skill1",
  KeyI: "skill2",
  KeyO: "skill3",
  KeyP: "pause",
  Enter: "start",
};

const down = new Set<Action>();
const pressedThisFrame = new Set<Action>();
const consumed = new Set<Action>();

export function initInput(): void {
  window.addEventListener("keydown", (e) => {
    const a = MAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!down.has(a)) pressedThisFrame.add(a);
    down.add(a);
  });
  window.addEventListener("keyup", (e) => {
    const a = MAP[e.code];
    if (!a) return;
    e.preventDefault();
    down.delete(a);
    consumed.delete(a);
  });
  window.addEventListener("blur", () => {
    down.clear();
  });
}

export function isDown(a: Action): boolean {
  return down.has(a);
}
/** 이번 프레임에 새로 눌렸는가 (한 번 소비되면 다음 눌림까지 false) */
export function pressed(a: Action): boolean {
  if (pressedThisFrame.has(a) && !consumed.has(a)) {
    consumed.add(a);
    return true;
  }
  return false;
}
/** 프레임 끝에서 호출 — 엣지 상태 리셋 */
export function endInputFrame(): void {
  pressedThisFrame.clear();
}
