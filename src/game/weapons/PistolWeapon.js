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
        const maxZoom = this.config.hiveActions.aim.maxZoom || 1.2;
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
      // 1. Search for a target enemy within angle 30, distance 20-60
      const targetEnemy = context.actionHelper.findNearestEnemy(startPoint, direction, {
        fovAngle: 30.0,
        minDistance: 20.0,
        maxDistance: 60.0
      });

      // 2. Select target location on the ground (Y = 0)
      const targetLoc = new THREE.Vector3();
      if (targetEnemy) {
        targetLoc.copy(targetEnemy.mesh.position).setY(0);
      } else {
        const horizontalDir = direction.clone().setY(0).normalize();
        targetLoc.copy(startPoint).addScaledVector(horizontalDir, 30.0).setY(0);
      }

      // 3. Calculate fly duration based on travel distance
      const distance = startPoint.distanceTo(targetLoc);
      const speed = 25.0; // units per second
      const flyDurationMs = (distance / speed) * 1000;

      // 4. Spawn Grenade (Projectile 0)
      const grenadeConfig = actionConfig.projectiles[0];
      context.actionHelper.spawn({
        ...grenadeConfig,
        position: startPoint.clone(),
        targetPoint: targetLoc.clone(),
        duration: flyDurationMs,
        motion: {
          ...grenadeConfig.motion,
          targetPoint: targetLoc.clone(),
          duration: flyDurationMs
        }
      });

      // 5. Spawn Explosion Dome (Projectile 1)
      const explosionConfig = actionConfig.projectiles[1];
      context.actionHelper.spawn({
        ...explosionConfig,
        position: targetLoc.clone(),
        delay: flyDurationMs
      });
    }

    return true;
  }

  fireUltimate(context) {
    const actionConfig = this.config.hiveActions.ult;

    if (context.actionHelper && actionConfig.projectiles && context.camera) {
      // 1. Calculate direction and startPoint directly from camera quaternion (completely decoupled from ON_AIM crosshairs)
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(context.camera.quaternion).normalize();

      // Lower the spawn position height by using a larger negative Y offset (-0.8 compared to standard gun fire Y offset -0.4)
      const startPoint = context.camera.position.clone().add(
        new THREE.Vector3(0, -1.2, -0.5).applyQuaternion(context.camera.quaternion)
      );

      // Position Energy Plate (circular disc) 2.0 units in front of player
      const platePos = startPoint.clone().addScaledVector(direction, 2.0);

      // Spawn Energy Plate (Projectile 0)
      const plateConfig = actionConfig.projectiles[0];
      context.actionHelper.spawn({
        ...plateConfig,
        position: platePos.clone(),
        direction: direction.clone(),
        motion: {
          ...plateConfig.motion,
          direction: direction.clone()
        }
      });

      // 2. Spawn Beam Blast (Projectile 1) starting at the plate position
      const beamConfig = actionConfig.projectiles[1];
      context.actionHelper.spawn({
        ...beamConfig,
        position: platePos.clone(),
        direction: direction.clone(),
        motion: {
          ...beamConfig.motion,
          direction: direction.clone()
        }
      });
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
