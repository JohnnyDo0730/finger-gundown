/**
 * BaseWeapon - Abstract base class for all weapons and skills.
 */
export class BaseWeapon {
  /**
   * @param {string} id - Weapon ID matching WeaponConfig keys
   * @param {object} config - WeaponConfig entry
   * @param {App} app - Core App orchestrator
   * @param {PlayerController} playerController - Player Controller context
   */
  constructor(id, config = {}, app = null, playerController = null) {
    if (new.target === BaseWeapon) {
      throw new TypeError("Cannot construct BaseWeapon instances directly. Please subclass instead.");
    }
    
    this.id = id;
    this.config = config;
    this.app = app;
    this.playerController = playerController;

    // Cooldown timers in seconds
    this.cooldowns = {
      fire: 0,
      reload: 0,
      slash: 0,
      skill: 0,
      ult: 0
    };

    this.coreEnergy = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.model = null; // Three.js mesh/group
    this.currentZoomTier = 0; // 0, 1, or 2 for hysteresis zoom steps

    // Initialize bullets from config-driven passive parameters
    this.maxBullets = this.config.passive?.maxBullets || 100;
    this.bullets = this.maxBullets;
  }

  /**
   * Universal action gatekeeper. Validates active state, reload status, and cooldown.
   */
  onAction(actionKey, context) {
    const actionConfig = this.config.hiveActions?.[actionKey];
    if (!actionConfig || !actionConfig.active) {
      console.warn(`[BaseWeapon] Action ${actionKey} is disabled or not configured for ${this.id}`);
      return;
    }

    // Reload checks
    if (this.isReloading && actionKey !== 'aim') {
      console.log(`[BaseWeapon] ${this.id} is currently reloading. Suppressing action ${actionKey}.`);
      return;
    }

    // Cooldown check
    if (this.cooldowns[actionKey] > 0) {
      return;
    }

    // Delegate to subclass implementations
    let success = false;
    switch (actionKey) {
      case 'fire':
        success = this.firePrimary(context);
        break;
      case 'reload':
        success = this.reload(context);
        break;
      case 'aim':
        success = this.syncAim(context);
        break;
      case 'slash':
        success = this.slash(context);
        break;
      case 'skill':
        success = this.fireSkill(context);
        break;
      case 'ult':
        success = this.fireUltimate(context);
        break;
    }

    if (success) {
      // Set cooldown via virtual method - subclasses can override for conditional logic
      this.cooldowns[actionKey] = this.getCooldownMs(actionKey) / 1000;
    }

    return success;
  }

  /**
   * Returns the effective cooldown (ms) for a given action key.
   * Subclasses can override this to implement per-action conditional cooldown changes.
   */
  getCooldownMs(actionKey) {
    return this.config.hiveActions?.[actionKey]?.cooldown || 0;
  }

  // Subclass hooks - return true if action successfully executes (applies cooldown)
  firePrimary(context) { return false; }
  reload(context) { return false; }
  syncAim(context) { return false; }
  slash(context) { return false; }
  fireSkill(context) { return false; }
  fireUltimate(context) { return false; }

  equip(handGroup) {
    console.log(`[BaseWeapon] Equipping ${this.id}...`);
  }

  unequip() {
    console.log(`[BaseWeapon] Unequipping ${this.id}...`);
    if (this.model && this.model.parent) {
      this.model.parent.remove(this.model);
    }
  }

  update(deltaTime) {
    // 1. Decrement cooldowns
    for (const key in this.cooldowns) {
      if (this.cooldowns[key] > 0) {
        this.cooldowns[key] = Math.max(0, this.cooldowns[key] - deltaTime);
      }
    }

    // 2. Process reload countdown
    if (this.isReloading) {
      this.reloadTimer -= deltaTime;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.coreEnergy = 0;
        this.onReloadComplete();
        console.log(`[BaseWeapon] Reload complete for ${this.id}`);
      }
    } else {
      this.updateCoreEnergy(deltaTime);
    }
  }

  onReloadComplete() {}

  updateCoreEnergy(deltaTime) {
    if (this.coreEnergy > 0) {
      const decay = this.config.passive?.heatDecayRate || 15.0;
      this.coreEnergy = Math.max(0, this.coreEnergy - decay * deltaTime);
    }
  }

  getSpecialHUDStats() {
    return null;
  }

  getCoreEnergyStyle() {
    const passive = this.config.passive || {};
    const label = passive.coreLabel || '核心能量';
    const suffix = passive.coreSuffix || '';
    
    if (suffix === '%') {
      return {
        active: true,
        label: label,
        color: this.coreEnergy >= 80 ? '#dc3545' : '#00f2fe',
        value: this.coreEnergy,
        text: `${Math.round(this.coreEnergy)}${suffix}`
      };
    } else {
      return {
        active: true,
        label: label,
        color: this.id === 'sniper' ? '#ffd700' : '#00f2fe',
        value: (this.bullets / this.maxBullets) * 100,
        text: `${this.bullets}/${this.maxBullets}`
      };
    }
  }

  getHUDData() {
    return {
      id: this.id,
      name: this.config.name || this.id,
      category: this.config.category || 'ranged',
      coreEnergy: this.coreEnergy,
      coreEnergyStyle: this.getCoreEnergyStyle(),
      isReloading: this.isReloading,
      reloadTimer: this.reloadTimer,
      reloadDuration: (this.config.hiveActions?.reload?.duration / 1000) || 2.0,
      cooldowns: { ...this.cooldowns },
      specialStats: this.getSpecialHUDStats()
    };
  }
}

