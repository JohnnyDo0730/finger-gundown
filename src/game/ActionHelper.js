const THREE = window.THREE;

/**
 * ActionHelper - Handles creation, update, physics, and collision logic 
 * for Linear, Homing, and Stationary projectiles/skills in the 3D scene.
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
   * Spawn a straight flying linear projectile (e.g. laser, gun shot, grenade).
   */
  spawnLinear(position, direction, speed, damage, duration, color = 0x00f2fe, size = 0.3, shape = 'sphere') {
    let geo;
    if (shape === 'cylinder') {
      geo = new THREE.CylinderGeometry(size * 0.3, size * 0.3, size * 4.0, 8);
      geo.rotateX(Math.PI / 2); // Rotate to point along Z-axis
    } else {
      geo = new THREE.SphereGeometry(size, 8, 8);
    }
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.lookAt(position.clone().add(direction)); // Align cylinder to fly direction
    this.scene.add(mesh);

    const velocity = direction.clone().normalize().multiplyScalar(speed);

    this.projectiles.push({
      mesh,
      type: 'linear',
      velocity,
      speed,
      damage,
      duration,
      elapsed: 0,
      knockbackStrength: 8.0
    });
  }

  /**
   * Spawn a stationary laser cylinder beam towards crosshair.
   */
  spawnStationaryBeam(position, direction, length, radius, damage, duration, color = 0xff0000, tickInterval = 5.0) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
    geo.rotateX(Math.PI / 2); // Point forward along Z-axis
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Center of cylinder is half length forward
    const center = position.clone().addScaledVector(direction, length / 2);
    mesh.position.copy(center);
    mesh.lookAt(position.clone().addScaledVector(direction, length));

    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      type: 'stationary_beam',
      startPoint: position.clone(),
      direction: direction.clone().normalize(),
      length,
      radius,
      damage,
      duration,
      tickInterval, // Passed from config (e.g. 5.0s to ensure single hit within beam lifetime)
      lastTickTime: -99.0,
      elapsed: 0
    });
  }

  /**
   * Spawn a homing tracking projectile that steers towards targets.
   */
  spawnHoming(position, speed, damage, targetEnemy, duration, color = 0xff007f, size = 0.4, fallbackDirection = null) {
    const geo = new THREE.ConeGeometry(size, size * 2.5, 8);
    geo.rotateX(Math.PI / 2); // Point cone forward
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);

    // Face targeting direction immediately upon spawn
    if (targetEnemy) {
      mesh.lookAt(targetEnemy.mesh.position.clone().add(new THREE.Vector3(0, targetEnemy.height / 2, 0)));
    } else if (fallbackDirection) {
      mesh.lookAt(position.clone().add(fallbackDirection));
    }

    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      type: 'homing',
      speed,
      damage,
      targetEnemy,
      fallbackDirection: fallbackDirection ? fallbackDirection.clone().normalize() : new THREE.Vector3(0, 0, -1),
      duration,
      elapsed: 0,
      knockbackStrength: 10.0
    });
  }

  /**
   * Spawn an anchored stationary area skill (e.g. magic zone, fire bottle circle).
   */
  spawnStationary(position, radius, damage, duration, rotateSpeed = 1.5, pulseSpeed = 4.0, tickInterval = 0.5, color = 0xbd00ff) {
    const group = new THREE.Group();
    group.position.copy(position);

    // 1. Inner glowing ring
    const ringGeo = new THREE.RingGeometry(radius - 0.2, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2; // Flat on floor
    group.add(ringMesh);

    // 2. Central floor marker grid
    const markerGeo = new THREE.BoxGeometry(radius * 1.4, 0.02, 0.1);
    const markerMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 });

    const m1 = new THREE.Mesh(markerGeo, markerMat);
    const m2 = m1.clone();
    m2.rotation.y = Math.PI / 2;
    group.add(m1);
    group.add(m2);

    this.scene.add(group);

    this.projectiles.push({
      mesh: group,
      type: 'stationary',
      radius,
      damage,
      duration,
      elapsed: 0,
      rotateSpeed,
      pulseSpeed,
      tickInterval,
      lastTickTime: -99.0 // Ensure immediate first tick damage
    });
  }

  /**
   * Search helper to find the closest living enemy target.
   */
  findNearestEnemy(currentPos, aimDirection = null) {
    if (!this.gameWorld.enemyManager) return null;
    const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();
    if (aliveEnemies.length === 0) return null;

    const maxDistance = 60.0; // Constraint 2: enemies cannot be too far (max 60 units)
    const candidateEnemies = [];

    aliveEnemies.forEach(enemy => {
      const toEnemy = enemy.mesh.position.clone().sub(currentPos);
      const dist = toEnemy.length();

      // Filter: Distance constraint
      if (dist > maxDistance) return;

      let dot = 1.0;
      if (aimDirection) {
        const normDir = toEnemy.clone().setY(0).normalize();
        const normAim = aimDirection.clone().setY(0).normalize();
        if (normDir.lengthSq() > 0 && normAim.lengthSq() > 0) {
          dot = normAim.dot(normDir);
          // Filter: Angle constraint (35 degrees corresponds to dot product >= 0.8192)
          if (dot < 0.866) return;
        } else {
          return; // Invalid vectors, filter out
        }
      }

      candidateEnemies.push({
        enemy,
        dist,
        dot
      });
    });

    if (candidateEnemies.length === 0) return null;

    // Sort by priorities: closest distance, then smaller angle (larger dot product)
    candidateEnemies.sort((a, b) => {
      // If distance difference is small (within 3.0 units), prioritize angle alignment
      if (Math.abs(a.dist - b.dist) < 3.0) {
        return b.dot - a.dot; // Larger dot product (smaller angle) comes first
      }
      return a.dist - b.dist; // Closer distance comes first
    });

    return candidateEnemies[0].enemy;
  }

  /**
   * Main update tick for movement, animation, and collision validation.
   */
  update(deltaTime) {
    if (!this.gameWorld.enemyManager) return;
    const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.elapsed += deltaTime;

      // Clean up expired projectiles
      if (proj.elapsed >= proj.duration) {
        this.scene.remove(proj.mesh);
        // Clean up geometries and materials
        proj.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.projectiles.splice(i, 1);
        continue;
      }

      // Handle individual projectile behaviors
      if (proj.type === 'linear') {
        proj.mesh.position.addScaledVector(proj.velocity, deltaTime);

        // Standard bounding box collision check
        const projBox = new THREE.Box3().setFromObject(proj.mesh);
        let hit = false;

        for (const enemy of aliveEnemies) {
          if (enemy.boundingBox.intersectsBox(projBox)) {
            const kbVec = proj.velocity.clone().normalize().multiplyScalar(proj.knockbackStrength);
            enemy.takeDamage(proj.damage, kbVec);
            hit = true;
            break;
          }
        }

        if (hit) {
          proj.elapsed = proj.duration; // Queue for disposal next tick
        }

      } else if (proj.type === 'homing') {
        // Target tracking validation
        if (!proj.targetEnemy || !proj.targetEnemy.isAlive) {
          proj.targetEnemy = this.findNearestEnemy(proj.mesh.position, proj.fallbackDirection);
        }

        if (proj.targetEnemy) {
          // Calculate heading direction vector pointing to enemy midsection
          const targetCenter = proj.targetEnemy.mesh.position.clone().add(
            new THREE.Vector3(0, proj.targetEnemy.height / 2, 0)
          );
          const dir = targetCenter.sub(proj.mesh.position).normalize();

          // Steer towards target
          proj.mesh.position.addScaledVector(dir, proj.speed * deltaTime);
          proj.mesh.lookAt(proj.targetEnemy.mesh.position.clone().add(new THREE.Vector3(0, proj.targetEnemy.height / 2, 0)));

          // Check hit
          const projBox = new THREE.Box3().setFromObject(proj.mesh);
          if (proj.targetEnemy.boundingBox.intersectsBox(projBox)) {
            const kbVec = dir.multiplyScalar(proj.knockbackStrength);
            proj.targetEnemy.takeDamage(proj.damage, kbVec);
            proj.elapsed = proj.duration; // Queue for disposal next tick
          }
        } else {
          // If no enemy exists, fly straight along fallback direction
          const dir = proj.fallbackDirection;
          proj.mesh.position.addScaledVector(dir, proj.speed * deltaTime);
          proj.mesh.lookAt(proj.mesh.position.clone().add(dir));
        }

      } else if (proj.type === 'stationary') {
        // Animation 1: Rotation
        proj.mesh.rotation.y += proj.rotateSpeed * deltaTime;

        // Animation 2: Pulse scale
        const scale = 1.0 + Math.sin(proj.elapsed * proj.pulseSpeed) * 0.15;
        proj.mesh.scale.set(scale, 1, scale);

        // Tick-based periodic damage calculation
        if (proj.elapsed - proj.lastTickTime >= proj.tickInterval) {
          proj.lastTickTime = proj.elapsed;

          const projPos = proj.mesh.position;
          aliveEnemies.forEach(enemy => {
            const dist = enemy.mesh.position.distanceTo(projPos);
            // Cylindrical boundary test (Z-X circle, Y ground)
            if (dist <= proj.radius + enemy.width / 2) {
              const radialKnockback = enemy.mesh.position.clone().sub(projPos).setY(0).normalize().multiplyScalar(2.5);
              enemy.takeDamage(proj.damage, radialKnockback);
            }
          });
        }
      } else if (proj.type === 'stationary_beam') {
        // No deformation animation, just tick-based damage checks
        if (proj.elapsed - proj.lastTickTime >= proj.tickInterval) {
          proj.lastTickTime = proj.elapsed;

          const A = proj.startPoint;
          const v = proj.direction.clone().multiplyScalar(proj.length);

          aliveEnemies.forEach(enemy => {
            const P = enemy.mesh.position.clone().setY(0);
            const A_flat = A.clone().setY(0);
            const v_flat = v.clone().setY(0);

            const w = P.clone().sub(A_flat);
            const t = Math.max(0, Math.min(1, w.dot(v_flat) / v_flat.lengthSq()));
            const C = A_flat.clone().addScaledVector(v_flat, t);
            const dist = P.distanceTo(C);

            if (dist <= proj.radius + enemy.width / 2) {
              const knockback = proj.direction.clone().setY(0).normalize().multiplyScalar(3.0);
              enemy.takeDamage(proj.damage, knockback);
            }
          });
        }
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
