import { clamp, lerp, rand, VW, STAGE_LEN } from "./util";

export class Camera {
  x = 0;
  private shakeMag = 0;
  ox = 0;
  oy = 0;

  follow(targetX: number) {
    const want = clamp(targetX - VW * 0.42, 0, STAGE_LEN - VW);
    this.x = lerp(this.x, want, 0.12);
  }

  shake(mag: number) {
    this.shakeMag = Math.min(24, Math.max(this.shakeMag, mag));
  }

  update() {
    if (this.shakeMag > 0.2) {
      this.ox = rand(-this.shakeMag, this.shakeMag);
      this.oy = rand(-this.shakeMag, this.shakeMag) * 0.6;
      this.shakeMag *= 0.86;
    } else {
      this.ox = 0;
      this.oy = 0;
      this.shakeMag = 0;
    }
  }

  /** 렌더 시 실제 사용할 카메라 x (흔들림 포함) */
  get renderX() {
    return this.x + this.ox;
  }
}
