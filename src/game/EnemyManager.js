const THREE = window.THREE;
import { BaseEnemy } from './BaseEnemy.js';

/**
 * EnemyManager - Controls the population lifecycle of target enemies in the battleground.
 * Handles automatic random respawns, updates, distance clamping, and scene cleanup.
 */
export class EnemyManager {
  /**
   * @param {App} app - Reference to core app instance
   * @param {GameWorld} gameWorld - Reference to active 3D game world
   */
  constructor(app, gameWorld) {
    this.app = app;
    this.gameWorld = gameWorld;
    this.enemies = [];

    // Configuration caps
    this.minEnemies = 5;
    this.maxEnemies = 5;
    this.enemyIdCounter = 0;

    this.init();
  }

  init() {
    console.log('[EnemyManager] Seeding initial training targets in a row directly in front of the player...');
    
    // Spawn 5 training dummy puppets in a neat row at Z = 15 (15 units in front of player starting Z=30)
    const zPos = 15.0;
    const xOffsets = [-6.0, -3.0, 0.0, 3.0, 6.0];
    
    for (let i = 0; i < xOffsets.length; i++) {
      const id = `dummy_${this.enemyIdCounter++}`;
      const type = i % 2 === 0 ? 'cylinder' : 'box'; // Alternate cylinder and box shapes
      const pos = new THREE.Vector3(xOffsets[i], 0, zPos);
      
      const enemy = new BaseEnemy(id, type, pos, this.gameWorld.scene);
      this.enemies.push(enemy);
    }
  }

  /**
   * Spawns a single Box/Cylinder target at a safe random distance in front of the player.
   */
  spawnRandomEnemy() {
    const id = `enemy_${this.enemyIdCounter++}_${Math.floor(Math.random() * 1000)}`;
    const type = Math.random() > 0.5 ? 'box' : 'cylinder';

    // Query active player position for spawn proximity checks
    const playerController = this.gameWorld.playerController;
    const playerPos = playerController ? playerController.position : null;
    const camera = this.gameWorld.camera;

    let position;

    if (playerPos && camera) {
      // Get player horizontal look direction from camera
      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      lookDir.y = 0;
      lookDir.normalize();

      const rightDir = new THREE.Vector3(-lookDir.z, 0, lookDir.x);

      // Random offset in front of player: forward 10 to 25 units, side -10 to 10 units
      const dForward = 10 + Math.random() * 15;
      const dSide = (Math.random() - 0.5) * 20;

      position = playerPos.clone()
        .addScaledVector(lookDir, dForward)
        .addScaledVector(rightDir, dSide);
      position.y = 0; // Keep targets pinned to ground plane
    } else {
      // Fallback to absolute coordinates if player is not loaded yet
      const x = (Math.random() - 0.5) * 40;
      const z = 5 + Math.random() * 20;
      position = new THREE.Vector3(x, 0, z);
    }

    const enemy = new BaseEnemy(id, type, position, this.gameWorld.scene);
    this.enemies.push(enemy);

    console.log(`[EnemyManager] Spawned ${type} enemy ${id} at (${position.x.toFixed(1)}, 0, ${position.z.toFixed(1)})`);
  }

  /**
   * Ticks enemy physics, flashes, HUD updates, and maintains population.
   * @param {number} deltaTime - Time step (seconds)
   */
  update(deltaTime) {
    const camera = this.gameWorld.camera;

    // 1. Update and clean up dead enemies (iterating backwards for safe array splicing)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(deltaTime, camera);

      // Dispose and remove when HP is zero AND death animation completes
      if (!enemy.isAlive && enemy.deathTimer <= 0) {
        enemy.destroy();
        this.enemies.splice(i, 1);
        console.log(`[EnemyManager] Dead enemy ${enemy.id} removed and disposed.`);
      }
    }

    // 2. Maintain active population limits (minimum 3 enemies)
    if (this.enemies.length < this.minEnemies) {
      this.spawnRandomEnemy();
    }
  }

  /**
   * Fetch all active, living target objects.
   * @returns {BaseEnemy[]} Sorted list of damageable enemies.
   */
  getAliveEnemies() {
    return this.enemies.filter((enemy) => enemy.isAlive);
  }

  /**
   * Disposes and clears all enemies.
   */
  clearAll() {
    console.log('[EnemyManager] Purging all active targets...');
    this.enemies.forEach((enemy) => enemy.destroy());
    this.enemies = [];
  }
}
