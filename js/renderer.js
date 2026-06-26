// ── Renderer ──
// All canvas drawing: nodes, tethers, particles, hand cursors, blast flashes.

/**
 * Render a single frame.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {import('./nodes.js').LightNode[]} nodes
 * @param {import('./particles.js').ParticleSystem} particleSystem
 * @param {import('./hands.js').HandTracker} hands
 */
export function render(ctx, canvas, nodes, particleSystem, hands) {
  const w = canvas.width;
  const h = canvas.height;
  const now = performance.now();

  // ── Clear to pure black ──
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Switch to additive blending for all glow effects
  ctx.globalCompositeOperation = 'lighter';

  // ── Tethers (behind nodes) ──
  drawTethers(ctx, nodes, now);

  // ── Merge preview beam (between two nodes about to bridge) ──
  drawMergePreview(ctx, nodes, now);

  // ── Particles ──
  drawParticles(ctx, particleSystem.particles);

  // ── Nodes ──
  drawNodes(ctx, nodes, now);

  // ── Hand cursors ──
  drawCursors(ctx, hands);

  // Reset compositing
  ctx.globalCompositeOperation = 'source-over';
}

// ── Tether drawing ──
function drawTethers(ctx, nodes, now) {
  const drawn = new Set();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    for (const conn of node.connections) {
      const j = nodes.indexOf(conn.node);
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const other = conn.node;
      const avgHue = (node.hue + other.hue) / 2;
      const dashOffset = (now * 0.04) % 20;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      ctx.lineTo(other.x, other.y);
      ctx.strokeStyle = `hsla(${avgHue}, 100%, 65%, 0.55)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -dashOffset;
      ctx.shadowColor = `hsla(${avgHue}, 100%, 60%, 0.9)`;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Merge-ready preview beam ──
// Draws a glowing line + midpoint dot between two nodes about to be bridged.
function drawMergePreview(ctx, nodes, now) {
  const readyNodes = nodes.filter(n => n.mergeReady);
  if (readyNodes.length < 2) return;

  const a = readyNodes[0];
  const b = readyNodes[1];

  const pulse = 0.4 + 0.35 * Math.sin(now * 0.008);
  const avgHue = (a.hue + b.hue) / 2;

  // Bright connecting beam
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = `hsla(${avgHue}, 100%, 80%, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.shadowColor = `hsla(${avgHue}, 100%, 70%, 0.9)`;
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();

  // Glowing dot at midpoint hinting where the bridge node will spawn
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dotR = 6 + 3 * Math.sin(now * 0.012);
  const midGrad = ctx.createRadialGradient(mx, my, 0, mx, my, dotR * 2.5);
  midGrad.addColorStop(0, `hsla(${avgHue}, 100%, 95%, ${Math.min(1, pulse * 1.4)})`);
  midGrad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(mx, my, dotR * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = midGrad;
  ctx.fill();
}

// ── Particle drawing ──
function drawParticles(ctx, particles) {
  for (const p of particles) {
    const alpha = p.life * 0.75;
    if (alpha <= 0.01) continue;

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    grad.addColorStop(0, `hsla(${p.hue}, 100%, 88%, ${alpha})`);
    grad.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// ── Node drawing ──
function drawNodes(ctx, nodes, now) {
  for (const node of nodes) {
    const pulse = 1 + 0.045 * Math.sin(node.pulsePhase);
    const r = node.displayRadius * pulse;
    const { x, y, hue } = node;

    // Blast flash: briefly brighten the entire orb white on collision
    const flashAlpha = node.blastFlash > 0 ? (node.blastFlash / 8) * 0.5 : 0;

    // Merge-ready: extra bright pulsing ring
    if (node.mergeReady) {
      const ringPulse = 0.5 + 0.4 * Math.sin((now || 0) * 0.01);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue}, 100%, 90%, ${ringPulse})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `hsla(${hue}, 100%, 80%, 0.9)`;
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.restore();
    }

    // Outer soft halo (larger for bridge nodes to emphasize their connector role)
    const outerScale = node.radius < 20 ? 2.8 : 2.2;
    const outerGrad = ctx.createRadialGradient(x, y, 0, x, y, r * outerScale);
    outerGrad.addColorStop(0, `hsla(${hue}, 100%, 65%, ${0.12 + flashAlpha * 0.3})`);
    outerGrad.addColorStop(0.5, `hsla(${hue}, 100%, 50%, ${0.05 + flashAlpha * 0.1})`);
    outerGrad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(x, y, r * outerScale, 0, Math.PI * 2);
    ctx.fillStyle = outerGrad;
    ctx.fill();

    // Main orb gradient
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.95 + flashAlpha})`);
    grad.addColorStop(0.2, `hsla(${hue}, 100%, 70%, ${0.85 + flashAlpha})`);
    grad.addColorStop(0.55, `hsla(${hue}, 100%, 50%, ${0.35 + flashAlpha * 0.3})`);
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// ── Hand cursor drawing ──
function drawCursors(ctx, hands) {
  for (const side of ['left', 'right']) {
    const hand = hands[side];
    if (!hand.active) continue;

    const { x, y } = hand.pos;

    if (hand.isPinching) {
      // Pinching → bright compact dot
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 7);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.4, 'rgba(180, 210, 255, 0.6)');
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      // Open hand → glowing ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(190, 215, 255, 0.30)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(170, 200, 255, 0.55)';
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.restore();
    }
  }
}
