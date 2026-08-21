import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class SniperWeapon extends BaseWeapon {
  constructor(id, config, app, playerController) {
    super(id, config, app, playerController);
    this.isUltActive = false;
    this.ultTimer = 0;
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
      // Scoping reload guard: do NOT auto-reload if player is zoomed in aiming mode
      if (!this.playerController || !this.playerController.isZoomed) {
        this.reload(context);
      } else {
        console.log(`[SniperWeapon] Last bullet fired while zoomed. Postponing auto-reload for passive kill-refund check.`);
      }
    }

    return true;
  }

  onEnemyKilled() {
    // Passive: Under zoom/aiming mode, each time an enemy is killed, refund 1 bullet (up to maxBullets)
    if (this.playerController && this.playerController.isZoomed) {
      this.bullets = Math.min(this.maxBullets, this.bullets + 1);
      console.log(`[SniperWeapon] Passive core triggered (Infinite Refill): +1 bullet. Ammo: ${this.bullets}/${this.maxBullets}`);
    }
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

        const minZoom = this.config.hiveActions.aim.minZoom || 2.0;
        const maxZoom = this.config.hiveActions.aim.maxZoom || 6.0;
        const currentZoom = minZoom + (maxZoom - minZoom) * zoomRatio;
        this.playerController.targetFov = 75 / currentZoom;
      } else {
        this.currentZoomTier = 0; // Reset
        this.playerController.targetFov = 75;
      }
    }
    return true;
  }

  update(deltaTime) {
    super.update(deltaTime);

    if (this.isUltActive) {
      this.ultTimer -= deltaTime;
      if (this.ultTimer <= 0) {
        this.isUltActive = false;
        console.log(`[SniperWeapon] 時空暫停力場已釋放。`);
      }
    }
  }

  fireSkill(context) {
    const actionConfig = this.config.hiveActions.skill;
    const { startPoint, direction } = context;

    if (context.actionHelper && actionConfig.projectiles) {
      const trapConfig = actionConfig.projectiles[0];

      // 1. Search for targeted landing position on ground
      const targetingConfig = trapConfig.targeting || { fovAngle: 30.0, minDistance: 10.0, maxDistance: 50.0 };
      const targetEnemy = context.actionHelper.findNearestEnemy(startPoint, direction, targetingConfig);

      const targetLoc = new THREE.Vector3();
      if (targetEnemy) {
        targetLoc.copy(targetEnemy.mesh.position).setY(0);
      } else {
        const horizontalDir = direction.clone().setY(0).normalize();
        targetLoc.copy(startPoint).addScaledVector(horizontalDir, 30.0).setY(0);
      }

      // 2. Calculate flight duration
      const distance = startPoint.distanceTo(targetLoc);
      const speed = 25.0; // horizontal speed
      const flyDurationMs = (distance / speed) * 1000;

      // 3. Spawn thrown trap (Projectile 0)
      context.actionHelper.spawn({
        ...trapConfig,
        position: startPoint.clone(),
        targetPoint: targetLoc.clone(),
        duration: flyDurationMs,
        motion: {
          ...trapConfig.motion,
          targetPoint: targetLoc.clone(),
          duration: flyDurationMs
        }
      });

      // 4. Spawn delayed flat rectangular ground spikes (Projectile 1)
      const spikesConfig = actionConfig.projectiles[1];
      const horizontalDir = direction.clone().setY(0).normalize();
      context.actionHelper.spawn({
        ...spikesConfig,
        position: targetLoc.clone(),
        direction: horizontalDir.clone(),
        motion: {
          ...spikesConfig.motion,
          direction: horizontalDir.clone()
        },
        delay: flyDurationMs
      });
    }

    return true;
  }

  fireUltimate(context) {
    const actionConfig = this.config.hiveActions.ult;
    this.isUltActive = true;
    this.ultTimer = (actionConfig.duration || 5000) / 1000;

    if (context.actionHelper && actionConfig.projectiles) {
      const fieldConfig = actionConfig.projectiles[0];
      const startPoint = context.camera ? context.camera.position.clone() : new THREE.Vector3(0, 1.6, 30);
      
      // Spawn expanding time-dilation dome centered at player's location
      context.actionHelper.spawn({
        ...fieldConfig,
        position: startPoint.clone()
      });
    }

    console.log(`[SniperWeapon] 時空暫停力場 (ZAWARUDO) 啟動！持續 ${this.ultTimer}s.`);
    return true;
  }
}
