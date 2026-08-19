import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class SniperWeapon extends BaseWeapon {
  constructor(id, config, app, playerController) {
    super(id, config, app, playerController);
    this.maxBullets = 10;
    this.bullets = 10;
  }

  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const { startPoint, direction } = context;

    if (this.bullets <= 0) {
      this.reload(context);
      return false;
    }

    if (context.actionHelper) {
      context.actionHelper.spawnLinear(
        startPoint,
        direction,
        actionConfig.speed,
        actionConfig.damage,
        3.0,
        actionConfig.color,
        actionConfig.size,
        'cylinder' // Bullet shape is cylinder
      );
    }

    this.bullets--;
    if (this.bullets <= 0) {
      this.reload(context);
    }

    return true;
  }

  reload(context) {
    if (this.isReloading) return false;
    const actionConfig = this.config.hiveActions.reload;
    this.isReloading = true;
    this.reloadTimer = actionConfig.duration / 1000;
    console.log(`[SniperWeapon] Heavy reload initiated: ${this.reloadTimer}s.`);
    return true;
  }

  onReloadComplete() {
    this.bullets = this.maxBullets;
  }

  updateCoreEnergy(deltaTime) {}

  getCoreEnergyStyle() {
    return {
      active: true,
      label: '彈藥',
      color: '#ffd700',
      value: (this.bullets / this.maxBullets) * 100,
      text: `${this.bullets}/${this.maxBullets}`
    };
  }

  syncAim(context) {
    if (this.playerController) {
      if (context.active) {
        const minZoom = this.config.hiveActions.aim.minZoom || 2.0;
        const maxZoom = this.config.hiveActions.aim.maxZoom || 6.0;
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
}
