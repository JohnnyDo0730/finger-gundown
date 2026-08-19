import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class PistolWeapon extends BaseWeapon {
  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    
    // Heat overload check
    if (this.coreEnergy >= 100) {
      console.log(`[PistolWeapon] Overheated! Forcing core reload.`);
      this.isReloading = true;
      const overheatPenaltyMultiplier = this.config.passive.reloadOverheatTime || 4.0;
      this.reloadTimer = overheatPenaltyMultiplier;
      return false;
    }

    const { startPoint, direction } = context;
    if (context.actionHelper) {
      context.actionHelper.spawnLinear(
        startPoint,
        direction,
        actionConfig.speed,
        actionConfig.damage,
        3.0, // projectile lifespan
        actionConfig.color,
        actionConfig.size
      );
    }

    // Heat build up
    this.coreEnergy = Math.min(100, this.coreEnergy + (actionConfig.heatPerShot || 20.0));
    
    // Automatically trigger reload cooldown if it just reached 100
    if (this.coreEnergy >= 100) {
      this.isReloading = true;
      const overheatPenaltyMultiplier = this.config.passive.reloadOverheatTime || 4.0;
      this.reloadTimer = overheatPenaltyMultiplier;
      console.log(`[PistolWeapon] Core melted! Forced cooling initiated: ${this.reloadTimer}s.`);
    }

    return true;
  }

  reload(context) {
    const actionConfig = this.config.hiveActions.reload;
    this.isReloading = true;
    this.reloadTimer = actionConfig.duration / 1000;
    console.log(`[PistolWeapon] Core venting initiated: ${this.reloadTimer}s.`);
    return true;
  }

  syncAim(context) {
    if (this.playerController) {
      if (context.active) {
        const minZoom = this.config.hiveActions.aim.minZoom || 1.0;
        const maxZoom = this.config.hiveActions.aim.maxZoom || 1.2;
        const currentZoom = minZoom + (maxZoom - minZoom) * (context.zoom !== undefined ? context.zoom : 0.0);
        this.playerController.targetFov = 75 / currentZoom;
      } else {
        this.playerController.targetFov = 75;
      }
    }
    return true;
  }

  fireSkill(context) {
    const actionConfig = this.config.hiveActions.skill;
    const { targetPoint } = context;
    if (context.actionHelper) {
      context.actionHelper.spawnStationary(
        targetPoint,
        actionConfig.radius,
        actionConfig.damage,
        actionConfig.duration / 1000,
        actionConfig.rotateSpeed,
        actionConfig.pulseSpeed,
        actionConfig.tickInterval / 1000,
        actionConfig.color
      );
    }
    return true;
  }

  fireUltimate(context) {
    const actionConfig = this.config.hiveActions.ult;
    const { targetPoint } = context;
    if (context.actionHelper) {
      context.actionHelper.spawnStationary(
        targetPoint,
        actionConfig.radius,
        actionConfig.damage,
        actionConfig.duration / 1000,
        actionConfig.rotateSpeed,
        actionConfig.pulseSpeed,
        actionConfig.tickInterval / 1000,
        actionConfig.color
      );
    }
    return true;
  }

  getCoreEnergyStyle() {
    return {
      active: true,
      label: '核心溫度',
      color: this.coreEnergy >= 80 ? '#dc3545' : '#00f2fe',
      value: this.coreEnergy
    };
  }
}
