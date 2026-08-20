import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class RifleWeapon extends BaseWeapon {
  constructor(id, config, app, playerController) {
    super(id, config, app, playerController);
    this.isAutomatic = true;
    this.maxBullets = 30;
    this.bullets = 30;
  }

  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const { startPoint, direction } = context;

    if (this.bullets <= 0) {
      this.reload(context);
      return false;
    }

    if (context.actionHelper && actionConfig.projectiles) {
      actionConfig.projectiles.forEach(pConfig => {
        const projData = {
          ...pConfig,
          position: startPoint,
          direction, // Pass direction at root
          motion: { ...pConfig.motion, direction }
        };
        context.actionHelper.spawn(projData);
      });
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
    console.log(`[RifleWeapon] Fast reload initiated: ${this.reloadTimer}s.`);
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
      color: '#00f2fe',
      value: (this.bullets / this.maxBullets) * 100,
      text: `${this.bullets}/${this.maxBullets}`
    };
  }

  syncAim(context) {
    if (this.playerController) {
      if (context.active) {
        const rawZoom = context.zoom !== undefined ? context.zoom : 0.0;
        
        // Hysteresis threshold check to prevent zoom level oscillations from hand jitter
        if (this.currentZoomTier === 0) {
          if (rawZoom > 0.4) this.currentZoomTier = 1;
        } else if (this.currentZoomTier === 1) {
          if (rawZoom < 0.25) this.currentZoomTier = 0;
          else if (rawZoom > 0.75) this.currentZoomTier = 2;
        } else if (this.currentZoomTier === 2) {
          if (rawZoom < 0.6) this.currentZoomTier = 1;
        }

        // Map discrete tiers to zoom values (Tier 0 = 0% of max zoom, Tier 1 = 50%, Tier 2 = 100%)
        let zoomRatio = 0.0;
        if (this.currentZoomTier === 1) zoomRatio = 0.5;
        else if (this.currentZoomTier === 2) zoomRatio = 1.0;

        const minZoom = this.config.hiveActions.aim.minZoom || 1.0;
        const maxZoom = this.config.hiveActions.aim.maxZoom || 4.0;
        const currentZoom = minZoom + (maxZoom - minZoom) * zoomRatio;
        this.playerController.targetFov = 75 / currentZoom;
      } else {
        this.currentZoomTier = 0; // Reset
        this.playerController.targetFov = 75;
      }
    }
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
