import { BaseWeapon } from './BaseWeapon.js';
const THREE = window.THREE;

export class RifleWeapon extends BaseWeapon {
  constructor(id, config, app, playerController) {
    super(id, config, app, playerController);
    this.isAutomatic = true;
    this.isUltActive = false;
    this.ultTimer = 0;
  }

  firePrimary(context) {
    const actionConfig = this.config.hiveActions.fire;
    const ultConfig = this.config.hiveActions.ult;
    const { startPoint, direction } = context;

    if (!this.isUltActive && this.bullets <= 0) {
      this.reload(context);
      return false;
    }

    if (context.actionHelper) {
      let finalDirection = direction.clone();

      // 1. Smart Target Assist Passive (only active while scoping/zooming)
      if (this.playerController && this.playerController.isZoomed) {
        const assistTarget = context.actionHelper.findNearestEnemy(startPoint, direction, {
          fovAngle: 8.0,
          minDistance: 5.0,
          maxDistance: 80.0
        });
        if (assistTarget) {
          const targetCenter = assistTarget.mesh.position.clone().add(
            new THREE.Vector3(0, assistTarget.height / 2, 0)
          );
          finalDirection.copy(targetCenter.sub(startPoint)).normalize();
        }
      }

      // 2. Select bullet config: silver bullet during ultimate, normal bullet otherwise
      if (this.isUltActive && ultConfig.projectiles) {
        const pConfig = ultConfig.projectiles[0];
        const projData = {
          ...pConfig,
          position: startPoint.clone(),
          direction: finalDirection.clone(),
          motion: { ...pConfig.motion, direction: finalDirection.clone() }
        };
        context.actionHelper.spawn(projData);

        // Override firing cooldown using the value defined in the projectile config (fallback to 50ms)
        const fireCdMs = pConfig.cooldown || 50;
        this.cooldowns['fire'] = fireCdMs / 1000;
      } else if (actionConfig.projectiles) {
        actionConfig.projectiles.forEach(pConfig => {
          const projData = {
            ...pConfig,
            position: startPoint.clone(),
            direction: finalDirection.clone(),
            motion: { ...pConfig.motion, direction: finalDirection.clone() }
          };
          context.actionHelper.spawn(projData);
        });

        // Consume normal ammunition
        this.bullets--;
        if (this.bullets <= 0) {
          this.reload(context);
        }
      }
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



  syncAim(context) {
    if (this.isUltActive) {
      // Keep locked zoom during ultimate
      if (this.playerController) {
        this.playerController.isZoomed = true;
        this.playerController.targetFov = 75 / 1.5;
      }
      return true;
    }

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
    const actionConfig = this.config.hiveActions.skill;
    const { startPoint, direction } = context;

    if (context.actionHelper && actionConfig.projectiles) {
      const bottleConfig = actionConfig.projectiles[0];

      // 1. Search for targeted landing position on ground
      const targetingConfig = bottleConfig.targeting || { fovAngle: 30.0, minDistance: 10.0, maxDistance: 50.0 };
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
      const speed = 25.0; // parabolic horizontal speed
      const flyDurationMs = (distance / speed) * 1000;

      // 3. Spawn thrown bottle (Projectile 0)
      context.actionHelper.spawn({
        ...bottleConfig,
        position: startPoint.clone(),
        targetPoint: targetLoc.clone(),
        duration: flyDurationMs,
        motion: {
          ...bottleConfig.motion,
          targetPoint: targetLoc.clone(),
          duration: flyDurationMs
        }
      });

      // 4. Spawn delayed burning ground area cylinder (Projectile 1)
      const burnConfig = actionConfig.projectiles[1];
      context.actionHelper.spawn({
        ...burnConfig,
        position: targetLoc.clone(),
        delay: flyDurationMs
      });
    }

    return true;
  }

  fireUltimate(context) {
    const actionConfig = this.config.hiveActions.ult;
    this.isUltActive = true;
    this.ultTimer = (actionConfig.animationTime || 8000) / 1000;

    // Force lock zoom mode and FOV
    if (this.playerController) {
      this.playerController.isZoomed = true;
      this.playerController.targetFov = 75 / 1.5; // Locked 1.5x zoom
    }

    console.log(`[RifleWeapon] MG3 Tactical Overload activated for ${this.ultTimer} seconds!`);
    return true;
  }

  update(deltaTime) {
    super.update(deltaTime);

    // Ultimate timer countdown
    if (this.isUltActive) {
      this.ultTimer -= deltaTime;

      // Lock player zoomed state during active ultimate
      if (this.playerController) {
        this.playerController.isZoomed = true;
        this.playerController.targetFov = 75 / 1.5;
      }

      if (this.ultTimer <= 0) {
        this.isUltActive = false;
        
        // Revert zoom lock
        if (this.playerController) {
          this.playerController.isZoomed = false;
          this.playerController.targetFov = 75;
        }
        console.log(`[RifleWeapon] Tactical Overload expired.`);
      }
    }
  }
}
