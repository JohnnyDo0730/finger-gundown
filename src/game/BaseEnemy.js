const THREE = window.THREE;

/**
 * BaseEnemy - Represents a targetable, damageable enemy box/cylinder in the 3D space.
 * Implements IDamageable standards (health tracking, bounding box, hit flashes, and knockbacks).
 */
export class BaseEnemy {
  /**
   * @param {string} id - Unique identifier
   * @param {string} type - Shape type ('box' or 'cylinder')
   * @param {THREE.Vector3} position - Spawning center coordinate
   * @param {THREE.Scene} scene - Reference to active 3D scene
   */
  constructor(id, type, position, scene) {
    this.id = id;
    this.type = type;
    this.scene = scene;

    this.hp = 100;
    this.maxHp = 100;
    this.isAlive = true;

    // Movement & Physics
    this.knockbackVelocity = new THREE.Vector3(0, 0, 0);

    // Timers
    this.hitFlashTimer = 0.0;
    this.deathTimer = 0.0;

    // Mesh & Materials Setup
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    // Create unique materials per instance for dynamic hit color effects
    this.material = new THREE.MeshStandardMaterial({
      color: 0x495057, // Charcoal gray body
      roughness: 0.4,
      metalness: 0.3,
      emissive: 0x000000
    });

    this.enemyMesh = null;
    this.height = 2.0;
    this.width = 1.2;

    this.createShapeMesh();
    this.createHPBar();

    // Add main group to active scene
    this.scene.add(this.mesh);

    // Bounding Box setup for collision tests
    this.boundingBox = new THREE.Box3();
    this.boundingBox.setFromObject(this.enemyMesh);
  }

  /**
   * Build the physical shape mesh (either Box or Cylinder) and add to the group.
   */
  createShapeMesh() {
    let geo;
    if (this.type === 'cylinder') {
      this.height = 3.3;
      this.width = 1.6;
      // Cylinder: Top radius: 0.8, Bottom radius: 0.8, Height: 3.3
      geo = new THREE.CylinderGeometry(0.8, 0.8, this.height, 16);
    } else {
      this.height = 3.0;
      this.width = 1.8;
      // Box: 1.8 x 3.0 x 1.8
      geo = new THREE.BoxGeometry(this.width, this.height, this.width);
    }

    this.enemyMesh = new THREE.Mesh(geo, this.material);
    this.enemyMesh.position.y = this.height / 2; // Bottom rests on ground Y=0
    this.enemyMesh.castShadow = true;
    this.enemyMesh.receiveShadow = true;

    this.mesh.add(this.enemyMesh);
  }

  /**
   * Create a clean 3D vector Plane-based HP bar floating above the enemy's head.
   */
  createHPBar() {
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, this.height + 0.6, 0); // Position slightly above target head

    // 1. HP Background plane (dark semi-transparent gray)
    const bgGeo = new THREE.PlaneGeometry(1.8, 0.16);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x212529,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.hpBarGroup.add(bgMesh);

    // 2. HP Progress plane (mint green, scaled from left)
    const progressGeo = new THREE.PlaneGeometry(1.8, 0.16);
    progressGeo.translate(0.9, 0, 0); // Offset vertices so scale pivot is far-left

    this.progressMat = new THREE.MeshBasicMaterial({
      color: 0x20c997, // Green indicator
      side: THREE.DoubleSide
    });
    this.hpProgressMesh = new THREE.Mesh(progressGeo, this.progressMat);
    this.hpProgressMesh.position.x = -0.9; // Align left edge back to parent center
    this.hpBarGroup.add(this.hpProgressMesh);

    this.mesh.add(this.hpBarGroup);
  }

  /**
   * Unified damage receiver method.
   * @param {number} amount - Damage points
   * @param {THREE.Vector3} [knockbackVector] - Knockback velocity impulse to apply
   */
  takeDamage(amount, knockbackVector) {
    if (!this.isAlive) return;

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.1; // Flash red for 0.1 seconds

    // Add knockback velocity impulse
    if (knockbackVector) {
      this.knockbackVelocity.add(knockbackVector);
    }

    // Death validation
    if (this.hp <= 0) {
      this.isAlive = false;
      this.deathTimer = 0.3; // Starts a 0.3s shrink-down animation
    }
  }

  /**
   * Update loops for physics, animations, and bounds.
   * @param {number} deltaTime - Time step (seconds)
   * @param {THREE.Camera} camera - Camera reference to align billboarding HP bars
   */
  update(deltaTime, camera) {
    // 1. Update visual hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaTime;
      this.material.color.setHex(0xff3333); // Vivid red hit color
      this.material.emissive.setHex(0x550000);
    } else {
      this.material.color.setHex(0x495057); // Restore dark gray body
      this.material.emissive.setHex(0x000000);
    }

    // 2. Active lifecycle vs death animation
    if (this.isAlive) {
      // Apply smooth knockback sliding movement with exponential damping
      if (this.knockbackVelocity.lengthSq() > 0.001) {
        this.mesh.position.addScaledVector(this.knockbackVelocity, deltaTime);
        this.knockbackVelocity.multiplyScalar(Math.exp(-7.0 * deltaTime)); // Quick velocity decay
      } else {
        this.knockbackVelocity.set(0, 0, 0);
      }

      // Arena boundary clamping (floor size is 200x200, boundaries at [-95, 95])
      this.mesh.position.x = Math.max(-95, Math.min(95, this.mesh.position.x));
      this.mesh.position.z = Math.max(-95, Math.min(95, this.mesh.position.z));

      // Dynamic HP bar scale
      const hpRatio = this.hp / this.maxHp;
      this.hpProgressMesh.scale.x = hpRatio;

      // Color-shift HP bar from Green (healthy) to Red (low health)
      if (hpRatio > 0.5) {
        this.progressMat.color.setHex(0x20c997); // Mint green
      } else if (hpRatio > 0.25) {
        this.progressMat.color.setHex(0xffc107); // Amber warning
      } else {
        this.progressMat.color.setHex(0xdc3545); // Danger red
      }

      // Rotate HP bar billboard to face active camera
      if (camera && this.hpBarGroup) {
        this.hpBarGroup.lookAt(camera.position);
      }
    } else {
      // Run death shrink animation
      if (this.deathTimer > 0) {
        this.deathTimer -= deltaTime;
        const progress = Math.max(0, this.deathTimer / 0.3);
        this.mesh.scale.set(progress, progress, progress);
      }
    }

    // 3. Keep collision bounding box synchronized with mesh translation
    if (this.enemyMesh) {
      this.boundingBox.setFromObject(this.enemyMesh);
    }
  }

  /**
   * Memory clean up and disposal.
   */
  destroy() {
    console.log(`[BaseEnemy] Disposing enemy ${this.id}`);
    this.scene.remove(this.mesh);

    // Dispose child meshes geometries and materials
    this.mesh.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}
