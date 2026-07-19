/** Desktop mouse/trackpad input — not used on touch devices. */
export class PointerInput {
  x = 0.5;
  y = 0.5;
  dx = 0;
  dy = 0;
  down = false;
  moved = false;

  private lastX = 0;
  private lastY = 0;
  private active = false;
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
    if (!enabled) return;

    const onMove = (clientX: number, clientY: number) => {
      const nx = clientX / window.innerWidth;
      const ny = 1 - clientY / window.innerHeight;
      if (this.active) {
        this.dx += nx - this.lastX;
        this.dy += ny - this.lastY;
        this.moved = true;
      }
      this.lastX = nx;
      this.lastY = ny;
      this.x = nx;
      this.y = ny;
      this.active = true;
    };

    window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', (e) => {
      this.down = true;
      onMove(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener('pointerup', () => { this.down = false; });
    window.addEventListener('pointercancel', () => { this.down = false; });
  }

  consumeDelta(): { dx: number; dy: number; moved: boolean } {
    if (!this.enabled) return { dx: 0, dy: 0, moved: false };
    const out = { dx: this.dx, dy: this.dy, moved: this.moved };
    this.dx = 0;
    this.dy = 0;
    this.moved = false;
    return out;
  }
}
