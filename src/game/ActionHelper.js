const THREE = window.THREE;

/**
 * ActionHelper - Handles creation, update, physics, and collision logic 
 * for composed projectiles and legacy skills in the 3D scene.
 */
export class ActionHelper {
  /**
   * @param {App} app - Core application orchestrator
   * @param {GameWorld} gameWorld - Active 3D GameWorld manager
   */
  constructor(app, gameWorld) {
    this.app = app;
    this.gameWorld = gameWorld;
    this.scene = gameWorld.scene;
    this.projectiles = [];
  }

  /**
   * Universal modular projectile factory.
   * Composes a projectile out of a shape configuration, motion controller, and collision rule.
   */
  spawn(config) {
    let geo;
    let mesh;

    const color = config.color !== undefined ? config.color : 0xffffff;
    const opacity = config.opacity !== undefined ? config.opacity : 0.8;

    // 1. Geometry Instantiation (Z-axis negative forward convention)
    if (config.shape.type === 'sphere') {
      geo = new THREE.SphereGeometry(config.shape.radius, 8, 8);
    } else if (config.shape.type === 'cylinder') {
      geo = new THREE.CylinderGeometry(config.shape.radius, config.shape.radius, config.shape.length, 8);
      if (config.shape.orientation === 'vertical') {
        // Shift geometry up so the bottom face sits at Y = 0 (perfect ground alignment)
        geo.translate(0, config.shape.length / 2, 0);
      } else {
        geo.rotateX(Math.PI / 2); // Orient length along negative Z (default forward)
        if (config.shape.pivot === 'start') {
          geo.translate(0, 0, config.shape.length / 2); // Shift geometry to align pivot to start
        }
      }
    } else if (config.shape.type === 'box') {
      const w = config.shape.width || 1.0;
      const h = config.shape.height || 0.1;
      const d = config.shape.length || 1.0;
      geo = new THREE.BoxGeometry(w, h, d);
      if (config.shape.orientation === 'vertical') {
        geo.translate(0, h / 2, 0); // Bottom rests on ground Y=0
      } else {
        if (config.shape.pivot === 'start') {
          geo.translate(0, 0, d / 2);
        }
      }
    } else if (config.shape.type === 'cone') {
      geo = new THREE.ConeGeometry(config.shape.radius, config.shape.length, 8);
      geo.rotateX(Math.PI / 2); // Orient height along negative Z
      if (config.shape.pivot === 'start') {
        geo.translate(0, 0, config.shape.length / 2);
      }
    } else if (config.shape.type === 'aoe_group') {
      const radius = config.shape.radius;
      const group = new THREE.Group();
      
      const ringGeo = new THREE.RingGeometry(radius - 0.2, radius, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: opacity
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      const markerGeo = new THREE.BoxGeometry(radius * 1.4, 0.02, 0.1);
      const markerMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity * 0.6
      });
      const m1 = new THREE.Mesh(markerGeo, markerMat);
      const m2 = m1.clone();
      m2.rotation.y = Math.PI / 2;
      group.add(m1);
      group.add(m2);

      mesh = group;
    }

    if (!mesh && geo) {
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: opacity < 1.0,
        opacity: opacity,
        side: THREE.DoubleSide
      });
      mesh = new THREE.Mesh(geo, mat);
    }

    if (!mesh) return null;

    // Apply starting coordinates
    mesh.position.copy(config.position);

    // Initial lookAt rotation to align with direction if provided
    if (config.motion && config.motion.direction) {
      mesh.lookAt(config.position.clone().add(config.motion.direction));
    }

    // Support start delay: initially hide mesh if delay is configured
    const delaySec = config.delay !== undefined ? config.delay / 1000 : 0;
    if (delaySec > 0) {
      mesh.visible = false;
    }

    this.scene.add(mesh);

    // Build Motion Controller config
    const motion = { ...config.motion };
    if (motion.type === 'parabolic') {
      motion.startPoint = config.position.clone();
      motion.targetPoint = config.targetPoint 
        ? config.targetPoint.clone() 
        : (motion.targetPoint ? motion.targetPoint.clone() : config.position.clone().add(new THREE.Vector3(0, 0, -10)));
      motion.height = motion.height !== undefined ? motion.height : Math.max(2.0, motion.startPoint.distanceTo(motion.targetPoint) * 0.25);
      
      const durationMs = motion.duration !== undefined ? motion.duration : config.duration;
      motion.duration = durationMs / 1000; // Convert duration to seconds for motion update calculations
    }

    // Build Collision Controller config
    const collision = { ...config.collision };
    if (collision.type === 'once_per_target') {
      collision.hitTargets = new Set();
      collision.startPoint = config.position.clone();
      collision.direction = config.direction 
        ? config.direction.clone().normalize() 
        : new THREE.Vector3(0, 0, -1);
      collision.length = collision.length || config.shape.length || 0;
      collision.radius = collision.radius || config.shape.radius || 0;
      collision.width = collision.width || config.shape.width || 0;
      collision.pivot = collision.pivot || config.shape.pivot || 'center';
      collision.shape = collision.shape || config.shape.type;
    } else if (collision.type === 'aoe') {
      collision.lastTickTime = -99.0;
      collision.tickInterval = (collision.tickInterval !== undefined ? collision.tickInterval : 1000) / 1000; // Convert ms to seconds
      collision.startPoint = config.position.clone();
      collision.direction = config.direction 
        ? config.direction.clone().normalize() 
        : new THREE.Vector3(0, 0, -1);
      collision.length = collision.length || (config.shape ? config.shape.length : 0);
      collision.radius = collision.radius || (config.shape ? config.shape.radius : 0);
      collision.width = collision.width || (config.shape ? config.shape.width : 0);
      collision.pivot = collision.pivot || (config.shape ? config.shape.pivot : 'center');
      collision.shape = collision.shape || config.shape.type;
    }

    this.projectiles.push({
      mesh,
      motionController: motion,
      collisionController: collision,
      elapsed: 0,
      delay: delaySec,
      duration: config.duration / 1000 // Convert milliseconds to seconds
    });

    return mesh;
  }

  /**
   * Helper to deal damage, apply status effects, and notify weapon of enemy death.
   */
  applyDamageAndEffects(enemy, col, knockbackVector) {
    const killed = enemy.takeDamage(col.damage, knockbackVector);
    if (col.statusEffects) {
      col.statusEffects.forEach(effect => {
        enemy.applyDebuff(effect.type, effect.value, effect.duration);
      });
    }
    if (killed && this.gameWorld.playerController && this.gameWorld.playerController.equippedWeapon) {
      const weapon = this.gameWorld.playerController.equippedWeapon;
      if (typeof weapon.onEnemyKilled === 'function') {
        weapon.onEnemyKilled();
      }
    }
  }

  /**
   * Search helper to find the closest living enemy target.
   */
  findNearestEnemy(currentPos, aimDirection = null, options = {}) {
    if (!this.gameWorld.enemyManager) return null;
    const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();
    if (aliveEnemies.length === 0) return null;

    const maxDistance = options.maxDistance !== undefined ? options.maxDistance : 60.0;
    const minDistance = options.minDistance !== undefined ? options.minDistance : 0.0;
    const fovAngle = options.fovAngle !== undefined ? options.fovAngle : 30.0; // in degrees
    const dotThreshold = Math.cos(fovAngle * Math.PI / 180);
    const sortingTolerance = options.sortingTolerance !== undefined ? options.sortingTolerance : 3.0;

    const candidateEnemies = [];

    aliveEnemies.forEach(enemy => {
      const toEnemy = enemy.mesh.position.clone().sub(currentPos);
      const dist = toEnemy.length();

      if (dist < minDistance || dist > maxDistance) return;

      let dot = 1.0;
      if (aimDirection) {
        const normDir = toEnemy.clone().setY(0).normalize();
        const normAim = aimDirection.clone().setY(0).normalize();
        if (normDir.lengthSq() > 0 && normAim.lengthSq() > 0) {
          dot = normAim.dot(normDir);
          if (dot < dotThreshold) return;
        } else {
          return;
        }
      }

      candidateEnemies.push({ enemy, dist, dot });
    });

    if (candidateEnemies.length === 0) return null;

    candidateEnemies.sort((a, b) => {
      if (options.priority === 'angle') {
        return b.dot - a.dot;
      }
      if (options.priority === 'distance') {
        return a.dist - b.dist;
      }
      // Default: hybrid priority
      if (Math.abs(a.dist - b.dist) < sortingTolerance) {
        return b.dot - a.dot;
      }
      return a.dist - b.dist;
    });

    return candidateEnemies[0].enemy;
  }

  /**
   * Main update tick for motion integration and collision checks.
   */
  update(deltaTime) {
    if (!this.gameWorld.enemyManager) return;
    const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.elapsed += deltaTime;

      const delaySec = proj.delay || 0;
      const totalDuration = delaySec + proj.duration;

      // Clean up expired projectiles
      if (proj.elapsed >= totalDuration) {
        this.scene.remove(proj.mesh);
        proj.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.projectiles.splice(i, 1);
        continue;
      }

      // Bypass motion and collision during delay phase
      if (proj.elapsed < delaySec) {
        continue;
      }

      // Ensure mesh is visible after delay has passed
      if (!proj.mesh.visible) {
        proj.mesh.visible = true;
      }

      const activeTime = proj.elapsed - delaySec;

      // --- 1. Motion Updates ---
      const motion = proj.motionController;
      if (motion.type === 'linear') {
        const vel = motion.direction.clone().multiplyScalar(motion.speed);
        proj.mesh.position.addScaledVector(vel, deltaTime);
      } else if (motion.type === 'homing') {
        if (!motion.targetEnemy || !motion.targetEnemy.isAlive) {
          motion.targetEnemy = this.findNearestEnemy(proj.mesh.position, motion.fallbackDirection);
        }

        if (motion.targetEnemy) {
          const targetCenter = motion.targetEnemy.mesh.position.clone().add(
            new THREE.Vector3(0, motion.targetEnemy.height / 2, 0)
          );
          const dir = targetCenter.sub(proj.mesh.position).normalize();
          proj.mesh.position.addScaledVector(dir, motion.speed * deltaTime);
          proj.mesh.lookAt(targetCenter);
        } else {
          const dir = motion.fallbackDirection;
          proj.mesh.position.addScaledVector(dir, motion.speed * deltaTime);
          proj.mesh.lookAt(proj.mesh.position.clone().add(dir));
        }
      } else if (motion.type === 'stationary_pulsing') {
        let scale = 1.0;
        if (motion.cycles !== undefined) {
          const pct = Math.min(1.0, activeTime / proj.duration);
          const amp = motion.pulseAmplitude !== undefined ? motion.pulseAmplitude : 1.0;
          scale = Math.sin(pct * Math.PI * 2 * motion.cycles) * amp;
        } else {
          scale = 1.0 + Math.sin(activeTime * (motion.pulseSpeed || 0)) * (motion.pulseAmplitude || 0);
        }
        proj.mesh.scale.set(scale, scale, scale); // Scale symmetrically on all axes
      } else if (motion.type === 'parabolic') {
        const pct = Math.min(1.0, activeTime / motion.duration);
        
        // Linear horizontal interpolation
        const currentPos = new THREE.Vector3().lerpVectors(motion.startPoint, motion.targetPoint, pct);
        // Vertical arc addition
        const arc = Math.sin(pct * Math.PI);
        currentPos.y += arc * motion.height;
        
        proj.mesh.position.copy(currentPos);

        // Adjust mesh forward look alignment to match the flight arc direction
        if (pct < 1.0) {
          const nextPct = Math.min(1.0, pct + 0.01);
          const nextPos = new THREE.Vector3().lerpVectors(motion.startPoint, motion.targetPoint, nextPct);
          nextPos.y += Math.sin(nextPct * Math.PI) * motion.height;
          proj.mesh.lookAt(nextPos);
        }
      }

      // --- 2. Collision & Damage Updates ---
      const col = proj.collisionController;

      // Calculate current scale multiplier if the projectile has pulsing motion
      let scaleMultiplier = 1.0;
      if (motion.type === 'stationary_pulsing') {
        if (motion.cycles !== undefined) {
          const pct = Math.min(1.0, activeTime / proj.duration);
          const amp = motion.pulseAmplitude !== undefined ? motion.pulseAmplitude : 1.0;
          scaleMultiplier = Math.sin(pct * Math.PI * 2 * motion.cycles) * amp;
        } else {
          scaleMultiplier = 1.0 + Math.sin(activeTime * (motion.pulseSpeed || 0)) * (motion.pulseAmplitude || 0);
        }
      }
      const colRadius = col.radius * scaleMultiplier;
      const colLength = col.length * scaleMultiplier;

      if (col.type === 'impact') {
        const projBox = new THREE.Box3().setFromObject(proj.mesh);
        let hit = false;
        for (const enemy of aliveEnemies) {
          if (enemy.boundingBox.intersectsBox(projBox)) {
            let kbDir = new THREE.Vector3(0, 0, -1);
            if (motion.type === 'linear') {
              kbDir.copy(motion.direction);
            } else if (motion.type === 'homing') {
              const targetCenter = enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.height / 2, 0));
              kbDir.copy(targetCenter.sub(proj.mesh.position));
            }
            const kbVec = kbDir.normalize().multiplyScalar(col.knockbackStrength !== undefined ? col.knockbackStrength : 3.0);
            this.applyDamageAndEffects(enemy, col, kbVec);
            hit = true;
            break;
          }
        }
        if (hit) {
          proj.elapsed = totalDuration; // Expire projectile immediately
        }
      } else if (col.type === 'aoe') {
        if (activeTime - col.lastTickTime >= col.tickInterval) {
          col.lastTickTime = activeTime;
          const projPos = proj.mesh.position;
          aliveEnemies.forEach(enemy => {
            let isInside = false;

            if (col.shape === 'cylinder') {
              const A = col.startPoint;
              const v = col.direction.clone().multiplyScalar(colLength);

              const P = enemy.mesh.position.clone().setY(0);
              const A_flat = A.clone().setY(0);
              const v_flat = v.clone().setY(0);

              const w = P.clone().sub(A_flat);
              const v_len_sq = v_flat.lengthSq();
              const t = v_len_sq > 0 ? Math.max(0, Math.min(1, w.dot(v_flat) / v_len_sq)) : 0;
              const C = A_flat.clone().addScaledVector(v_flat, t);
              const dist = P.distanceTo(C);

              if (dist <= colRadius + enemy.width / 2) {
                isInside = true;
              }
            } else if (col.shape === 'box' || col.shape === 'rectangle') {
              const localPos = enemy.mesh.position.clone().applyMatrix4(new THREE.Matrix4().copy(proj.mesh.matrixWorld).invert());
              const halfW = col.width / 2;
              const isInsideX = (localPos.x >= -halfW && localPos.x <= halfW);
              let isInsideZ = false;
              if (col.pivot === 'start') {
                isInsideZ = (localPos.z >= 0 && localPos.z <= col.length);
              } else {
                const halfL = col.length / 2;
                isInsideZ = (localPos.z >= -halfL && localPos.z <= halfL);
              }
              if (isInsideX && isInsideZ) {
                isInside = true;
              }
            } else {
              const dist = enemy.mesh.position.distanceTo(projPos);
              if (dist <= colRadius + enemy.width / 2) {
                isInside = true;
              }
            }

            if (isInside) {
              const kbDir = col.direction ? col.direction.clone() : enemy.mesh.position.clone().sub(projPos);
              const knockback = kbDir.setY(0).normalize().multiplyScalar(col.knockbackStrength !== undefined ? col.knockbackStrength : 2.5);
              this.applyDamageAndEffects(enemy, col, knockback);
            }
          });
        }
      } else if (col.type === 'once_per_target') {
        const projPos = proj.mesh.position;
        aliveEnemies.forEach(enemy => {
          if (col.hitTargets.has(enemy.id)) return;

          let isIntersecting = false;
          if (col.shape === 'cylinder') {
            const A = col.startPoint;
            const v = col.direction.clone().multiplyScalar(colLength);

            const P = enemy.mesh.position.clone().setY(0);
            const A_flat = A.clone().setY(0);
            const v_flat = v.clone().setY(0);

            const w = P.clone().sub(A_flat);
            const t = Math.max(0, Math.min(1, w.dot(v_flat) / v_flat.lengthSq()));
            const C = A_flat.clone().addScaledVector(v_flat, t);
            const dist = P.distanceTo(C);

            if (dist <= colRadius + enemy.width / 2) {
              isIntersecting = true;
            }
          } else if (col.shape === 'box' || col.shape === 'rectangle') {
            const localPos = enemy.mesh.position.clone().applyMatrix4(new THREE.Matrix4().copy(proj.mesh.matrixWorld).invert());
            const halfW = col.width / 2;
            const isInsideX = (localPos.x >= -halfW && localPos.x <= halfW);
            let isInsideZ = false;
            if (col.pivot === 'start') {
              isInsideZ = (localPos.z >= 0 && localPos.z <= col.length);
            } else {
              const halfL = col.length / 2;
              isInsideZ = (localPos.z >= -halfL && localPos.z <= halfL);
            }
            if (isInsideX && isInsideZ) {
              isIntersecting = true;
            }
          } else if (col.shape === 'sphere') {
            const dist = enemy.mesh.position.distanceTo(projPos);
            if (dist <= colRadius + enemy.width / 2) {
              isIntersecting = true;
            }
          }

          if (isIntersecting) {
            col.hitTargets.add(enemy.id);
            const kbDir = col.direction ? col.direction.clone() : enemy.mesh.position.clone().sub(projPos);
            const knockback = kbDir.setY(0).normalize().multiplyScalar(col.knockbackStrength !== undefined ? col.knockbackStrength : 3.0);
            this.applyDamageAndEffects(enemy, col, knockback);
          }
        });
      }
    }
  }

  /**
   * Clear and clean up all remaining projectiles.
   */
  clearAll() {
    this.projectiles.forEach(proj => {
      this.scene.remove(proj.mesh);
      proj.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    });
    this.projectiles = [];
  }
}
