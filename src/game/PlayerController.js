const THREE = window.THREE;

/**
 * PlayerController - Manages 3D player positioning, rotation (Yaw),
 * gesture input mapping from left hand, movement physics (acceleration/deceleration),
 * and spatial arena boundaries.
 */
export class PlayerController {
  /**
   * @param {THREE.Camera} camera - The Three.js camera associated with the player view
   * @param {App} app - Reference to the core App instance
   */
  constructor(camera, app) {
    this.camera = camera;
    this.app = app;

    // Spatial parameters (starting at origin at eye level)
    this.position = new THREE.Vector3(0, 1.6, 30); // Starting back slightly to view the center
    this.yaw = 0; // Rotation around Y-axis (in radians)

    // Physics parameters for responsive movement feel
    this.currentSpeed = 0;
    this.maxSpeed = 10.0; // Units per second
    this.acceleration = 2.5; // Blending factor for speeding up
    this.deceleration = 4.0; // Blending factor for stopping
    this.rotationSpeed = 1.6; // Radians per second

    // Spatial boundary limits (larger arena to allow space for combat and kiting)
    this.boundaryMin = -100;
    this.boundaryMax = 100;

    // Left hand joystick parameters
    this.moveX = 0;
    this.moveY = 0;

    this.init();
  }

  /**
   * Register listeners to bind movement gestures.
   */
  init() {
    console.log('[PlayerController] Initializing movement controls...');

    if (this.app.gestureEngine) {
      // Listen to the left hand movement vector
      this.app.gestureEngine.addEventListener('ON_MOVE', (data) => {
        this.moveX = data.moveX || 0;
        this.moveY = data.moveY || 0;
      });
    }

    // Synchronize initial camera state
    this.syncCamera();
  }

  /**
   * Update position and rotation based on gesture inputs and deltaTime.
   * @param {number} deltaTime - Duration of current frame in seconds.
   */
  update(deltaTime) {
    // 1. Calculate target translation velocity
    // moveY ranges from -1.0 (tilt forward -> move forward) to 1.0 (fist clench -> move backward)
    const targetSpeed = -this.moveY * this.maxSpeed;

    // Apply acceleration/deceleration physics feel
    if (Math.abs(targetSpeed) > Math.abs(this.currentSpeed)) {
      // Speeding up
      this.currentSpeed += (targetSpeed - this.currentSpeed) * this.acceleration * deltaTime;
    } else {
      // Slowing down
      this.currentSpeed += (targetSpeed - this.currentSpeed) * this.deceleration * deltaTime;
    }

    // Clamp speed limits
    this.currentSpeed = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.currentSpeed));

    // 2. Calculate angular steering velocity (Yaw)
    // moveX ranges from -1.0 (tilt left) to 1.0 (tilt right)
    this.yaw += this.moveX * this.rotationSpeed * deltaTime;

    // 3. Compute movement along forward heading vector
    const direction = new THREE.Vector3(0, 0, -1); // Default Three.js camera faces -Z
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    direction.multiplyScalar(this.currentSpeed * deltaTime);

    // Apply movement
    this.position.add(direction);

    // 4. Enforce 3D boundary limits
    this.position.x = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.x));
    this.position.z = Math.max(this.boundaryMin, Math.min(this.boundaryMax, this.position.z));

    // 5. Synchronize values with camera properties
    this.syncCamera();
  }

  /**
   * Apply position and yaw angle directly to Three.js camera.
   */
  syncCamera() {
    if (this.camera) {
      this.camera.position.copy(this.position);
      
      // Euler order YXZ works well for FPS controls
      this.camera.rotation.set(0, this.yaw, 0, 'YXZ');
    }
  }

  /**
   * Reset player state to start positions.
   */
  reset() {
    this.position.set(0, 1.6, 30);
    this.yaw = 0;
    this.currentSpeed = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.syncCamera();
  }
}
