import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class CrimsonClanWeapon extends BaseWeapon {
  firePrimary(context) {
    // Projectiles removed as requested
    return true;
  }

  slash(context) {
    // Projectiles removed as requested
    return true;
  }

  fireSkill(context) {
    // Projectiles removed as requested
    return true;
  }

  fireUltimate(context) {
    // Projectiles removed as requested
    return true;
  }
}
