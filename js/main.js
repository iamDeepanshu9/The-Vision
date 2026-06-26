// ── Main ──
// Bootstrap MediaPipe, orchestrate gestures, run the game loop.

import { HandTracker } from './hands.js';
import { NodeManager } from './nodes.js';
import { ParticleSystem } from './particles.js';
import { render } from './renderer.js';

// ── DOM ──
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const videoEl = document.querySelector('.input-video');

// ── State ──
const tracker = new HandTracker();
const nodeManager = new NodeManager();
const particles = new ParticleSystem();

// Grab state — which node each hand is holding
let grabbedNodeRight = null;
let grabbedNodeLeft = null;

// Cooldowns (in frames)
let splitCooldown = 0;
let spawnCooldown = 0;

// Track how long both hands have been pinching on the same node (for split intent)
let bothGrabFrames = 0;

// Track how long both hands hold DIFFERENT nodes close together (for bridge intent)
let bridgeFrames = 0;
let bridgeCooldown = 0;

// Triple-synced-pinch spawn tracking
// Both hands must pinch (simultaneously, within 5 frames) THREE times in empty air
const SYNC_PINCH_WINDOW = 50;   // frames to complete all 3 synced pinches
const syncPinch = {
  count: 0,           // how many synced pinches so far this attempt
  lastSyncAt: -999,   // frame of last synced pinch
  rightReady: false,  // right hand has pinched, waiting for left
  leftReady: false,   // left hand has pinched, waiting for right
  rightAt: -999,      // frame right pinched
  leftAt: -999,       // frame left pinched
};
const SYNC_PAIR_WINDOW = 6;     // max frames between R and L pinch to count as synced
let frameCount = 0;


// ── Resize ──
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  tracker.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ── Init ──
async function init() {
  nodeManager.spawnInitial(canvas.width, canvas.height);
  await tracker.init(videoEl, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}

// ── Gesture Processing ──
function processGestures() {

  const rHand = tracker.right;
  const lHand = tracker.left;

  // Decrement cooldowns
  if (splitCooldown > 0) splitCooldown--;
  if (spawnCooldown > 0) spawnCooldown--;
  if (bridgeCooldown > 0) bridgeCooldown--;
  frameCount++;

  // ─── RIGHT HAND: Grab / Throw ───
  if (tracker.justPinched('right') && rHand.active) {
    // Only grab if not already in a split-grab scenario
    if (!grabbedNodeRight) {
      const nearest = nodeManager.findNearest(rHand.pos.x, rHand.pos.y, 120);
      if (nearest && nearest.grabbedBy !== 'left') {
        // Allow grabbing a free node
        grabbedNodeRight = nearest;
        nearest.grabbedBy = 'right';
      }
    }
  }

  // Move grabbed node with right hand (smooth follow)
  if (grabbedNodeRight && rHand.isPinching && rHand.active) {
    // Use lerp with a moderate factor — not too snappy
    const lerpFactor = 0.25;
    grabbedNodeRight.x += (rHand.pos.x - grabbedNodeRight.x) * lerpFactor;
    grabbedNodeRight.y += (rHand.pos.y - grabbedNodeRight.y) * lerpFactor;
  }

  // Release / throw on right hand pinch open
  if (tracker.justReleased('right') && grabbedNodeRight) {
    const node = grabbedNodeRight;
    // Only assign velocity if the node is not still grabbed by left hand
    if (node.grabbedBy !== 'left') {
      node.vx = rHand.velocity.x;
      node.vy = rHand.velocity.y;
      node.grabbedBy = null;
    }
    grabbedNodeRight = null;
  }

  // ─── LEFT HAND: Grab / Throw ───
  if (tracker.justPinched('left') && lHand.active) {
    if (!grabbedNodeLeft) {
      const nearest = nodeManager.findNearest(lHand.pos.x, lHand.pos.y, 120);
      if (nearest && nearest.grabbedBy !== 'right') {
        grabbedNodeLeft = nearest;
        nearest.grabbedBy = 'left';
      }
    }
  }

  if (grabbedNodeLeft && lHand.isPinching && lHand.active) {
    const lerpFactor = 0.25;
    grabbedNodeLeft.x += (lHand.pos.x - grabbedNodeLeft.x) * lerpFactor;
    grabbedNodeLeft.y += (lHand.pos.y - grabbedNodeLeft.y) * lerpFactor;
  }

  if (tracker.justReleased('left') && grabbedNodeLeft) {
    const node = grabbedNodeLeft;
    if (node.grabbedBy !== 'right') {
      node.vx = lHand.velocity.x;
      node.vy = lHand.velocity.y;
      node.grabbedBy = null;
    }
    grabbedNodeLeft = null;
  }

  // ─── TWO-HAND SPLIT ───
  // Triggered when both hands grab the SAME node and pull apart > 120px
  // The second hand grabs by just pinching near the already-grabbed node
  if (
    rHand.active && lHand.active &&
    rHand.isPinching && lHand.isPinching &&
    splitCooldown <= 0
  ) {
    // Case 1: right has it, left just pinched near it → attach left too
    if (grabbedNodeRight && !grabbedNodeLeft) {
      const dx = lHand.pos.x - grabbedNodeRight.x;
      const dy = lHand.pos.y - grabbedNodeRight.y;
      if (Math.sqrt(dx * dx + dy * dy) < 140) {
        grabbedNodeLeft = grabbedNodeRight;
        // Node is now under both hands — don't change grabbedBy to avoid conflict
      }
    }

    // Case 2: left has it, right just pinched near it → attach right too
    if (grabbedNodeLeft && !grabbedNodeRight) {
      const dx = rHand.pos.x - grabbedNodeLeft.x;
      const dy = rHand.pos.y - grabbedNodeLeft.y;
      if (Math.sqrt(dx * dx + dy * dy) < 140) {
        grabbedNodeRight = grabbedNodeLeft;
      }
    }

    // Check if both hands are now on the same node
    if (
      grabbedNodeRight &&
      grabbedNodeLeft &&
      grabbedNodeRight === grabbedNodeLeft
    ) {
      bothGrabFrames++;

      const dx = rHand.pos.x - lHand.pos.x;
      const dy = rHand.pos.y - lHand.pos.y;
      const handDist = Math.sqrt(dx * dx + dy * dy);

      // Split after holding with both hands and pulling apart
      if (handDist > 120 && bothGrabFrames > 5) {
        const node = grabbedNodeRight;
        nodeManager.split(node, dx, dy);
        grabbedNodeRight = null;
        grabbedNodeLeft = null;
        bothGrabFrames = 0;
        splitCooldown = 45;
      }
    } else {
      bothGrabFrames = 0;
    }
  } else {
    bothGrabFrames = 0;
  }

  // ─── TWO-HAND BRIDGE (ATTACH) ───
  // When each hand holds a DIFFERENT node and brings them close → bridge node spawns
  if (
    rHand.active && lHand.active &&
    rHand.isPinching && lHand.isPinching &&
    grabbedNodeRight && grabbedNodeLeft &&
    grabbedNodeRight !== grabbedNodeLeft &&
    bridgeCooldown <= 0 && splitCooldown <= 0
  ) {
    const dx = grabbedNodeRight.x - grabbedNodeLeft.x;
    const dy = grabbedNodeRight.y - grabbedNodeLeft.y;
    const nodeDist = Math.sqrt(dx * dx + dy * dy);

    // Merge threshold: the two nodes' edges are within ~60px of touching
    const mergeThreshold = grabbedNodeRight.displayRadius + grabbedNodeLeft.displayRadius + 60;

    if (nodeDist < mergeThreshold) {
      // Signal visual preview
      grabbedNodeRight.mergeReady = true;
      grabbedNodeLeft.mergeReady = true;
      bridgeFrames++;

      // Trigger bridge after holding close for a moment
      if (bridgeFrames > 8) {
        nodeManager.bridge(grabbedNodeLeft, grabbedNodeRight);

        // Release both hands
        grabbedNodeRight.grabbedBy = null;
        grabbedNodeLeft.grabbedBy = null;
        grabbedNodeRight = null;
        grabbedNodeLeft = null;
        bridgeFrames = 0;
        bridgeCooldown = 45;
        splitCooldown = 45; // prevent immediate re-split
      }
    } else {
      // Nodes drifted apart again
      if (grabbedNodeRight) grabbedNodeRight.mergeReady = false;
      if (grabbedNodeLeft) grabbedNodeLeft.mergeReady = false;
      bridgeFrames = 0;
    }
  } else {
    // Not in bridge mode — clear any leftover flags
    if (grabbedNodeRight && grabbedNodeRight !== grabbedNodeLeft) grabbedNodeRight.mergeReady = false;
    if (grabbedNodeLeft && grabbedNodeRight !== grabbedNodeLeft) grabbedNodeLeft.mergeReady = false;
    if (!grabbedNodeRight && !grabbedNodeLeft) bridgeFrames = 0;
  }

  // ─── SQUEEZE TO SHRINK ───
  // When pinching in empty space (no node grabbed) and a node is within 180px
  for (const side of ['left', 'right']) {
    const hand = tracker[side];
    if (!hand.active || !hand.isPinching) continue;

    const grabbed = side === 'right' ? grabbedNodeRight : grabbedNodeLeft;
    if (grabbed) continue; // skip — hand is already dragging a node

    // Find nearest unheld node
    const nearNode = nodeManager.findNearest(hand.pos.x, hand.pos.y, 180);
    if (nearNode && !nearNode.grabbedBy) {
      // Map pinch tightness: 0 (fully closed) → min size; 0.06 (threshold) → full size
      // pinchDist ranges 0..0.06 for squeezing; above threshold means "open"
      const tightness = Math.max(0, Math.min(1, hand.pinchDist / 0.06));
      // At tightness=0 (fully pinched) → 30% of radius; at 1 (just at threshold) → 100%
      nearNode.targetDisplayRadius = nearNode.radius * (0.3 + 0.7 * tightness);
      nearNode.squeezed = true;
    }
  }

  // Restore squeezed nodes when hand opens or moves away
  for (const node of nodeManager.nodes) {
    if (!node.squeezed) continue;

    let stillBeingSqueezed = false;
    for (const side of ['left', 'right']) {
      const hand = tracker[side];
      const grabbed = side === 'right' ? grabbedNodeRight : grabbedNodeLeft;
      // Squeezing only happens when pinching in empty space
      if (!hand.active || !hand.isPinching || grabbed) continue;

      const dx = hand.pos.x - node.x;
      const dy = hand.pos.y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) < 180) {
        stillBeingSqueezed = true;
        break;
      }
    }

    if (!stillBeingSqueezed) {
      // Restore to full radius
      node.targetDisplayRadius = node.radius;
      node.squeezed = false;
    }
  }


  // ─── TRIPLE SYNC-PINCH SPAWN ───
  // Both hands must pinch together (within 6 frames of each other) THREE times
  // while pointing at empty space — then a new dot spawns at the midpoint.
  if (spawnCooldown <= 0) {
    const bothEmpty =
      !grabbedNodeRight && !grabbedNodeLeft &&
      rHand.active && lHand.active &&
      !nodeManager.findNearest(rHand.pos.x, rHand.pos.y, 130) &&
      !nodeManager.findNearest(lHand.pos.x, lHand.pos.y, 130);

    if (bothEmpty) {
      // Record individual pinch events
      if (tracker.justPinched('right')) { syncPinch.rightReady = true; syncPinch.rightAt = frameCount; }
      if (tracker.justPinched('left'))  { syncPinch.leftReady  = true; syncPinch.leftAt  = frameCount; }

      // Check if both pinched within the pair window
      if (
        syncPinch.rightReady && syncPinch.leftReady &&
        Math.abs(syncPinch.rightAt - syncPinch.leftAt) <= SYNC_PAIR_WINDOW
      ) {
        // Count this as one synced pinch
        syncPinch.count++;
        syncPinch.lastSyncAt = frameCount;
        syncPinch.rightReady = false;
        syncPinch.leftReady  = false;

        if (syncPinch.count >= 3) {
          // Fire! Spawn at midpoint between both fingertips
          const midX = (rHand.pos.x + lHand.pos.x) / 2;
          const midY = (rHand.pos.y + lHand.pos.y) / 2;
          nodeManager.spawn(midX, midY);
          spawnCooldown = 50;
          syncPinch.count = 0;
        }
      }

      // Reset count if the window between synced pinches expired
      if (syncPinch.count > 0 && frameCount - syncPinch.lastSyncAt > SYNC_PINCH_WINDOW) {
        syncPinch.count = 0;
      }
    } else {
      // Hands are busy (grabbing/not empty) — reset the sequence
      syncPinch.count = 0;
      syncPinch.rightReady = false;
      syncPinch.leftReady  = false;
    }
  }
}

// ── Game Loop ──
function loop() {
  processGestures();

  // Update node physics
  nodeManager.updatePhysics(canvas.width, canvas.height);

  // Emit blast particles at collision points
  for (const blast of nodeManager.blastEvents) {
    const count = Math.min(20, Math.floor(blast.strength * 2));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * blast.strength * 0.5;
      particles.emitAt(
        blast.x, blast.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        blast.hue,
        3 + Math.random() * 4
      );
    }
  }

  // Emit trail particles for fast-moving nodes
  for (const node of nodeManager.nodes) {
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > 2.5) {
      particles.emit(node.x, node.y, speed, node.hue, node.displayRadius);
    }
  }

  // Update particles
  particles.update();

  // Render
  render(ctx, canvas, nodeManager.nodes, particles, tracker);

  requestAnimationFrame(loop);
}

// ── Start ──
init().catch((err) => {
  console.error('Failed to initialize hand tracking:', err);
  // Still run the game loop so nodes are visible even without camera
  nodeManager.spawnInitial(canvas.width, canvas.height);
  requestAnimationFrame(loop);
});
