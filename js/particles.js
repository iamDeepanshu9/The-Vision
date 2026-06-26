// ── Particle System ──
// Lightweight pool of trailing glow particles and collision blast bursts.

const MAX_PARTICLES = 400;

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Emit trail particles from a moving node.
   * @param {number} x - Node center X
   * @param {number} y - Node center Y
   * @param {number} speed - Node speed (px/frame)
   * @param {number} hue - Node HSL hue
   * @param {number} radius - Node display radius
   */
  emit(x, y, speed, hue, radius) {
    if (this.particles.length >= MAX_PARTICLES) return;

    const count = Math.min(3, Math.floor(speed / 4));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * radius * 0.35;
      this._add(
        x + Math.cos(angle) * spread,
        y + Math.sin(angle) * spread,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2,
        hue,
        2 + Math.random() * 2.5
      );
    }
  }

  /**
   * Emit a single particle at exact position with explicit velocity.
   * Used for collision blast bursts.
   */
  emitAt(x, y, vx, vy, hue, size) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this._add(x, y, vx, vy, hue, size);
  }

  _add(x, y, vx, vy, hue, size) {
    this.particles.push({
      x, y, vx, vy,
      life: 1.0,
      decay: 0.018 + Math.random() * 0.022,
      hue,
      size,
    });
  }

  /** Update all particles — move, fade, remove dead ones. */
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= p.decay;
      p.size *= 0.987;

      if (p.life <= 0 || p.size < 0.3) {
        this.particles.splice(i, 1);
      }
    }
  }
}
