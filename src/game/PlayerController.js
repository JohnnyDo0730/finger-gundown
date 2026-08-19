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
    this.isZoomed = false;
    this.currentFov = 75;
    this.targetFov = 75;

    // Semi-automatic trigger safety locking
    this.isShootPressed = false;
    this.isSkillPressed = false;

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
    const startPoint = this.position.clone().add(new THREE.Vector3(0, -0.4, -0.5));
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

  init() {
    console.log('[PlayerController] Initializing movement and triggers...');
    
    // Equip selected weapon
    const weaponKey = localStorage.getItem('gesture_selected_weapon') || 'pistol';
    this.equipWeapon(weaponKey);

    // 1. Listen to GestureEngine events
    if (this.app.gestureEngine) {
      this.app.gestureEngine.addEventListener('ON_MOVE', (data) => {
        this.moveX = data.moveX || 0;
        this.moveY = data.moveY || 0;
      });

      this.app.gestureEngine.addEventListener('ON_AIM', (data) => {
        if (data.active) {
          // Map normalized gesture tracking points to screen coordinates
          this.screenX = data.wristX * window.innerWidth;
          this.screenY = data.wristY * window.innerHeight;
        }
      });

      this.app.gestureEngine.addEventListener('ON_SYNC_AIM', (data) => {
        this.isZoomed = data.active;
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('aim', { zoom: data.zoom, active: data.active });
        } else {
          this.targetFov = 75;
        }
      });

      this.app.gestureEngine.addEventListener('ON_FIRE', (data) => {
        if (data.active) {
          if (!this.isShootPressed) {
            if (this.equippedWeapon) {
              this.equippedWeapon.onAction('fire', this.getContext());
            }
            this.isShootPressed = true;
          }
        } else {
          this.isShootPressed = false;
        }
      });

      this.app.gestureEngine.addEventListener('ON_RELOAD_STATE', (data) => {
        if (data.active) {
          if (this.equippedWeapon) {
            this.equippedWeapon.onAction('reload', this.getContext());
          }
        }
      });

      this.app.gestureEngine.addEventListener('ON_SLASH', () => {
        if (this.equippedWeapon) {
          this.equippedWeapon.onAction('slash', this.getContext());
        }
      });

      this.app.gestureEngine.addEventListener('ON_SKILL_STATE', (data) => {
        if (data.active) {
          if (!this.isSkillPressed) {
            if (this.equippedWeapon) {
              this.equippedWeapon.onAction('skill', this.getContext());
            }
            this.isSkillPressed = true;
          }
        } else {
          this.isSkillPressed = false;
        }
      });

      this.app.gestureEngine.addEventListener('ON_SYNC_ULT', (data) => {
        if (data.active) {
          if (this.equippedWeapon) {
            this.equippedWeapon.onAction('ult', this.getContext());
          }
        }
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

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    direction.multiplyScalar(this.currentSpeed * deltaTime);
    this.position.add(direction);

    // Arena boundaries clamp
    this.position.x = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.x));
    this.position.z = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.z));

    this.syncCamera(deltaTime);

    // 2. Weapon timing ticks delegation
    if (this.equippedWeapon) {
      this.equippedWeapon.update(deltaTime);
    }
  }

  syncCamera(deltaTime) {
    if (this.camera) {
      this.camera.position.copy(this.position);
      this.camera.rotation.set(0, this.yaw, 0, 'YXZ');

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
