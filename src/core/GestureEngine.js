import { WeaponConfig, ActionConfig } from './WeaponConfig.js';

/**
 * GestureEngine - Centralized Hand Gesture Recognition & Contextual Event Filter.
 * Processes raw landmark arrays from VisionManager and outputs discrete/continuous events.
 * Coordinates coordinate smoothing, pinch lock-assist, and two-tier gesture masking.
 */
export class GestureEngine {
  constructor() {
    this.listeners = {};

    // Standard thresholds for parameter tuning
    this.config = {
      // --- LEFT HAND JOYSTICK MOVE ---
      moveSensitivityX: 0.06,    // Scale factor for horizontal joystick tilt
      moveSensitivityY: 0.042,   // Scale factor for vertical joystick tilt
      moveNeutralY: -0.095,      // Calibrated natural center y-vector
      moveDeadzone: 0.15,        // Deadzone threshold for movement

      // --- RIGHT HAND RANGED (WEAPON) ---
      triggerThreshold: 0.085,   // Firing trigger distance threshold

      // --- RIGHT HAND MELEE (SWORD) ---
      slashSpeedThreshold: 1.5,  // Velocity threshold for sword swings
      slashCooldown: 350,        // Cooldown between swings (ms)
    };

    // Modes configuration
    this.appMode = 'UI';       // 'UI' | 'DEBUG' | 'GAMEPLAY'
    this.weaponMode = 'pistol'; // Current active weapon key ('pistol', 'rifle', 'sword', 'wizard')
    this.debugTab = 'basic';    // Active tab in test studio ('basic', 'ranged', 'melee', 'calibrate', 'record')

    // Dynamic Animation Lockout State
    this.animationLockEnd = 0;       // Timestamp when current lock expires
    this.activeAnimationName = '';   // 'reload', 'skill', 'ult'
    this.isLockoutActive = false;

    // Charging state trackers (timestamps, 0 = not charging)
    this.chargeStarts = {
      pause: 0,
      reload: 0,
      skill: 0,
      ult: 0
    };

    // Active state indicators (emitted to sync diagnostics cards)
    this.states = {
      pause: false,
      reload: false,
      skill: false,
      ult: false,
      syncAim: false
    };

    // Dual-hand sync aim scoping states
    this.syncAimStartRightWrist = null;
    this.syncAimZoom = 1.0;
    this.syncAimTransitionStart = 0;

    // Melee slash rolling gesture buffer
    this.slashHistory = [];
    this.lastSlashTime = 0;

    // Smoothed right hand tracking coordinates (to filter out MediaPipe jitter)
    this.smoothedRightIndex = { x: 0.5, y: 0.5 };
    this.smoothedRightIndexInitialized = false;

    // Calibration coordinates (Comfortable viewport mapping bounds)
    this.calib_xMin = 0.15;
    this.calib_xMax = 0.85;
    this.calib_yMin = 0.20;
    this.calib_yMax = 0.80;

    this.loadCalibrationData();
  }

  /**
   * Load stored calibration bounds from localStorage.
   */
  loadCalibrationData() {
    this.calib_xMin = parseFloat(localStorage.getItem('gesture_calib_xMin')) || 0.15;
    this.calib_xMax = parseFloat(localStorage.getItem('gesture_calib_xMax')) || 0.85;
    this.calib_yMin = parseFloat(localStorage.getItem('gesture_calib_yMin')) || 0.20;
    this.calib_yMax = parseFloat(localStorage.getItem('gesture_calib_yMax')) || 0.80;
  }

  resetAllChargeStates() {
    this.chargeStarts.pause = 0;
    this.chargeStarts.reload = 0;
    this.chargeStarts.skill = 0;
    this.chargeStarts.ult = 0;

    this.states.pause = false;
    this.states.reload = false;
    this.states.skill = false;
    this.states.ult = false;
    this.states.syncAim = false;
  }

  /**
   * Set the active application mode.
   * @param {string} mode 'UI' | 'DEBUG' | 'GAMEPLAY'
   */
  setMode(mode) {
    this.appMode = mode;
    console.log(`[GestureEngine] App Mode set to: ${mode}`);
    this.resetAllChargeStates();
  }

  /**
   * Set the active weapon mode key.
   * @param {string} weaponKey 'pistol' | 'rifle' | 'sword' | 'wizard'
   */
  setWeaponMode(weaponKey) {
    this.weaponMode = weaponKey;
    console.log(`[GestureEngine] Weapon Mode set to: ${weaponKey}`);
    this.resetAllChargeStates();
  }

  /**
   * Set the active debug tab key (for DEBUG mode static masking).
   * @param {string} tab 'basic' | 'ranged' | 'melee' | 'calibrate' | 'record'
   */
  setDebugTab(tab) {
    this.debugTab = tab;
    console.log(`[GestureEngine] Debug Tab set to: ${tab}`);
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
   * Deregister listener for specific gesture events.
   */
  removeEventListener(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }
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
   * Helper to check if a gesture is permitted by the active static context mask.
   * @private
   */
  isGestureAllowed(gestureName) {
    // 1. UI Mode (Menus): Only cursor positioning and pinch clicks are allowed
    if (this.appMode === 'UI') {
      return gestureName === 'aim' || gestureName === 'fire';
    }

    // 2. DEBUG Mode (Test Studio): Filter based on the selected Mode Tab
    if (this.appMode === 'DEBUG') {
      // Aim, fire, and pause are always enabled for UI navigation / diagnostics
      if (gestureName === 'aim' || gestureName === 'fire' || gestureName === 'pause') return true;

      const tab = this.debugTab;
      if (tab === 'record') return true;
      if (tab === 'basic') return gestureName === 'move';
      if (tab === 'ranged') return gestureName === 'move' || gestureName === 'reload' || gestureName === 'skill' || gestureName === 'ult' || gestureName === 'sync_aim';
      if (tab === 'melee') return gestureName === 'move' || gestureName === 'slash' || gestureName === 'skill' || gestureName === 'ult';
      if (tab === 'calibrate') return false; // calibration manages its own clicks
      return false;
    }

    // 3. GAMEPLAY Mode: Filter based on selected weapon configure hiveActions
    if (this.appMode === 'GAMEPLAY') {
      if (gestureName === 'move' || gestureName === 'pause' || gestureName === 'aim') return true;

      const weapon = WeaponConfig[this.weaponMode];
      if (!weapon || !weapon.hiveActions) return false;

      const actionKeyMap = {
        'sync_aim': 'aim',
        'aim': 'aim',
        'fire': 'fire',
        'reload': 'reload',
        'slash': 'slash',
        'skill': 'skill',
        'ult': 'ult'
      };
      const actionKey = actionKeyMap[gestureName];
      return weapon.hiveActions[actionKey] && weapon.hiveActions[actionKey].active;
    }

    return false;
  }

  startAnimationLock(name, duration, timestamp) {
    if (duration > 0) {
      this.animationLockEnd = timestamp + duration;
      this.activeAnimationName = name;
      this.isLockoutActive = true;

      // Match old project rules: Reload locks ranged weapons, skills, and ults; Skills/Ults lock all actions.
      const blocked = name === 'reload'
        ? ['aim', 'fire', 'reload', 'sync_aim', 'skill', 'ult']
        : ['aim', 'fire', 'reload', 'sync_aim', 'slash', 'skill', 'ult', 'move'];

      this.emit('ON_LOCKOUT', {
        action: name,
        active: true,
        duration: duration,
        endTime: this.animationLockEnd,
        suppressedActions: blocked
      });

      console.log(`[GestureEngine] Dynamic lockout: ${name} locked for ${duration}ms`);
    }
  }

  /**
   * Process raw MediaPipe landmarks feed and broadcast active events.
   */
  processFrame(leftHand, rightHand, pose) {
    const timestamp = Date.now();

    // 0. Perform Dynamic Lockout Self-Cleaning Check
    if (this.isLockoutActive && timestamp >= this.animationLockEnd) {
      this.isLockoutActive = false;
      this.emit('ON_LOCKOUT', { 
        action: this.activeAnimationName, 
        active: false,
        suppressedActions: []
      });
      console.log(`[GestureEngine] Dynamic lockout released: ${this.activeAnimationName}`);
      this.activeAnimationName = '';
    }

    const isLocked = this.isLockoutActive;

    // 1. Process Dual-Hand Tactical Sync Aim Scoping
    let isSyncAiming = false;
    if (leftHand && this.isGestureAllowed('sync_aim') && !isLocked) {
      isSyncAiming = this.evaluateLeftHandAim(leftHand, rightHand, timestamp);
    } else {
      if (this.states.syncAim) {
        this.states.syncAim = false;
        this.syncAimStartRightWrist = null;
        this.syncAimZoom = 1.0;
        this.emit('ON_SYNC_AIM', { active: false, zoom: 1.0, deltaX: 0, deltaY: 0 });
      }
      if (this.syncAimTransitionStart > 0) {
        this.syncAimTransitionStart = 0;
        this.emit('ON_SYNC_AIM_STATE', { active: false, charging: false });
      }
    }

    // 2. Process Left Hand Movement (Joystick & Pause)
    if (leftHand) {
      // Pause gesture (always evaluated, escapes animation locks)
      if (this.isGestureAllowed('pause')) {
        this.evaluateLeftHandPause(leftHand, timestamp);
      }

      // Joystick Movement (Frozen during skill/ult casting lockouts or sync-aiming)
      const isMovementFrozen = isLocked && (this.activeAnimationName === 'skill' || this.activeAnimationName === 'ult');
      if (this.isGestureAllowed('move') && !isMovementFrozen && !isSyncAiming) {
        const moveVector = this.evaluateLeftHandMove(leftHand);
        this.emit('ON_MOVE', moveVector);
      } else {
        this.emit('ON_MOVE', { moveX: 0, moveY: 0 });
      }
    } else {
      this.resetPauseState();
      this.emit('ON_MOVE', { moveX: 0, moveY: 0 });
    }

    // 3. Process Dual-Hand Sync Ultimate (Triangle gesture)
    if (this.isGestureAllowed('ult')) {
      this.evaluateSyncUlt(leftHand, rightHand, timestamp);
    }

    // 4. Process Right Hand Aim & Fire / Reload / Melee Slash
    if (rightHand) {
      const indexTip = rightHand[8]; // Index finger tip is standard for cursor aim
      const thumbTip = rightHand[4];

      // A. Perform Aim Coordinate Mapping & Stabilization
      if (thumbTip && this.isGestureAllowed('aim')) {
        // Map camera coordinates (0-1) to viewport normalized space (0-1) with horizontal inversion
        let targetX = (thumbTip.x - this.calib_xMin) / (this.calib_xMax - this.calib_xMin);
        let targetY = (thumbTip.y - this.calib_yMin) / (this.calib_yMax - this.calib_yMin);
        targetX = 1 - targetX; // Mirror horizontal axis
        targetX = Math.max(0, Math.min(1, targetX));
        targetY = Math.max(0, Math.min(1, targetY));

        // Evaluate Pinch Click Trigger
        let isPinching = false;
        if (indexTip) {
          const distThumbIndex = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) + 
            Math.pow(thumbTip.y - indexTip.y, 2)
          );
          isPinching = distThumbIndex < 0.035;
        }

        // Apply Exponential Smoothing & Pinch Lock-Assist
        if (!this.smoothedRightIndexInitialized) {
          this.smoothedRightIndex.x = targetX;
          this.smoothedRightIndex.y = targetY;
          this.smoothedRightIndexInitialized = true;
        } else {
          // If pinching, FREEZE coordinates completely to prevent drift (UI mode only to allow aiming during gameplay fire)
          const shouldFreeze = isPinching && this.appMode === 'UI';
          if (!shouldFreeze) {
            this.smoothedRightIndex.x += (targetX - this.smoothedRightIndex.x) * 0.35;
            this.smoothedRightIndex.y += (targetY - this.smoothedRightIndex.y) * 0.35;
          }
        }

        // Broadcast smoothed coordinate
        if (!isLocked) {
          this.emit('ON_AIM', {
            active: true,
            wristX: this.smoothedRightIndex.x,
            wristY: this.smoothedRightIndex.y
          });
        } else {
          this.emit('ON_AIM', { active: false });
        }

        // Broadcast Pinch clicks (blocked during dynamic lockouts)
        if (this.isGestureAllowed('fire') && !isLocked) {
          this.emit('ON_FIRE', { active: isPinching, force: 1.0 });
        } else {
          this.emit('ON_FIRE', { active: false });
        }
      } else {
        this.emit('ON_AIM', { active: false });
        this.emit('ON_FIRE', { active: false });
      }

      // B. Process Weapon Reload & Melee Slashes
      if (!isLocked) {
        this.evaluateRightHandWeapons(rightHand, timestamp);
      }
    } else {
      this.smoothedRightIndexInitialized = false;
      if (this.states.reload) {
        this.states.reload = false;
        this.chargeStarts.reload = 0;
        this.emit('ON_RELOAD_STATE', { active: false });
      }
      if (this.states.skill) {
        this.states.skill = false;
        this.chargeStarts.skill = 0;
        this.emit('ON_SKILL_STATE', { active: false });
      }
      this.emit('ON_AIM', { active: false });
      this.emit('ON_FIRE', { active: false });
    }
  }

  /**
   * Evaluate left hand pause gesture (palm facing camera, fingers straight & closed).
   * @private
   */
  evaluateLeftHandPause(landmarks, timestamp) {
    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const wrist = landmarks[0];
    const thumbBase = landmarks[2];
    const pinkyKnuckle = landmarks[17];
    const middleRoot = landmarks[9];
    if (!wrist || !thumbBase || !pinkyKnuckle || !middleRoot) return;

    // Palm must face camera (thumb left of pinky)
    const isPalmFacing = thumbBase.x < pinkyKnuckle.x;
    if (!isPalmFacing) {
      this.resetPauseState();
      return;
    }

    // Finger Tips & joints
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    if (!indexTip || !middleTip || !ringTip || !pinkyTip || !indexPip || !middlePip || !ringPip || !pinkyPip) {
      this.resetPauseState();
      return;
    }

    // Extension check
    const isIndexStraight = getDistance(indexTip, wrist) > getDistance(indexPip, wrist) * 1.15;
    const isMiddleStraight = getDistance(middleTip, wrist) > getDistance(middlePip, wrist) * 1.15;
    const isRingStraight = getDistance(ringTip, wrist) > getDistance(ringPip, wrist) * 1.15;
    const isPinkyStraight = getDistance(pinkyTip, wrist) > getDistance(pinkyPip, wrist) * 1.15;

    if (!(isIndexStraight && isMiddleStraight && isRingStraight && isPinkyStraight)) {
      this.resetPauseState();
      return;
    }

    // Closed fingers check (low spacing gap normalized by distance-invariant palm size)
    const d_index_middle = getDistance(indexTip, middleTip);
    const d_middle_ring = getDistance(middleTip, ringTip);
    const gap = d_index_middle + d_middle_ring;
    const palmSize = getDistance(wrist, middleRoot);
    const ratio = palmSize > 0.001 ? gap / palmSize : 999;

    if (ratio < 0.45) {
      if (this.chargeStarts.pause === 0) {
        this.chargeStarts.pause = timestamp;
        this.states.pause = true;
        this.emit('ON_PAUSE_STATE', { active: true });
      } else {
        const duration = timestamp - this.chargeStarts.pause;
        const requiredTime = ActionConfig['left-pause'].chargeTime || 1000;
        if (duration >= requiredTime) {
          this.emit('ON_PAUSE', { duration });
          this.chargeStarts.pause = timestamp; // Repeat toggle holding helper
        }
      }
    } else {
      this.resetPauseState();
    }
  }

  resetPauseState() {
    if (this.states.pause) {
      this.states.pause = false;
      this.chargeStarts.pause = 0;
      this.emit('ON_PAUSE_STATE', { active: false });
    }
  }

  /**
   * Left hand tilt vector mapped to 2D moving joystick (-1 to 1).
   * @private
   */
  evaluateLeftHandMove(landmarks) {
    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const wrist = landmarks[0];
    const middleRoot = landmarks[9];
    if (!wrist || !middleRoot) return { moveX: 0, moveY: 0 };

    const dx = middleRoot.x - wrist.x;
    const dy = middleRoot.y - wrist.y;

    // Horizontal steering (negated to correct mirrored camera coordinates)
    let moveX = -dx / this.config.moveSensitivityX;

    // Curly check for reverse movement (making a fist)
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    const isIndexCurled = indexTip && indexPip && getDistance(indexTip, wrist) < getDistance(indexPip, wrist) * 1.15;
    const isMiddleCurled = middleTip && middlePip && getDistance(middleTip, wrist) < getDistance(middlePip, wrist) * 1.15;
    const isRingCurled = ringTip && ringPip && getDistance(ringTip, wrist) < getDistance(ringPip, wrist) * 1.15;
    const isPinkyCurled = pinkyTip && pinkyPip && getDistance(pinkyTip, wrist) < getDistance(pinkyPip, wrist) * 1.15;
    const isLeftFist = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;

    let moveY = 0;
    if (isLeftFist) {
      moveY = 1.0; // Reverse backward
      moveX = 0;
    } else {
      // Forward move (tilt hand down/forward)
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
   * Evaluate left-hand tactical sync-aim OK gesture trigger.
   * @private
   */
  evaluateLeftHandAim(landmarks, rightHand, timestamp) {
    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    if (!thumbTip || !indexTip || !middleTip) return false;

    // Detect OK pinch (Left thumb tip and index tip pinched)
    const pinchDist = getDistance(thumbTip, indexTip);
    const isLeftAimDetected = pinchDist < 0.04;

    // Transition hold timer (0.5s transition buffer)
    if (!this.states.syncAim) {
      if (isLeftAimDetected) {
        if (this.syncAimTransitionStart === 0) {
          this.syncAimTransitionStart = timestamp;
          this.emit('ON_SYNC_AIM_STATE', { active: true, charging: true, type: 'entering' });
        } else if (timestamp - this.syncAimTransitionStart >= 500) {
          this.states.syncAim = true;
          this.syncAimTransitionStart = 0;
          this.syncAimStartRightWrist = (rightHand && rightHand[0]) ? { x: rightHand[0].x, y: rightHand[0].y } : null;
          this.emit('ON_SYNC_AIM_STATE', { active: true, charging: false });
          console.log('[GestureEngine] Tactical sync-aim activated.');
        }
      } else {
        if (this.syncAimTransitionStart > 0) {
          this.syncAimTransitionStart = 0;
          this.emit('ON_SYNC_AIM_STATE', { active: false, charging: false });
        }
      }
    } else {
      if (!isLeftAimDetected) {
        if (this.syncAimTransitionStart === 0) {
          this.syncAimTransitionStart = timestamp;
          this.emit('ON_SYNC_AIM_STATE', { active: true, charging: true, type: 'exiting' });
        } else if (timestamp - this.syncAimTransitionStart >= 500) {
          this.states.syncAim = false;
          this.syncAimTransitionStart = 0;
          this.syncAimStartRightWrist = null;
          this.syncAimZoom = 1.0;
          this.emit('ON_SYNC_AIM', { active: false, zoom: 1.0, deltaX: 0, deltaY: 0 });
          this.emit('ON_SYNC_AIM_STATE', { active: false, charging: false });
          console.log('[GestureEngine] Tactical sync-aim deactivated.');
        }
      } else {
        if (this.syncAimTransitionStart > 0) {
          this.syncAimTransitionStart = 0;
          this.emit('ON_SYNC_AIM_STATE', { active: true, charging: false });
        }
      }
    }

    if (this.states.syncAim) {
      if (!this.syncAimStartRightWrist && rightHand && rightHand[0]) {
        this.syncAimStartRightWrist = { x: rightHand[0].x, y: rightHand[0].y };
      }

      // Only update the zoom ratio when the left hand OK pinch is actively detected.
      // This prevents the zoom level from dropping to 1x during the 500ms release transition buffer.
      let ratio = this.syncAimZoom;
      if (isLeftAimDetected) {
        const distMiddleIndex = getDistance(middleTip, indexTip);
        ratio = (distMiddleIndex - 0.03) / 0.08;
        ratio = Math.max(0, Math.min(1, ratio));
        this.syncAimZoom = ratio; // Zoom represents normalized ratio [0.0, 1.0]
      }
 
      let deltaX = 0, deltaY = 0;
      if (rightHand && rightHand[0] && this.syncAimStartRightWrist) {
        deltaX = rightHand[0].x - this.syncAimStartRightWrist.x;
        deltaY = rightHand[0].y - this.syncAimStartRightWrist.y;
      }
 
      this.emit('ON_SYNC_AIM', { active: true, zoom: this.syncAimZoom, zoomRatio: ratio, deltaX, deltaY });
      return true;
    }

    return false;
  }

  /**
   * Evaluate right hand reload charge and melee slashes.
   * @private
   */
  evaluateRightHandWeapons(landmarks, timestamp) {
    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const wrist = landmarks[0];
    if (!wrist) return;

    // A. Evaluate Skill Uppercut Charge (Allowed in ranged/melee)
    if (this.isGestureAllowed('skill')) {
      this.evaluateRightHandSkill(landmarks, timestamp);
    }

    // B. Evaluate Reload Trigger (Flipped hand back facing camera)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const thumbBase = landmarks[2];
    const pinkyKnuckle = landmarks[17];
    const indexKnuckle = landmarks[5];
    const indexPip = landmarks[6];

    if (this.isGestureAllowed('reload') && thumbBase && pinkyKnuckle && indexKnuckle && indexTip && indexPip) {
      const isHandFlipped = thumbBase.x < pinkyKnuckle.x - 0.02;
      const isReloadIndexStraight = getDistance(indexTip, wrist) > getDistance(indexPip, wrist) * 1.15;
      const isReloadTriggered = isHandFlipped && isReloadIndexStraight;

      if (isReloadTriggered) {
        if (this.chargeStarts.reload === 0) {
          this.chargeStarts.reload = timestamp;
          this.states.reload = true;
          this.emit('ON_RELOAD_STATE', { active: true });
        } else {
          const duration = timestamp - this.chargeStarts.reload;
          const weaponKey = this.appMode === 'GAMEPLAY' ? this.weaponMode : 'pistol';
          const weapon = WeaponConfig[weaponKey] || {};
          const requiredTime = weapon.hiveActions?.reload?.chargeTime || ActionConfig['right-reload']?.chargeTime || 1000;
          
          if (duration >= requiredTime) {
            this.emit('ON_RELOAD', { duration });
            this.chargeStarts.reload = 0;
            this.states.reload = false;
            this.emit('ON_RELOAD_STATE', { active: false });
            
            const lockTime = weapon.hiveActions?.reload?.animationTime || ActionConfig['right-reload']?.animationTime || 2000;
            this.startAnimationLock('reload', lockTime, timestamp);
          }
        }
      } else {
        if (this.states.reload) {
          this.states.reload = false;
          this.chargeStarts.reload = 0;
          this.emit('ON_RELOAD_STATE', { active: false });
        }
      }
    }

    // C. Evaluate Melee Slash swipe velocity
    if (this.isGestureAllowed('slash') && indexTip) {
      const WINDOW_MS = 150;
      const MIN_NET_DISP = 0.10;
      const MIN_STRAIGHT = 0.72;
      const MIN_SPEED = this.config.slashSpeedThreshold;

      this.slashHistory.push({ x: indexTip.x, y: indexTip.y, t: timestamp });

      while (this.slashHistory.length > 1 && (timestamp - this.slashHistory[0].t) > WINDOW_MS) {
        this.slashHistory.shift();
      }

      if (this.slashHistory.length >= 4 && (timestamp - this.lastSlashTime) > this.config.slashCooldown) {
        const oldest = this.slashHistory[0];
        const newest = this.slashHistory[this.slashHistory.length - 1];

        const ndx = newest.x - oldest.x;
        const ndy = newest.y - oldest.y;
        const netDisp = Math.sqrt(ndx * ndx + ndy * ndy);

        let pathLength = 0;
        for (let i = 1; i < this.slashHistory.length; i++) {
          pathLength += getDistance(this.slashHistory[i], this.slashHistory[i - 1]);
        }

        const straightness = pathLength > 0.001 ? netDisp / pathLength : 0;
        const timeDelta = (newest.t - oldest.t) / 1000;
        const speed = timeDelta > 0 ? netDisp / timeDelta : 0;

        if (netDisp >= MIN_NET_DISP && straightness >= MIN_STRAIGHT && speed >= MIN_SPEED) {
          this.lastSlashTime = timestamp;
          this.slashHistory = [];

          // Mirror horizontal swipe direction
          const dirX = netDisp > 0.001 ? -(ndx / netDisp) : 0;
          const dirY = netDisp > 0.001 ? ndy / netDisp : 0;

          this.emit('ON_SLASH', { dirX, dirY, speed });
        }
      }
    } else {
      this.slashHistory = [];
    }
  }

  /**
   * Evaluate right-hand single uppercut fist skill charge.
   * @private
   */
  evaluateRightHandSkill(landmarks, timestamp) {
    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

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

    const isIndexCurled = getDistance(indexTip, wrist) < getDistance(indexPip, wrist) * 1.15;
    const isMiddleCurled = getDistance(middleTip, wrist) < getDistance(middlePip, wrist) * 1.15;
    const isRingCurled = getDistance(ringTip, wrist) < getDistance(ringPip, wrist) * 1.15;
    const isPinkyCurled = getDistance(pinkyTip, wrist) < getDistance(pinkyPip, wrist) * 1.15;
    const isRightFist = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;

    // Knuckles above wrist and hand back facing camera
    const isFistPointingUp = indexKnuckle.y < wrist.y;
    const isBackOfHandFacingCamera = indexKnuckle.x < pinkyKnuckle.x;

    const isSkillDetected = isRightFist && isFistPointingUp && isBackOfHandFacingCamera;

    if (isSkillDetected) {
      if (this.chargeStarts.skill === 0) {
        this.chargeStarts.skill = timestamp;
        this.states.skill = true;
        this.emit('ON_SKILL_STATE', { active: true });
        console.log('[GestureEngine] Skill charging started.');
      } else {
        const duration = timestamp - this.chargeStarts.skill;
        const weaponKey = this.appMode === 'GAMEPLAY' ? this.weaponMode : 'pistol';
        const weapon = WeaponConfig[weaponKey] || {};
        const requiredTime = weapon.hiveActions?.skill?.chargeTime || ActionConfig['right-skill']?.chargeTime || 1000;
        if (duration >= requiredTime) {
          this.emit('ON_SKILL', { duration });
          this.chargeStarts.skill = 0;
          this.states.skill = false;
          this.emit('ON_SKILL_STATE', { active: false });

          const lockTime = weapon.hiveActions?.skill?.animationTime || ActionConfig['right-skill']?.animationTime || 3000;
          this.startAnimationLock('skill', lockTime, timestamp);
        }
      }
    } else {
      if (this.states.skill) {
        this.states.skill = false;
        this.chargeStarts.skill = 0;
        this.emit('ON_SKILL_STATE', { active: false });
      }
    }
  }

  /**
   * Evaluate sync ultimate charge (double index/thumb forming a triangle).
   * @private
   */
  evaluateSyncUlt(leftHand, rightHand, timestamp) {
    if (!leftHand || !rightHand || this.isLockoutActive) {
      if (this.states.ult) {
        this.states.ult = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
      return;
    }

    const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const leftThumb = leftHand[4];
    const leftIndex = leftHand[8];
    const rightThumb = rightHand[4];
    const rightIndex = rightHand[8];

    if (!leftThumb || !leftIndex || !rightThumb || !rightIndex) return;

    // Triangle check: thumbs tips together, index tips together, forming a frame
    const distThumbs = getDistance(leftThumb, rightThumb);
    const distIndices = getDistance(leftIndex, rightIndex);
    
    // Low distances signify triangle points touching
    const isTriangleDetected = distThumbs < 0.07 && distIndices < 0.07;

    if (isTriangleDetected) {
      if (this.chargeStarts.ult === 0) {
        this.chargeStarts.ult = timestamp;
        this.states.ult = true;
        this.emit('ON_ULT_STATE', { active: true });
        console.log('[GestureEngine] Ultimate charging started.');
      } else {
        const duration = timestamp - this.chargeStarts.ult;
        const weaponKey = this.appMode === 'GAMEPLAY' ? this.weaponMode : 'pistol';
        const weapon = WeaponConfig[weaponKey] || {};
        const requiredTime = weapon.hiveActions?.ult?.chargeTime || ActionConfig['right-sync-ult']?.chargeTime || 1500;
        if (duration >= requiredTime) {
          this.emit('ON_ULT', { duration });
          this.chargeStarts.ult = 0;
          this.states.ult = false;
          this.emit('ON_ULT_STATE', { active: false });

          const lockTime = weapon.hiveActions?.ult?.animationTime || ActionConfig['right-sync-ult']?.animationTime || 5000;
          this.startAnimationLock('ult', lockTime, timestamp);
        }
      }
    } else {
      if (this.states.ult) {
        this.states.ult = false;
        this.chargeStarts.ult = 0;
        this.emit('ON_ULT_STATE', { active: false });
      }
    }
  }
}
