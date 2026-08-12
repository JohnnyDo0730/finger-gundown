import { ActionConfig } from '../core/WeaponConfig.js';

/**
 * GestureEngine - Pure logic module that processes MediaPipe Holistic raw landmarks
 * and outputs discrete game events ('ON_MOVE', 'ON_AIM', 'ON_FIRE', 'ON_RELOAD', 'ON_SLASH', 'ON_PAUSE', 'ON_SKILL', 'ON_ULT', 'ON_SYNC_AIM').
 */
export class GestureEngine {
  constructor() {
    this.listeners = {};

    // Configurable thresholds for easy parameter tuning
    this.config = {
      // --- LEFT HAND JOYSTICK MOVE ---
      moveSensitivityX: 0.06,    // Scale factor for horizontal joystick tilt
      moveSensitivityY: 0.042,   // Scale factor for vertical joystick tilt
      moveNeutralY: -0.095,      // Calibrated natural center y-vector
      moveDeadzone: 0.15,        // Deadzone threshold for movement

      // --- RIGHT HAND RANGED (WEAPON) ---
      thumbUpThreshold: 0.025,   // Thumbs-up detection threshold
      triggerThreshold: 0.065,   // Firing trigger distance threshold

      // --- RIGHT HAND MELEE (SWORD) ---
      slashSpeedThreshold: 1.8,  // Velocity threshold for sword swings
      slashCooldown: 350,         // Cooldown between swings (ms)

      // --- CHARGE TIMES AND ANIMATION LOCKOUT TIMES (dynamically mapped from ActionConfig) ---
      chargeTimes: {
        pause: ActionConfig['left-pause'].chargeTime,
        reload: ActionConfig['right-reload'].chargeTime,
        skill: ActionConfig['right-skill'].chargeTime,
        ult: ActionConfig['right-sync-ult'].chargeTime
      },
      animationTimes: {
        pause: ActionConfig['left-pause'].animationTime,
        reload: ActionConfig['right-reload'].animationTime,
        skill: ActionConfig['right-skill'].animationTime,
        ult: ActionConfig['right-sync-ult'].animationTime
      }
    };

    // Active weapon or testing mode: 'basic', 'ranged', 'melee', 'all'
    this.weaponMode = 'all';
    this.appMode = 'UI';

    // Active animation lockout state
    this.animationLockEnd = 0;       // Timestamp when current lock expires
    this.activeAnimationName = '';   // 'reload', 'skill', 'ult'

    // Charging state starts (0 = not charging)
    this.chargeStarts = {
      pause: 0,
      reload: 0,
      skill: 0,
      ult: 0
    };

    this.isReloadStateActive = false;
    this.isPauseStateActive = false;
    this.isSkillStateActive = false;
    this.isUltStateActive = false;

    // Dual-hand sync aim scoping states (with 0.5s transition charge)
    this.isSyncAimActive = false;
    this.syncAimStartRightWrist = null;
    this.syncAimZoom = 1.0;
    this.syncAimTransitionStart = 0;

    // Melee slash: rolling 150ms buffer of index-finger-tip positions
    // Each entry: { x, y, t } — world-normalized coordinates + timestamp
    this.slashHistory = [];
    this.lastSlashTime = 0;
  }

  /**
   * Set the active weapon/testing mode to filter specific gestures.
   * @param {string} mode 'basic' | 'ranged' | 'melee' | 'all'
   */
  setWeaponMode(mode) {
    this.weaponMode = mode;
    console.log(`[GestureEngine] Weapon Mode updated to: ${mode}`);
  }

  /**
   * Set the active application mode.
   * @param {string} mode 'UI' | 'DEBUG' | 'GAMEPLAY'
   */
  setMode(mode) {
    this.appMode = mode;
    console.log(`[GestureEngine] App Mode updated to: ${mode}`);
  }

  /**
   * Register listener for specific gesture events.
   */
  addEventListener(eventName, callback) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(callback);
  }

  /**
   * Emit event to all registered listeners.
   * @private
   */
  emit(eventName, data) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[GestureEngine] Event dispatch failed for ${eventName}:`, err);
        }
      });
    }
  }

  /**
   * Register a cast lockout animation lock.
   */
  startAnimationLock(name, duration, timestamp) {
    if (duration > 0) {
      this.animationLockEnd = timestamp + duration;
      this.activeAnimationName = name;
      console.log(`[GestureEngine] Animation lockout active: ${name} for ${duration}ms`);
    }
  }

  /**
   * Process raw MediaPipe landmarks feed.
   */
  processFrame(leftHand, rightHand, pose) {
    const timestamp = Date.now();

    // Evaluate dual-hand sync aim scoping using both hands first (aim-first priority logic)
    let isSyncAiming = false;
    const allowSyncAimScoping = this.weaponMode === 'ranged' || this.weaponMode === 'all';

    if (leftHand && allowSyncAimScoping) {
      isSyncAiming = this.evaluateLeftHandAim(leftHand, rightHand, timestamp);
    } else {
      if (this.isSyncAimActive) {
        this.isSyncAimActive = false;
        this.syncAimStartRightWrist = null;
        this.syncAimZoom = 1.0;
        this.syncAimTransitionStart = 0;
        this.emit('ON_SYNC_AIM', { active: false, zoom: 1.0, deltaX: 0, deltaY: 0 });
      }
    }

    // 1. Process Left Hand (Pause & Move Joystick)
    if (leftHand) {
      // Evaluate pause gesture (always active and never locked)
      this.evaluateLeftHandPause(leftHand, timestamp);

      // Freeze movement when actively locked in skill/ult casting animations OR when in Sync Aim Mode
      const isSkillOrUltLocked = (timestamp < this.animationLockEnd) && (this.activeAnimationName === 'skill' || this.activeAnimationName === 'ult');
      const isMovementFrozen = isSkillOrUltLocked || isSyncAiming;

      if (isMovementFrozen) {
        this.emit('ON_MOVE', { moveX: 0, moveY: 0 });
      } else {
        const moveVector = this.evaluateLeftHandMove(leftHand);
        this.emit('ON_MOVE', moveVector);
      }
    } else {
      this.resetPauseState();
      this.emit('ON_MOVE', { moveX: 0, moveY: 0 });
    }

    // Evaluate dual-hand ultimate state using both hands
    this.evaluateSyncUlt(leftHand, rightHand, timestamp);

    // 2. Process Right Hand
    if (rightHand) {
      this.evaluateRightHandWeapons(rightHand, timestamp);
    } else {
      // Reset reload/skill tracking states when hand is lost
      this.chargeStarts.reload = 0;
      this.isReloadStateActive = false;
      this.chargeStarts.skill = 0;
      this.isSkillStateActive = false;
      this.lastRightWrist = null;
      this.emit('ON_AIM', { active: false });
      this.emit('ON_FIRE', { active: false });
    }
  }

  /**
   * Evaluate left hand pause gesture (palm facing camera, all fingers straight & closed together).
   */
  evaluateLeftHandPause(landmarks, timestamp) {
    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    const thumbBase = landmarks[2];
    const pinkyKnuckle = landmarks[17];
    if (!wrist || !thumbBase || !pinkyKnuckle) return false;

    // Palm must face the camera
    const isPalmFacing = thumbBase.x < pinkyKnuckle.x;
    if (!isPalmFacing) {
      this.resetPauseState();
      return false;
    }

    // Finger Tips
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Second Joints (PIP)
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    // MCP Knuckles
    const indexKnuckle = landmarks[5];
    const ringKnuckle = landmarks[13];

    if (!indexTip || !middleTip || !ringTip || !pinkyTip || !indexPip || !middlePip || !ringPip || !pinkyPip || !indexKnuckle || !ringKnuckle) {
      this.resetPauseState();
      return false;
    }

    // Fingers must be straight (extended)
    const isIndexStraight = getDistance(indexTip, wrist) > getDistance(indexPip, wrist) * 1.15;
    const isMiddleStraight = getDistance(middleTip, wrist) > getDistance(middlePip, wrist) * 1.15;
    const isRingStraight = getDistance(ringTip, wrist) > getDistance(ringPip, wrist) * 1.15;
    const isPinkyStraight = getDistance(pinkyTip, wrist) > getDistance(pinkyPip, wrist) * 1.15;

    const areFingersStraight = isIndexStraight && isMiddleStraight && isRingStraight && isPinkyStraight;
    if (!areFingersStraight) {
      this.resetPauseState();
      return false;
    }

    // Fingers must be closed together (pressed together/併攏)
    const d_index_middle = getDistance(indexTip, middleTip);
    const d_middle_ring = getDistance(middleTip, ringTip);
    const totalThreeFingerGap = d_index_middle + d_middle_ring;

    const getDirVector = (knuckle, tip) => {
      const dx = tip.x - knuckle.x;
      const dy = tip.y - knuckle.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return len > 0.0001 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    };

    const dirIndex = getDirVector(indexKnuckle, indexTip);
    const dirRing = getDirVector(ringKnuckle, ringTip);
    const indexRingDot = dirIndex.x * dirRing.x + dirIndex.y * dirRing.y;

    const areFingersClosed = (totalThreeFingerGap < 0.075) && (indexRingDot > 0.975);

    if (areFingersClosed) {
      if (this.chargeStarts.pause === 0) {
        this.chargeStarts.pause = timestamp;
        this.isPauseStateActive = true;
        this.emit('ON_PAUSE_STATE', { active: true });
      } else {
        const duration = timestamp - this.chargeStarts.pause;
        if (duration >= this.config.chargeTimes.pause) {
          this.emit('ON_PAUSE', { duration });
          // Reset timer to allow repeat toggle if player keeps holding
          this.chargeStarts.pause = timestamp;
        }
      }
      return true;
    } else {
      this.resetPauseState();
      return false;
    }
  }

  resetPauseState() {
    if (this.isPauseStateActive) {
      this.isPauseStateActive = false;
      this.chargeStarts.pause = 0;
      this.emit('ON_PAUSE_STATE', { active: false });
    }
  }

  /**
   * Left hand tilt vector mapped to 2D moving joystick (-1 to 1).
   * Reversed horizontal steering logic fixed, and added front palm fist detection for moving backward.
   */
  evaluateLeftHandMove(landmarks) {
    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    const thumbBase = landmarks[2];
    const pinkyKnuckle = landmarks[17];
    const middleRoot = landmarks[9];

    if (!wrist || !middleRoot || !thumbBase || !pinkyKnuckle) return { moveX: 0, moveY: 0 };

    const dx = middleRoot.x - wrist.x;
    const dy = middleRoot.y - wrist.y;

    // Fixed steering direction: inverted horizontal sign
    let moveX = dx / this.config.moveSensitivityX;

    // Finger Tips & PIPs for fist detection
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    // Check if left hand is making a fist (front-facing hand, fingers curled)
    const isIndexCurled = indexTip && indexPip && getDistance(indexTip, wrist) < getDistance(indexPip, wrist) * 1.15;
    const isMiddleCurled = middleTip && middlePip && getDistance(middleTip, wrist) < getDistance(middlePip, wrist) * 1.15;
    const isRingCurled = ringTip && ringPip && getDistance(ringTip, wrist) < getDistance(ringPip, wrist) * 1.15;
    const isPinkyCurled = pinkyTip && pinkyPip && getDistance(pinkyTip, wrist) < getDistance(pinkyPip, wrist) * 1.15;
    const isLeftFist = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;

    let moveY = 0;

    if (isLeftFist) {
      moveY = 1.0; // Moving backward
      moveX = 0;   // Disable steering on reverse
    } else {
      // Keep original hand back flip logic commented out as requested:
      // const isLeftHandFlipped = thumbBase.x > pinkyKnuckle.x;
      // if (isLeftHandFlipped) {
      //   moveY = 1.0;
      //   moveX = 0;
      // }

      // Normal palm-facing hand vertical tilt represents moving FORWARD only
      const dyDiff = dy - this.config.moveNeutralY;
      if (dyDiff > 0) {
        moveY = -dyDiff / this.config.moveSensitivityY;
        moveY = Math.max(-1, Math.min(0, moveY));
      } else {
        moveY = 0;
      }
    }

    moveX = Math.max(-1, Math.min(1, moveX));

    if (Math.abs(moveX) < this.config.moveDeadzone) moveX = 0;
    if (Math.abs(moveY) < this.config.moveDeadzone) moveY = 0;

    return { moveX, moveY };
  }

  /**
   * Evaluate left-hand tactical sync-aim OK gesture trigger and scoping magnification adjustments.
   * Scopes when left thumb and index tips are pinched, and scales magnification from 1.0x to 4.0x
   * by mapping the 3D distance between the middle fingertip and index fingertip.
   */
  evaluateLeftHandAim(landmarks, rightHand, timestamp) {
    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    if (!wrist) return false;

    // Joints / Knuckles
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];

    if (!thumbTip || !indexTip || !middleTip) {
      return false;
    }

    // 1. Detect OK pinch (Left thumb tip and index tip pinched together)
    const pinchDist = getDistance(thumbTip, indexTip);
    const isLeftAimDetected = pinchDist < 0.04;

    // 2. State-Transition Machine: 0.5-second charge hold buffer in both directions
    if (!this.isSyncAimActive) {
      if (isLeftAimDetected) {
        if (this.syncAimTransitionStart === 0) {
          this.syncAimTransitionStart = timestamp;
        } else if (timestamp - this.syncAimTransitionStart >= 500) {
          this.isSyncAimActive = true;
          this.syncAimTransitionStart = 0;
          if (rightHand && rightHand[0]) {
            this.syncAimStartRightWrist = { x: rightHand[0].x, y: rightHand[0].y };
          } else {
            this.syncAimStartRightWrist = null;
          }
          console.log('[GestureEngine] Left-hand OK sync-aim mode activated.');
        }
      } else {
        this.syncAimTransitionStart = 0;
      }
    } else {
      if (!isLeftAimDetected) {
        if (this.syncAimTransitionStart === 0) {
          this.syncAimTransitionStart = timestamp;
        } else if (timestamp - this.syncAimTransitionStart >= 500) {
          this.isSyncAimActive = false;
          this.syncAimTransitionStart = 0;
          this.syncAimStartRightWrist = null;
          this.syncAimZoom = 1.0;
          this.emit('ON_SYNC_AIM', { active: false, zoom: 1.0, deltaX: 0, deltaY: 0 });
          console.log('[GestureEngine] Left-hand OK sync-aim mode deactivated.');
        }
      } else {
        this.syncAimTransitionStart = 0;
      }
    }

    // 3. Output logic if sync aim is active
    if (this.isSyncAimActive) {
      if (!this.syncAimStartRightWrist && rightHand && rightHand[0]) {
        this.syncAimStartRightWrist = { x: rightHand[0].x, y: rightHand[0].y };
      }

      // Calculate 3D distance between middle fingertip and index fingertip
      const distMiddleIndex = getDistance(middleTip, indexTip);

      // Linear mapping: distMiddleIndex >= 0.12 is straight (1.0x zoom), distMiddleIndex <= 0.03 is curled (4.0x zoom)
      let zoomRatio = (0.12 - distMiddleIndex) / 0.09;
      zoomRatio = Math.max(0, Math.min(1, zoomRatio));
      this.syncAimZoom = 1.0 + zoomRatio * 3.0;

      // Output events
      if (rightHand && rightHand[0] && this.syncAimStartRightWrist) {
        const deltaX = rightHand[0].x - this.syncAimStartRightWrist.x;
        const deltaY = rightHand[0].y - this.syncAimStartRightWrist.y;
        this.emit('ON_SYNC_AIM', { active: true, zoom: this.syncAimZoom, deltaX, deltaY });
      } else {
        this.emit('ON_SYNC_AIM', { active: true, zoom: this.syncAimZoom, deltaX: 0, deltaY: 0 });
      }

      return true;
    }

    return false;
  }

  /**
   * Evaluate right hand aiming, firing, reloading, and slashes.
   */
  evaluateRightHandWeapons(landmarks, timestamp) {
    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    if (!wrist) return;

    // Check cast animation locks first (Reload/Skill/Ult locks out aiming, firing and slashes)
    const isLocked = timestamp < this.animationLockEnd;
    if (isLocked) {
      // Clean up charge states if locked out
      this.chargeStarts.reload = 0;
      this.isReloadStateActive = false;
      this.chargeStarts.skill = 0;
      this.isSkillStateActive = false;
      this.chargeStarts.ult = 0;
      this.isUltStateActive = false;

      this.emit('ON_AIM', { active: false });
      this.emit('ON_FIRE', { active: false });
      return;
    }

    // Finger Tips
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Joints / Knuckles
    const thumbBase = landmarks[2];
    const indexKnuckle = landmarks[5];
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];
    const pinkyKnuckle = landmarks[17];

    const allowRangedAimFire = this.weaponMode === 'ranged' || this.weaponMode === 'melee' || this.weaponMode === 'all';
    const allowReload = this.weaponMode === 'ranged' || this.weaponMode === 'all';
    const allowSkill = this.weaponMode === 'ranged' || this.weaponMode === 'melee' || this.weaponMode === 'all';
    const allowSlash = this.weaponMode === 'melee' || this.weaponMode === 'all';

    // Evaluate charging skill (Right hand uppercut fist) - ALLOWED IN BOTH RANGED AND MELEE MODES
    if (allowSkill) {
      this.evaluateRightHandSkill(landmarks, timestamp);
    }

    // --- 1. RELOAD GESTURE CHECK (RANGED ONLY) ---
    const isHandFlipped = thumbBase.x < pinkyKnuckle.x;
    const isHandFlippedStrict = thumbBase.x < (pinkyKnuckle.x - 0.03);

    const dx = indexKnuckle.x - wrist.x;
    const dy = indexKnuckle.y - wrist.y;
    const isAngleTilted45 = Math.abs(dx) > Math.abs(dy);

    // Prevent skill/reload overlap: reload requires index finger to be extended (straight, NOT curled)
    const isReloadIndexStraight = indexTip && indexPip && getDistance(indexTip, wrist) > getDistance(indexPip, wrist) * 1.15;
    const isReloadTriggered = allowReload && (isHandFlippedStrict || (isHandFlipped && isAngleTilted45)) && isReloadIndexStraight;

    if (isReloadTriggered) {
      // Disable shooting controls while preparing reload
      this.emit('ON_AIM', { active: false });
      this.emit('ON_FIRE', { active: false });

      if (this.chargeStarts.reload === 0) {
        this.chargeStarts.reload = timestamp;
        this.isReloadStateActive = true;
        this.emit('ON_RELOAD_STATE', { active: true });
      } else {
        const duration = timestamp - this.chargeStarts.reload;
        if (duration >= this.config.chargeTimes.reload) {
          this.emit('ON_RELOAD', { duration });
          this.chargeStarts.reload = 0;
          this.isReloadStateActive = false;
          this.emit('ON_RELOAD_STATE', { active: false });
          // Start 2.0s reload lockout animation
          this.startAnimationLock('reload', this.config.animationTimes.reload, timestamp);
        }
      }
    } else {
      if (this.isReloadStateActive) {
        this.isReloadStateActive = false;
        this.chargeStarts.reload = 0;
        this.emit('ON_RELOAD_STATE', { active: false });
      }

      // --- 2. RANGED GESTURES (AIM & FIRE) - ALLOWED IN BOTH RANGED AND MELEE MODES ---
      if (allowRangedAimFire) {
        const isMiddleCurled = getDistance(middleTip, wrist) < getDistance(middlePip, wrist) * 1.35;
        const isRingCurled = getDistance(ringTip, wrist) < getDistance(ringPip, wrist) * 1.35;
        const isPinkyCurled = getDistance(pinkyTip, wrist) < getDistance(pinkyPip, wrist) * 1.40;

        const isThumbUp = (thumbBase.y - thumbTip.y) > this.config.thumbUpThreshold;
        const isWeaponBaseActive = isMiddleCurled && isRingCurled && isPinkyCurled && isThumbUp;

        if (isWeaponBaseActive) {
          const xDiff = Math.abs(indexTip.x - indexKnuckle.x);

          if (xDiff < this.config.triggerThreshold) {
            this.emit('ON_AIM', { active: true, wristX: wrist.x, wristY: wrist.y });
            this.emit('ON_FIRE', { active: false });
          } else {
            this.emit('ON_AIM', { active: false });
            this.emit('ON_FIRE', { active: true, force: xDiff });
          }
        } else {
          this.emit('ON_AIM', { active: false });
          this.emit('ON_FIRE', { active: false });
        }
      } else {
        this.emit('ON_AIM', { active: false });
        this.emit('ON_FIRE', { active: false });
      }
    }

    // --- 3. MELEE SWORD SLASH — 150ms rolling index-tip buffer ---
    if (allowSlash && indexTip) {
      const WINDOW_MS = 150;      // Rolling time window length
      const MIN_NET_DISP = 0.10;  // Minimum net displacement (raised to reduce false triggers)
      const MIN_STRAIGHT = 0.72;  // Minimum straightness ratio (net / path)
      const MIN_SPEED = 1.5;   // Minimum average speed (units/s) to qualify as intentional slash (raised to 1.0)

      // Push current index-tip position into the rolling buffer
      this.slashHistory.push({ x: indexTip.x, y: indexTip.y, t: timestamp });

      // Trim entries older than WINDOW_MS
      while (this.slashHistory.length > 1 && (timestamp - this.slashHistory[0].t) > WINDOW_MS) {
        this.slashHistory.shift();
      }

      // Need at least a few samples before testing
      if (this.slashHistory.length >= 4 && (timestamp - this.lastSlashTime) > this.config.slashCooldown) {
        const oldest = this.slashHistory[0];
        const newest = this.slashHistory[this.slashHistory.length - 1];

        // Net displacement: straight-line distance from first to last point
        const ndx = newest.x - oldest.x;
        const ndy = newest.y - oldest.y;
        const netDisp = Math.sqrt(ndx * ndx + ndy * ndy);

        // Path length: cumulative step distances through all sampled points
        let pathLength = 0;
        for (let i = 1; i < this.slashHistory.length; i++) {
          const px = this.slashHistory[i].x - this.slashHistory[i - 1].x;
          const py = this.slashHistory[i].y - this.slashHistory[i - 1].y;
          pathLength += Math.sqrt(px * px + py * py);
        }

        const straightness = pathLength > 0.001 ? netDisp / pathLength : 0;
        const timeDelta = (newest.t - oldest.t) / 1000;
        const speed = timeDelta > 0 ? netDisp / timeDelta : 0;

        if (netDisp >= MIN_NET_DISP && straightness >= MIN_STRAIGHT && speed >= MIN_SPEED) {
          this.lastSlashTime = timestamp;
          this.slashHistory = []; // Clear after firing to prevent double-trigger

          // Direction: head-to-tail vector.
          // dirX is negated here to compensate for the mirrored camera coordinate system,
          // ensuring rightward movement maps to a positive dirX value in the output event.
          const dirX = netDisp > 0.001 ? -(ndx / netDisp) : 0;
          const dirY = netDisp > 0.001 ? ndy / netDisp : 0;

          this.emit('ON_SLASH', { dirX, dirY, speed });
        }
      }
    } else if (!allowSlash) {
      // Clear slash buffer when mode is not melee
      this.slashHistory = [];
    }
  }

  /**
   * Evaluate right-hand single-handed skill charge (fist pointing up uppercut style).
   * Locked movement, 1.0s charge, 3.0s animation.
   */
  evaluateRightHandSkill(landmarks, timestamp) {
    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexKnuckle = landmarks[5];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const pinkyKnuckle = landmarks[17];

    if (!wrist || !indexTip || !indexPip || !indexKnuckle || !middleTip || !middlePip || !ringTip || !ringPip || !pinkyTip || !pinkyPip || !pinkyKnuckle) {
      return;
    }

    // 1. Right hand is making a fist (four fingers curled)
    const isIndexCurled = getDistance(indexTip, wrist) < getDistance(indexPip, wrist) * 1.15;
    const isMiddleCurled = getDistance(middleTip, wrist) < getDistance(middlePip, wrist) * 1.15;
    const isRingCurled = getDistance(ringTip, wrist) < getDistance(ringPip, wrist) * 1.15;
    const isPinkyCurled = getDistance(pinkyTip, wrist) < getDistance(pinkyPip, wrist) * 1.15;
    const isRightFist = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;

    // 2. Fist is pointing up (knuckles above wrist vertically)
    const isFistPointingUp = indexKnuckle.y < wrist.y;

    // 3. Orientation: index knuckle left of pinky knuckle (back of hand to camera)
    const isBackOfHandFacingCamera = indexKnuckle.x < pinkyKnuckle.x;

    const isSkillGestureDetected = isRightFist && isFistPointingUp && isBackOfHandFacingCamera;

    if (isSkillGestureDetected) {
      if (this.chargeStarts.skill === 0) {
        this.chargeStarts.skill = timestamp;
        this.isSkillStateActive = true;
        this.emit('ON_SKILL_STATE', { active: true });
        console.log('[GestureEngine] Right-hand skill charging started...');
      } else {
        const duration = timestamp - this.chargeStarts.skill;
        if (duration >= this.config.chargeTimes.skill) {
          this.emit('ON_SKILL', { duration });
          this.chargeStarts.skill = 0;
          this.isSkillStateActive = false;
          this.emit('ON_SKILL_STATE', { active: false });
          this.startAnimationLock('skill', this.config.animationTimes.skill, timestamp);
        }
      }
    } else {
      if (this.isSkillStateActive) {
        this.isSkillStateActive = false;
        this.chargeStarts.skill = 0;
        this.emit('ON_SKILL_STATE', { active: false });
      }
    }
  }

  /**
   * Evaluate dual-hand ultimate charge (thumbs & index fingers forming a Kikoho triangle).
   * Locked movement, 1.5s charge, 5.0s animation.
   * Allowed in both Ranged and Melee modes.
   */
  evaluateSyncUlt(leftHand, rightHand, timestamp) {
    // Block ultimate charging if locked out by ANY active casting animation
    const isLocked = timestamp < this.animationLockEnd;
    if (isLocked) {
      if (this.isUltStateActive) {
        this.isUltStateActive = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
      return;
    }

    const allowSyncUlt = this.weaponMode === 'ranged' || this.weaponMode === 'melee' || this.weaponMode === 'all';
    if (!allowSyncUlt) {
      if (this.isUltStateActive) {
        this.isUltStateActive = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
      return;
    }

    if (!leftHand || !rightHand) {
      if (this.isUltStateActive) {
        this.isUltStateActive = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
      return;
    }

    const getDistance = (p1, p2) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    // Left hand points
    const leftWrist = leftHand[0];
    const leftThumbTip = leftHand[4];
    const leftThumbBase = leftHand[2];
    const leftIndexTip = leftHand[8];
    const leftIndexPip = leftHand[6];
    const leftMiddleTip = leftHand[12];
    const leftMiddlePip = leftHand[10];
    const leftRingTip = leftHand[16];
    const leftRingPip = leftHand[14];
    const leftPinkyTip = leftHand[20];
    const leftPinkyPip = leftHand[18];

    // Right hand points
    const rightWrist = rightHand[0];
    const rightThumbTip = rightHand[4];
    const rightThumbBase = rightHand[2];
    const rightIndexTip = rightHand[8];
    const rightIndexPip = rightHand[6];
    const rightMiddleTip = rightHand[12];
    const rightMiddlePip = rightHand[10];
    const rightRingTip = rightHand[16];
    const rightRingPip = rightHand[14];
    const rightPinkyTip = rightHand[20];
    const rightPinkyPip = rightHand[18];

    if (!leftWrist || !leftThumbTip || !leftThumbBase || !leftIndexTip || !leftIndexPip || !leftMiddleTip || !leftMiddlePip || !leftRingTip || !leftRingPip || !leftPinkyTip || !leftPinkyPip ||
      !rightWrist || !rightThumbTip || !rightThumbBase || !rightIndexTip || !rightIndexPip || !rightMiddleTip || !rightMiddlePip || !rightRingTip || !rightRingPip || !rightPinkyTip || !rightPinkyPip) {
      return;
    }

    // 1. Shapes check on both hands (Index & thumb straight, other 3 curled)
    const isLeftIdxStraight = getDistance(leftIndexTip, leftWrist) > getDistance(leftIndexPip, leftWrist) * 1.15;
    const isLeftThumbStraight = getDistance(leftThumbTip, leftWrist) > getDistance(leftThumbBase, leftWrist) * 1.1;
    const isLeftOtherCurled =
      getDistance(leftMiddleTip, leftWrist) < getDistance(leftMiddlePip, leftWrist) * 1.15 &&
      getDistance(leftRingTip, leftWrist) < getDistance(leftRingPip, leftWrist) * 1.15 &&
      getDistance(leftPinkyTip, leftWrist) < getDistance(leftPinkyPip, leftWrist) * 1.15;

    const isRightIdxStraight = getDistance(rightIndexTip, rightWrist) > getDistance(rightIndexPip, rightWrist) * 1.15;
    const isRightThumbStraight = getDistance(rightThumbTip, rightWrist) > getDistance(rightThumbBase, rightWrist) * 1.1;
    const isRightOtherCurled =
      getDistance(rightMiddleTip, rightWrist) < getDistance(rightMiddlePip, rightWrist) * 1.15 &&
      getDistance(rightRingTip, rightWrist) < getDistance(rightRingPip, rightWrist) * 1.15 &&
      getDistance(rightPinkyTip, rightWrist) < getDistance(rightPinkyPip, rightWrist) * 1.15;

    const isLeftShape = isLeftIdxStraight && isLeftThumbStraight && isLeftOtherCurled;
    const isRightShape = isRightIdxStraight && isRightThumbStraight && isRightOtherCurled;

    // 2. Relative proximity (thumbs close together, index fingers close together to form triangle)
    const thumbsClose = getDistance(leftThumbTip, rightThumbTip) < 0.12;
    const indexClose = getDistance(leftIndexTip, rightIndexTip) < 0.12;

    // 3. Vertical alignment (index tips above thumbs/wrist to form apex of triangle)
    const indexHigher = leftIndexTip.y < leftThumbTip.y - 0.10 && rightIndexTip.y < rightThumbTip.y - 0.10;

    const isUltGestureDetected = isLeftShape && isRightShape && thumbsClose && indexClose && indexHigher;

    if (isUltGestureDetected) {
      if (this.chargeStarts.ult === 0) {
        this.chargeStarts.ult = timestamp;
        this.isUltStateActive = true;
        this.emit('ON_ULT_STATE', { active: true });
        console.log('[GestureEngine] Synced Kikoho ultimate charging started...');
      } else {
        const duration = timestamp - this.chargeStarts.ult;
        if (duration >= this.config.chargeTimes.ult) {
          this.emit('ON_ULT', { duration });
          this.chargeStarts.ult = 0;
          this.isUltStateActive = false;
          this.emit('ON_ULT_STATE', { active: false });
          // Start 5.0s ultimate animation lock
          this.startAnimationLock('ult', this.config.animationTimes.ult, timestamp);
        }
      }
    } else {
      if (this.isUltStateActive) {
        this.isUltStateActive = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
    }
  }
}
