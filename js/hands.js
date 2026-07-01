// ── Hand Tracking ──
// Wraps MediaPipe Hands into a clean state object for the game loop.

const PINCH_THRESHOLD = 0.05;
const VELOCITY_BUFFER_SIZE = 3;
const VELOCITY_MULTIPLIER = 28;

// Punch detection thresholds
const PUNCH_SCALE_GROW_THRESHOLD = 14; // px/frame hand size growth = punch
const PUNCH_SCALE_HISTORY = 4;

/**
 * Per-hand state.
 */
function createHandState() {
  return {
    active: false,
    isPinching: false,
    wasPinching: false,
    pinchDist: 1.0,
    pos: { x: 0, y: 0 },
    indexPos: { x: 0, y: 0 },
    thumbPos: { x: 0, y: 0 },
    posHistory: [],
    velocity: { x: 0, y: 0 },
    // Punch
    scale: 0,
    scaleHistory: [],
    isPunching: false,
    // Thumb gestures (checked per-frame)
    isThumbsUp: false,
    isThumbsDown: false,
  };
}

export class HandTracker {
  constructor() {
    this.left = createHandState();
    this.right = createHandState();
    this.canvasWidth = 1;
    this.canvasHeight = 1;
    this._hands = null;
    this._camera = null;
  }

  async init(videoEl, canvasW, canvasH) {
    this.canvasWidth = canvasW;
    this.canvasHeight = canvasH;

    /* global Hands, Camera */
    this._hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results) => this._onResults(results));

    this._camera = new Camera(videoEl, {
      onFrame: async () => { await this._hands.send({ image: videoEl }); },
      width: 1280,
      height: 720,
    });

    await this._camera.start();
  }

  resize(w, h) {
    this.canvasWidth = w;
    this.canvasHeight = h;
  }

  _onResults(results) {
    this.left.wasPinching  = this.left.isPinching;
    this.right.wasPinching = this.right.isPinching;

    // Clear one-frame flags
    this.left.isPunching   = false;
    this.right.isPunching  = false;
    this.left.isThumbsUp   = false;
    this.right.isThumbsUp  = false;
    this.left.isThumbsDown = false;
    this.right.isThumbsDown = false;
    this.left.active  = false;
    this.right.active = false;

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.left.isPinching  = false;
      this.right.isPinching = false;
      this.left.posHistory  = [];
      this.right.posHistory = [];
      this.left.scaleHistory  = [];
      this.right.scaleHistory = [];
      return;
    }

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks  = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i];

      const label = handedness.label === 'Right' ? 'left' : 'right';
      const hand  = this[label];

      hand.active = true;

      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      hand.indexPos.x = (1 - indexTip.x) * this.canvasWidth;
      hand.indexPos.y = indexTip.y * this.canvasHeight;
      hand.thumbPos.x = (1 - thumbTip.x) * this.canvasWidth;
      hand.thumbPos.y = thumbTip.y * this.canvasHeight;
      
      hand.pos.x = (hand.indexPos.x + hand.thumbPos.x) / 2;
      hand.pos.y = (hand.indexPos.y + hand.thumbPos.y) / 2;

      // Pinch
      const pdx = thumbTip.x - indexTip.x;
      const pdy = thumbTip.y - indexTip.y;
      hand.pinchDist  = Math.sqrt(pdx * pdx + pdy * pdy);
      hand.isPinching = hand.pinchDist < PINCH_THRESHOLD;

      // Velocity
      hand.posHistory.push({ x: hand.pos.x, y: hand.pos.y });
      if (hand.posHistory.length > VELOCITY_BUFFER_SIZE) hand.posHistory.shift();
      if (hand.posHistory.length >= 2) {
        const prev = hand.posHistory[hand.posHistory.length - 2];
        const curr = hand.posHistory[hand.posHistory.length - 1];
        hand.velocity.x = (curr.x - prev.x) * VELOCITY_MULTIPLIER;
        hand.velocity.y = (curr.y - prev.y) * VELOCITY_MULTIPLIER;
      }

      // ── Punch detection ──
      const wrist     = landmarks[0];
      const middleMCP = landmarks[9];
      const sdx = (wrist.x - middleMCP.x) * this.canvasWidth;
      const sdy = (wrist.y - middleMCP.y) * this.canvasHeight;
      const currentScale = Math.sqrt(sdx * sdx + sdy * sdy);

      hand.scaleHistory.push(currentScale);
      if (hand.scaleHistory.length > PUNCH_SCALE_HISTORY) hand.scaleHistory.shift();

      if (hand.scaleHistory.length >= PUNCH_SCALE_HISTORY) {
        const oldest = hand.scaleHistory[0];
        const newest = hand.scaleHistory[hand.scaleHistory.length - 1];
        const growthPerFrame = (newest - oldest) / (hand.scaleHistory.length - 1);
        if (growthPerFrame > PUNCH_SCALE_GROW_THRESHOLD && !hand.isPinching) {
          hand.isPunching = true;
          hand.scaleHistory = [];
        }
      }
      hand.scale = currentScale;

      // ── Thumbs up / Thumbs down detection ──
      // Uses normalized Y coords (0=top, 1=bottom of frame).
      // Fingers curled = fingertip Y > its PIP joint Y (finger points down/inward).
      // Thumb up:   thumb tip well above wrist, all other fingers curled.
      // Thumb down: thumb tip well below wrist, all other fingers curled.
      const fingersCurled = _fingersCurled(landmarks);

      if (fingersCurled) {
        const thumbAboveWrist = thumbTip.y < wrist.y - 0.1;
        const thumbBelowWrist = thumbTip.y > wrist.y + 0.1;
        hand.isThumbsUp   = thumbAboveWrist;
        hand.isThumbsDown = thumbBelowWrist;
      }
    }
  }

  justPinched(side)  { return this[side].isPinching  && !this[side].wasPinching; }
  justReleased(side) { return !this[side].isPinching && this[side].wasPinching;  }

  get anyPunch()     { return this.left.isPunching    || this.right.isPunching;  }
  get anyThumbsUp()  { return this.left.isThumbsUp    || this.right.isThumbsUp;  }
  get anyThumbsDown(){ return this.left.isThumbsDown  || this.right.isThumbsDown;}
}

// ── Helper: all four non-thumb fingers are curled ──
// PIP joints: index=6, middle=10, ring=14, pinky=18
// Tip joints: index=8, middle=12, ring=16, pinky=20
function _fingersCurled(lm) {
  const pairs = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return pairs.every(([tip, pip]) => lm[tip].y > lm[pip].y);
}
