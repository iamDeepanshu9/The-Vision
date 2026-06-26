// ── LightNode ──
// Glowing orb with antigravity physics, tether connections, and gesture responses.

let hueCounter = 190;

function nextHue() {
  const hue = hueCounter;
  hueCounter += 37; // step through the 190–320 range
  if (hueCounter > 320) hueCounter = 190 + (hueCounter - 320);
  return hue;
}

export class LightNode {
  /**
   * @param {number} x - Initial X position (canvas px)
   * @param {number} y - Initial Y position (canvas px)
   * @param {number} [radius=38] - Base radius
   * @param {number} [hue] - HSL hue (auto-assigned if omitted)
   */
  constructor(x, y, radius = 38, hue) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.displayRadius = radius;
    this.targetDisplayRadius = radius;
    this.hue = hue !== undefined ? hue : nextHue();

    // Connections to other nodes
    this.connections = []; // { node: LightNode, springLength: number }

    // Grab state
    this.grabbedBy = null; // 'left' | 'right' | 'both' | null

    // Pulse animation
    this.pulsePhase = Math.random() * Math.PI * 2;

    // Squeeze state — set by main when a hand is actively squeezing this node
    this.squeezed = false;

    // Collision flash (for blast effect visual)
    this.blastFlash = 0; // frames remaining of flash

    // Merge-ready highlight — set when two grabbed nodes are close enough to bridge
    this.mergeReady = false;
  }
}

export class NodeManager {
  constructor() {
    /** @type {LightNode[]} */
    this.nodes = [];
    // Pending blast events emitted during physics for renderer/particles
    this.blastEvents = []; // { x, y, hue }
  }

  /** Spawn initial node at canvas center. */
  spawnInitial(canvasW, canvasH) {
    this.nodes.push(new LightNode(canvasW / 2, canvasH / 2));
  }

  /** Spawn a new node at a given position. */
  spawn(x, y) {
    const node = new LightNode(x, y, 38);
    // Give it a gentle random drift
    node.vx = (Math.random() - 0.5) * 1.2;
    node.vy = (Math.random() - 0.5) * 1.2;
    this.nodes.push(node);
    return node;
  }

  /**
   * Split a node into two connected children.
   * @param {LightNode} parent
   * @param {number} axisX - Direction X for offset (axis of the two hands)
   * @param {number} axisY - Direction Y for offset
   * @returns {[LightNode, LightNode]}
   */
  split(parent, axisX, axisY) {
    const childRadius = Math.max(16, parent.radius * 0.65);
    const offset = parent.radius + 20;

    // Normalize axis
    const len = Math.sqrt(axisX * axisX + axisY * axisY) || 1;
    const nx = axisX / len;
    const ny = axisY / len;

    const childA = new LightNode(
      parent.x - nx * offset,
      parent.y - ny * offset,
      childRadius,
      parent.hue
    );
    const childB = new LightNode(
      parent.x + nx * offset,
      parent.y + ny * offset,
      childRadius
    );

    // Inherit parent velocity + small outward nudge
    childA.vx = parent.vx * 0.4 - nx * 1.5;
    childA.vy = parent.vy * 0.4 - ny * 1.5;
    childB.vx = parent.vx * 0.4 + nx * 1.5;
    childB.vy = parent.vy * 0.4 + ny * 1.5;

    // Connect children with a tether at natural rest distance
    const springLength = offset * 2;
    childA.connections.push({ node: childB, springLength });
    childB.connections.push({ node: childA, springLength });

    // Transfer parent's existing connections to childA
    for (const conn of parent.connections) {
      conn.node.connections = conn.node.connections.filter(c => c.node !== parent);
      conn.node.connections.push({ node: childA, springLength: conn.springLength });
      childA.connections.push({ node: conn.node, springLength: conn.springLength });
    }

    // Remove parent, add children
    const idx = this.nodes.indexOf(parent);
    if (idx !== -1) this.nodes.splice(idx, 1);
    this.nodes.push(childA, childB);

    return [childA, childB];
  }

  /**
   * Connect two existing nodes directly with a tether — no intermediate node.
   * @param {LightNode} nodeA
   * @param {LightNode} nodeB
   */
  bridge(nodeA, nodeB) {
    // Avoid duplicate connections
    const alreadyConnected = nodeA.connections.some(c => c.node === nodeB);
    if (alreadyConnected) {
      nodeA.mergeReady = false;
      nodeB.mergeReady = false;
      return;
    }

    // Rest length = current distance between the nodes at time of linking
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const springLen = Math.sqrt(dx * dx + dy * dy);

    // Wire them directly
    nodeA.connections.push({ node: nodeB, springLength: springLen });
    nodeB.connections.push({ node: nodeA, springLength: springLen });

    // Clear merge-ready flags
    nodeA.mergeReady = false;
    nodeB.mergeReady = false;
  }

  /** Find the nearest node to a point within maxDist. */
  findNearest(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const node of this.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }

  /** Update physics for all nodes. */
  updatePhysics(canvasW, canvasH) {
    // Increased drag so nodes slow down faster
    const drag = 0.96;
    const restitution = 0.55;
    // High cap so fast throws aren't cut short
    const MAX_SPEED = 60;

    this.blastEvents = [];

    for (const node of this.nodes) {
      // Pulse animation (idle breathing)
      node.pulsePhase += 0.025;

      // Smooth display radius toward target
      node.displayRadius += (node.targetDisplayRadius - node.displayRadius) * 0.18;

      // Tick down blast flash
      if (node.blastFlash > 0) node.blastFlash--;

      if (node.grabbedBy) {
        // Grabbed nodes: zero their velocity so they don't accumulate while held
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      // Speed cap
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_SPEED) {
        node.vx = (node.vx / speed) * MAX_SPEED;
        node.vy = (node.vy / speed) * MAX_SPEED;
      }

      // Apply spring forces for tethered connections
      for (const conn of node.connections) {
        const dx = conn.node.x - node.x;
        const dy = conn.node.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - conn.springLength;
        const force = delta * 0.004; // soft spring
        node.vx += (dx / dist) * force;
        node.vy += (dy / dist) * force;
      }

      // Apply drag and move
      node.vx *= drag;
      node.vy *= drag;
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off edges
      const r = node.displayRadius;
      if (node.x - r < 0) {
        node.x = r;
        node.vx = Math.abs(node.vx) * restitution;
      } else if (node.x + r > canvasW) {
        node.x = canvasW - r;
        node.vx = -Math.abs(node.vx) * restitution;
      }
      if (node.y - r < 0) {
        node.y = r;
        node.vy = Math.abs(node.vy) * restitution;
      } else if (node.y + r > canvasH) {
        node.y = canvasH - r;
        node.vy = -Math.abs(node.vy) * restitution;
      }
    }

    // ── Node-Node Collision with elastic impulse + blast effect ──
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = a.displayRadius + b.displayRadius;

        if (dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;

          // Separate so they don't overlap
          const overlap = (minDist - dist) * 0.5;
          if (!a.grabbedBy) { a.x -= nx * overlap; a.y -= ny * overlap; }
          if (!b.grabbedBy) { b.x += nx * overlap; b.y += ny * overlap; }

          // Elastic velocity exchange along collision normal
          const relVx = b.vx - a.vx;
          const relVy = b.vy - a.vy;
          const dot = relVx * nx + relVy * ny;

          // Only resolve if approaching
          if (dot < 0) {
            const impulse = dot * 0.85; // slightly inelastic for feel

            const impulseFactor = Math.abs(impulse);

            if (!a.grabbedBy) {
              a.vx += impulse * nx;
              a.vy += impulse * ny;
            }
            if (!b.grabbedBy) {
              b.vx -= impulse * nx;
              b.vy -= impulse * ny;
            }

            // Trigger blast flash on significant impact (speed > 3 px/frame impact)
            if (impulseFactor > 3) {
              a.blastFlash = 8;
              b.blastFlash = 8;
              // Emit a blast event at collision midpoint for particles
              this.blastEvents.push({
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
                hue: (a.hue + b.hue) / 2,
                strength: impulseFactor,
              });
            }
          }
        }
      }
    }
  }
}
