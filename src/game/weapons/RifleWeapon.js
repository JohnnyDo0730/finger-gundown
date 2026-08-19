import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class RifleWeapon extends BaseWeapon {
  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const { startPoint, direction } = context;
    if (context.actionHelper) {
      context.actionHelper.spawnLinear(
        startPoint,
        direction,
        actionConfig.speed,
        actionConfig.damage,
        3.0,
        actionConfig.color,
        actionConfig.size
      );
    }
    return true;
  }

  reload(context) {
    const actionConfig = this.config.hiveActions.reload;
    this.isReloading = true;
    this.reloadTimer = actionConfig.duration / 1000;
    console.log(`[RifleWeapon] Fast reload initiated: ${this.reloadTimer}s.`);
    return true;
  }

  syncAim(context) {
    if (this.playerController) {
      if (context.active) {
        const minZoom = this.config.hiveActions.aim.minZoom || 1.0;
        const maxZoom = this.config.hiveActions.aim.maxZoom || 4.0;
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
