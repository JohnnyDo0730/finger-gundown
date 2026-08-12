/**
 * BaseWeapon - Abstract class for weapon implementations.
 * Extended by specific weapon classes (e.g. FirearmWeapon, SwordWeapon).
 */
export class BaseWeapon {
  /**
   * @param {string} name - Name of the weapon
   * @param {object} config - Configuration options (damage, cooldown, range, etc.)
   */
  constructor(name, config = {}) {
    if (new.target === BaseWeapon) {
      throw new TypeError("Cannot construct BaseWeapon instances directly. Please subclass instead.");
    }
    
    this.name = name;
    this.config = Object.assign({
      damage: 10,
      cooldown: 500, // in ms
      range: 50
    }, config);

    this.lastTriggeredTime = 0;
    this.isReady = true;
    this.model = null; // Reference to the 3D model/mesh (Three.js)
  }

  /**
   * Triggers the weapon's primary action.
   * Must be overridden in child classes.
   * 
   * @param {object} gestureResult - The recognized gesture parameters.
   * @param {object} context - Context containing player info, scene, or raycast target.
   */
  triggerAction(gestureResult, context) {
    throw new Error(`Method 'triggerAction()' must be implemented by subclass: ${this.constructor.name}`);
  }

  /**
   * Equip weapon. Handles loading and attaching 3D assets to player hand group.
   * @param {THREE.Group|THREE.Object3D} handGroup - The hand controller node in the 3D scene.
   */
  equip(handGroup) {
    console.log(`[BaseWeapon] Equipping ${this.name}...`);
    // Load mesh, attach to parent group, etc.
  }

  /**
   * Unequip weapon. Cleans up loaded assets and physics proxies.
   */
  unequip() {
    console.log(`[BaseWeapon] Unequipping ${this.name}...`);
    if (this.model && this.model.parent) {
      this.model.parent.remove(this.model);
    }
  }

  /**
   * Update loops for cooldown timers, projectile paths, and animations.
   * @param {number} timestamp - Total elapsed time.
   * @param {number} deltaTime - Frame duration.
   */
  update(timestamp, deltaTime) {
    if (!this.isReady && (timestamp - this.lastTriggeredTime >= this.config.cooldown)) {
      this.isReady = true;
      console.log(`[BaseWeapon] ${this.name} is ready again.`);
    }
  }
}
