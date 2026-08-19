import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class BloodMagicWeapon extends BaseWeapon {
  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const { startPoint, direction } = context;
    if (context.actionHelper) {
      const nearest = context.actionHelper.findNearestEnemy(startPoint);
      context.actionHelper.spawnHoming(
        startPoint,
        actionConfig.speed,
        actionConfig.damage,
        nearest,
        3.0,
        actionConfig.color,
        actionConfig.size
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
        4.0,
        actionConfig.damage,
        0.35,
        10.0,
        0.0,
        0.1,
        0xff002b
      );
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
