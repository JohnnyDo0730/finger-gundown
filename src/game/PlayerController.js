const THREE = window.THREE;
import { WeaponConfig } from '../core/WeaponConfig.js';
import { PistolWeapon } from './weapons/PistolWeapon.js';
import { RifleWeapon } from './weapons/RifleWeapon.js';
import { SniperWeapon } from './weapons/SniperWeapon.js';
import { KatanaWeapon } from './weapons/KatanaWeapon.js';
import { BloodMagicWeapon } from './weapons/BloodMagicWeapon.js';
import { CrimsonClanWeapon } from './weapons/CrimsonClanWeapon.js';

/**
 * PlayerController - Manages 3D player positioning, camera yaw rotation,
 * gesture mappings (move joystick, aim raycast, scoped zoom, triggers),
 * and bounds kiting.
 */
export class PlayerController {
  /**
   * @param {THREE.Camera} camera - Three.js camera
   * @param {App} app - Core application coordinator
   * @param {GameWorld} gameWorld - Active 3D world instance
   */
  constructor(camera, app, gameWorld) {
    this.camera = camera;
    this.app = app;
    this.gameWorld = gameWorld;

    // Player position (eye-level height 1.6, starting at Z=30)
    this.position = new THREE.Vector3(0, 1.6, 30);
    this.yaw = 0;

    // Movement physics values
    this.currentSpeed = 0;
    this.maxSpeed = 10.0;
    this.acceleration = 2.5;
    this.deceleration = 4.0;
    this.rotationSpeed = 1.2;

    this.boundaryMin = -100;
    this.boundaryMax = 100;

    // Gestures movement
    this.moveX = 0;
    this.moveY = 0;

    // Aiming & scoping states
    this.screenX = window.innerWidth / 2;
    this.screenY = window.innerHeight / 2;
    this.handX = window.innerWidth / 2;
    this.handY = window.innerHeight / 2;
    this.isZoomed = false;
    this.currentFov = 75;
    this.targetFov = 75;

    // Semi-automatic trigger safety locking
    this.isShootPressed = false;
    this.isSkillPressed = false;
    this.isAimFiring = false;

    // Scoping camera: Unity-style absolute center-anchored offsets
    this.aimCenterYaw = 0;     // World yaw locked at scope entry moment
    this.aimYawOffset = 0;     // Relative yaw offset from center
    this.aimPitchOffset = 0;   // Relative pitch offset from center
    this.aimMaxYaw = 60;       // Max horizontal degrees from center
    this.aimMaxPitch = 30;     // Max vertical degrees from center
    this.baseFov = 75;         // Reference FOV for sensitivity scaling
    // ↓ TUNE HERE: minimum sensitivity floor at max zoom (0.0 = full FPS lock, 1.0 = no reduction)
    // At 0.15, sensitivity scales down much more aggressively at high zoom for precision aiming.
    this.aimSensFloor = 0.15;   // Min ratio of sensitivity retained at max zoom
    this.aimHandHistory = [];  // Sliding window queue for hand coordinates to filter jitter
    this.aimHandHistoryMax = 5; // Reduced from 10 to 5 to reduce delay (approx 83ms lag)
    this.aimStartYaw = 0;      // Very initial world yaw when zoom entered, preserved for exit return
    this.lastEffectiveMaxYaw = 0;   // Cached max yaw for dynamic scaling anchor adjustment
    this.lastEffectiveMaxPitch = 0; // Cached max pitch for dynamic scaling anchor adjustment
    this.isUltCharging = false;     // Ultimate charging state lock

    // Pinch safety release locks
    this.pinchReleaseRequired = false;

    this.equippedWeapon = null;
    this.lastDeltaTime = 0.016;

    this.init();
  }

  equipWeapon(weaponKey) {
    if (this.equippedWeapon) {
      this.equippedWeapon.unequip();
    }

    const config = WeaponConfig[weaponKey] || {};
    switch (weaponKey) {
      case 'pistol':
        this.equippedWeapon = new PistolWeapon(weaponKey, config, this.app, this);
        break;
      case 'rifle':
        this.equippedWeapon = new RifleWeapon(weaponKey, config, this.app, this);
        break;
      case 'sniper':
        this.equippedWeapon = new SniperWeapon(weaponKey, config, this.app, this);
        break;
      case 'katana':
        this.equippedWeapon = new KatanaWeapon(weaponKey, config, this.app, this);
        break;
      case 'blood-magic':
        this.equippedWeapon = new BloodMagicWeapon(weaponKey, config, this.app, this);
        break;
      case 'crimson-clan':
        this.equippedWeapon = new CrimsonClanWeapon(weaponKey, config, this.app, this);
        break;
      default:
        this.equippedWeapon = null;
        break;
    }

    if (this.equippedWeapon) {
      this.equippedWeapon.equip(null);
    }
  }

  getContext() {
    const targetPoint = this.get3DTargetPoint();
    const totalYaw = this.yaw + this.aimYawOffset;
    const offset = new THREE.Vector3(0, -0.4, -0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), totalYaw);
    const startPoint = this.position.clone().add(offset);
    const direction = targetPoint.clone().sub(startPoint).normalize();

    return {
      actionHelper: this.gameWorld ? this.gameWorld.actionHelper : null,
      targetPoint,
      startPoint,
      direction,
      camera: this.camera,
      deltaTime: this.lastDeltaTime
    };
  }

  isGameplayActive() {
    return this.app.stateManager && this.app.stateManager.getState() === 'PLAYING';
  }

  init() {
    console.log('[PlayerController] Initializing movement and triggers...');

    // Equip selected weapon
    const weaponKey = localStorage.getItem('gesture_selected_weapon') || 'pistol';
    this.equipWeapon(weaponKey);

    // Listen to game State transitions to trigger pinch release locks
    if (this.app.stateManager) {
      this.app.stateManager.subscribe((state) => {
        if (state === 'PLAYING') {
          this.pinchReleaseRequired = true;
          this.isAimFiring = false;
          this.isShootPressed = false;
        }
      });
    }

    // 1. Listen to GestureEngine events
    if (this.app.gestureEngine) {
      this.app.gestureEngine.addEventListener('ON_MOVE', (data) => {
        this.moveX = data.moveX || 0;
        this.moveY = data.moveY || 0;
      });

      this.app.gestureEngine.addEventListener('ON_AIM', (data) => {
        if (data.active) {
          // Always track raw hand coordinates
          this.handX = data.wristX * window.innerWidth;
          this.handY = data.wristY * window.innerHeight;

          if (!this.isZoomed) {
            this.screenX = this.handX;
            this.screenY = this.handY;
          } else {
            // Lock crosshair to exact window center when scoping
            this.screenX = window.innerWidth / 2;
            this.screenY = window.innerHeight / 2;
          }
        }
      });

      this.app.gestureEngine.addEventListener('ON_SYNC_AIM', (data) => {
        if (!this.isGameplayActive()) return;

        // Only trigger initialization/teardown when the zoom state actually changes!
        if (this.isZoomed !== data.active) {
          this.isZoomed = data.active;
          if (data.active) {
            // Capture the absolute world yaw at scope entry (ResetAimCenter equivalent)
            this.aimStartYaw = this.yaw; // Preserve very initial entry yaw
            this.aimCenterYaw = this.yaw;
            this.aimYawOffset = 0;
            this.aimPitchOffset = 0;
            this.screenX = window.innerWidth / 2;
            this.screenY = window.innerHeight / 2;
            this.aimHandHistory = []; // Reset hand history on entry
            // Initialize scale caching based on full range (FOV ratio = 1.0 initially)
            this.lastEffectiveMaxYaw = this.aimMaxYaw;
            this.lastEffectiveMaxPitch = this.aimMaxPitch;
          } else {
            // Revert base yaw back to the current center yaw to prevent an instant snap
            this.yaw = this.aimCenterYaw;
            this.aimCenterYaw = 0;
            // Note: We do NOT immediately zero aimYawOffset / aimPitchOffset here.
            // Letting them remain allows them to smoothly decay to 0 in update() for a clean return transition.
            this.screenX = this.handX || window.innerWidth / 2;
            this.screenY = this.handY || window.innerHeight / 2;
            this.aimHandHistory = []; // Clear history on exit
          }
        }

        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('aim', { zoom: data.zoom, active: data.active });
        } else {
          this.targetFov = 75;
        }
      });

      this.app.gestureEngine.addEventListener('ON_FIRE', (data) => {
        if (!this.isGameplayActive()) {
          this.isAimFiring = false;
          this.isShootPressed = false;
          return;
        }
        if (!data.active) {
          this.pinchReleaseRequired = false;
          this.isShootPressed = false;
          this.isAimFiring = false;
          return;
        }

        if (this.pinchReleaseRequired) {
          return; // Block shooting until they release the pinch at least once after entering PLAYING
        }

        this.isAimFiring = true;
        if (!this.isShootPressed) {
          if (this.equippedWeapon) {
            this.equippedWeapon.onAction('fire', this.getContext());
          }
          this.isShootPressed = true;
        }
      });

      this.app.gestureEngine.addEventListener('ON_RELOAD', () => {
        if (!this.isGameplayActive()) return;
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('reload', this.getContext());
        }
      });

      this.app.gestureEngine.addEventListener('ON_SLASH', () => {
        if (!this.isGameplayActive()) return;
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('slash', this.getContext());
        }
      });

      this.app.gestureEngine.addEventListener('ON_SKILL', () => {
        if (!this.isGameplayActive()) return;
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('skill', this.getContext());
        }
      });

      this.app.gestureEngine.addEventListener('ON_ULT', () => {
        if (!this.isGameplayActive()) return;
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('ult', this.getContext());
        }
      });

      this.app.gestureEngine.addEventListener('ON_ULT_STATE', (data) => {
        this.isUltCharging = data.active;
      });
    }

    this.syncCamera();
  }

  get3DTargetPoint() {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(
      (this.screenX / window.innerWidth) * 2 - 1,
      -(this.screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, this.camera);

    // Intersect plane at Z = 15 relative to starting plane, or forward target zone
    const targetPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -10);
    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(targetPlane, targetPoint);
    return targetPoint;
  }

  update(deltaTime) {
    this.lastDeltaTime = deltaTime || 0.016;

    // Check if the selected weapon has changed in localStorage (e.g. from pause weapon menu selection)
    const activeWeaponKey = localStorage.getItem('gesture_selected_weapon') || 'pistol';
    if (!this.equippedWeapon || this.equippedWeapon.id !== activeWeaponKey) {
      console.log(`[PlayerController] Weapon configuration changed to ${activeWeaponKey}. Re-equipping.`);
      this.equipWeapon(activeWeaponKey);
    }

    // If ultimate is charging, force-disable movement, steering and lock aiming offsets
    if (this.isUltCharging) {
      this.moveX = 0;
      this.moveY = 0;
      this.currentSpeed = 0;
    }

    // 1. Move position X/Z yaw steering
    const targetSpeed = -this.moveY * this.maxSpeed;
    if (Math.abs(targetSpeed) > Math.abs(this.currentSpeed)) {
      this.currentSpeed += (targetSpeed - this.currentSpeed) * this.acceleration * deltaTime;
    } else {
      this.currentSpeed += (targetSpeed - this.currentSpeed) * this.deceleration * deltaTime;
    }
    this.currentSpeed = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.currentSpeed));

    // Apply threshold deadzone and cubic response curve to smooth and slow down initial rotation sensitivity
    let steeringInput = this.moveX;
    const deadzone = 0.15;
    if (Math.abs(steeringInput) < deadzone) {
      steeringInput = 0;
    } else {
      steeringInput = Math.sign(steeringInput) * ((Math.abs(steeringInput) - deadzone) / (1 - deadzone));
    }
    const steeringCurve = Math.pow(steeringInput, 3);

    // Reverse steering direction to turn left on left tilt (negative moveX) and right on right tilt (positive moveX)
    this.yaw -= steeringCurve * this.rotationSpeed * deltaTime;

    if (steeringCurve !== 0) {
      this.aimStartYaw = 0; // Cancel automatic zoom-return if player inputs manual steering
    }

    // Apply steering vector to position
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    direction.multiplyScalar(this.currentSpeed * deltaTime);
    this.position.add(direction);

    // Arena boundaries clamp
    this.position.x = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.x));
    this.position.z = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.z));

    // Unity-style absolute scoping camera offsets
    if (this.isZoomed) {
      if (!this.isUltCharging) {
        // Raw FOV ratio: 1.0 at 1x zoom, ~0.17 at 6x zoom
        const fovRatio = this.currentFov / this.baseFov;

        // Dynamic sensitivity floor: instead of hard-scaling by raw FOV ratio,
        // lerp between the floor and 1.0. This keeps gesture feel alive at high zoom.
        // TUNE: this.aimSensFloor (line ~66 in constructor) — 0.6 recommended for gesture games
        const dynamicRatio = this.aimSensFloor + (1.0 - this.aimSensFloor) * fovRatio;

        // Apply dynamic ratio to max angular range
        const effectiveMaxYaw = this.aimMaxYaw * dynamicRatio;
        const effectiveMaxPitch = this.aimMaxPitch * dynamicRatio;

        // 0. Dynamic Center Anchoring: Adjust center anchor when scale changes to prevent camera shift when zoom changes
        if (this.lastEffectiveMaxYaw > 0 && this.lastEffectiveMaxYaw !== effectiveMaxYaw) {
          const scaleX = effectiveMaxYaw / this.lastEffectiveMaxYaw;
          const scaleY = effectiveMaxPitch / this.lastEffectiveMaxPitch;

          const oldYawOffset = this.aimYawOffset;
          const oldPitchOffset = this.aimPitchOffset;

          this.aimYawOffset = oldYawOffset * scaleX;
          this.aimPitchOffset = oldPitchOffset * scaleY;

          // Compensate base center yaw so that camera world yaw (aimCenterYaw + aimYawOffset) remains unchanged
          this.aimCenterYaw = (this.aimCenterYaw + oldYawOffset) - this.aimYawOffset;
        }
        this.lastEffectiveMaxYaw = effectiveMaxYaw;
        this.lastEffectiveMaxPitch = effectiveMaxPitch;

        // 1. Maintain sliding window of hand coordinates to average out high-frequency noise
        this.aimHandHistory.push({ x: this.handX, y: this.handY });
        if (this.aimHandHistory.length > this.aimHandHistoryMax) {
          this.aimHandHistory.shift();
        }

        // 2. Compute average hand coordinate within the history window
        let sumX = 0, sumY = 0;
        for (let i = 0; i < this.aimHandHistory.length; i++) {
          sumX += this.aimHandHistory[i].x;
          sumY += this.aimHandHistory[i].y;
        }
        const avgHandX = sumX / this.aimHandHistory.length;
        const avgHandY = sumY / this.aimHandHistory.length;

        // 3. Map averaged hand position to absolute offset angle relative to center
        const normX = (avgHandX - window.innerWidth / 2) / (window.innerWidth / 2);
        const normY = (avgHandY - window.innerHeight / 2) / (window.innerHeight / 2);

        const targetYawOffset = -normX * effectiveMaxYaw * (Math.PI / 180);
        const targetPitchOffset = -normY * effectiveMaxPitch * (Math.PI / 180); // inverted

        // Clamp strictly to the angular boundary
        const clampedYaw = Math.max(-effectiveMaxYaw * Math.PI / 180,
          Math.min(effectiveMaxYaw * Math.PI / 180, targetYawOffset));
        const clampedPitch = Math.max(-effectiveMaxPitch * Math.PI / 180,
          Math.min(effectiveMaxPitch * Math.PI / 180, targetPitchOffset));

        // 4. Smooth follow interpolation using a constant moderate speed (k = 8.0) to filter lag-free jitters
        const followSpeed = 8.0; // Increased from 5.0 to 8.0 to reduce follow delay
        this.aimYawOffset += (clampedYaw - this.aimYawOffset) * followSpeed * deltaTime;
        this.aimPitchOffset += (clampedPitch - this.aimPitchOffset) * followSpeed * deltaTime;
      }
    } else {
      if (!this.isUltCharging) {
        // Smoothly restore offsets to 0 when exiting scope
        const restoreSpeed = 4.0; // Reduced from 10.0 to 4.0 to slow down pull-back speed
        this.aimYawOffset += (0 - this.aimYawOffset) * restoreSpeed * deltaTime;
        this.aimPitchOffset += (0 - this.aimPitchOffset) * restoreSpeed * deltaTime;

        // Smoothly return base yaw to the initial entry direction if we have a pending return
        if (this.aimStartYaw !== 0) {
          this.yaw += (this.aimStartYaw - this.yaw) * restoreSpeed * deltaTime;
          if (Math.abs(this.yaw - this.aimStartYaw) < 0.001) {
            this.yaw = this.aimStartYaw;
            this.aimStartYaw = 0; // Completed return
          }
        }
      }
    }

    this.syncCamera(deltaTime);

    // Automatic weapon continuous firing tick
    if (this.isAimFiring && this.equippedWeapon && this.equippedWeapon.isAutomatic) {
      this.equippedWeapon.onAction('fire', this.getContext());
    }

    // 2. Weapon timing ticks delegation
    if (this.equippedWeapon) {
      this.equippedWeapon.update(deltaTime);
    }
  }

  syncCamera(deltaTime) {
    if (this.camera) {
      this.camera.position.copy(this.position);
      // While scoped: pivot from the locked center yaw + relative offset
      // While unscoped: plain yaw (aimCenterYaw=0, aimYawOffset lerps to 0)
      const finalYaw = this.isZoomed
        ? this.aimCenterYaw + this.aimYawOffset
        : this.yaw + this.aimYawOffset;
      this.camera.rotation.set(this.aimPitchOffset, finalYaw, 0, 'YXZ');

      // Smooth camera FOV transition (lerp)
      if (deltaTime) {
        const fovLerpSpeed = 10.0;
        this.currentFov += (this.targetFov - this.currentFov) * fovLerpSpeed * deltaTime;
        if (Math.abs(this.currentFov - this.targetFov) < 0.01) {
          this.currentFov = this.targetFov;
        }
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  reset() {
    this.position.set(0, 1.6, 30);
    this.yaw = 0;
    this.currentSpeed = 0;
    this.moveX = 0;
    this.moveY = 0;

    const weaponKey = localStorage.getItem('gesture_selected_weapon') || 'pistol';
    this.equipWeapon(weaponKey);

    if (this.equippedWeapon) {
      this.equippedWeapon.isReloading = false;
      this.equippedWeapon.reloadTimer = 0;
      this.equippedWeapon.coreEnergy = 0;
      for (const k in this.equippedWeapon.cooldowns) {
        this.equippedWeapon.cooldowns[k] = 0;
      }
    }
    this.syncCamera();
  }
}
