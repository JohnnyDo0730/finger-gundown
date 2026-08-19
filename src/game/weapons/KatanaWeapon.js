import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class KatanaWeapon extends BaseWeapon {
  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const { startPoint, direction } = context;
    if (context.actionHelper) {
      // Find nearest enemy to track
      const nearest = context.actionHelper.findNearestEnemy(startPoint, direction);
      context.actionHelper.spawnHoming(
        startPoint,
        actionConfig.speed,
        actionConfig.damage,
        nearest,
        3.0, // duration
        actionConfig.color,
        actionConfig.size,
        direction // Pass direction as fallback
      );
    }
    return true;
  }

  slash(context) {
    const actionConfig = this.config.hiveActions.slash;
    const { startPoint, direction } = context;
    if (context.actionHelper) {
      const forward = direction.clone().setY(0).normalize();
      const spawnPos = startPoint.clone().addScaledVector(forward, 4.0).setY(0.2);
      context.actionHelper.spawnStationary(
        spawnPos,
        4.0, // radius
        actionConfig.damage,
        0.35, // duration
        10.0, // rotateSpeed
        0.0, // pulseSpeed
        0.1, // tickInterval
        0xff007f // color
      );
    }
    return true;
  }

  fireSkill(context) {
    const actionConfig = this.config.hiveActions.skill;
    const { startPoint, direction } = context;
    if (context.actionHelper) {
      const forward = direction.clone().setY(0).normalize();
      const spawnPos = startPoint.clone().addScaledVector(forward, 6.0).setY(0.2);
      context.actionHelper.spawnStationary(
        spawnPos,
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
