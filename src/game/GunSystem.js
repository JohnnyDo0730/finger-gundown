const THREE = window.THREE;

/**
 * GunSystem - Manages weapons, bullets, raycast aiming crosshairs, passive overheating,
 * HUD display updates, and mouse/keyboard fallbacks for gameplay testing.
 */
export class GunSystem {
  /**
   * @param {App} app - Core application instance
   * @param {GameWorld} gameWorld - 3D game world manager
   */
  constructor(app, gameWorld) {
    this.app = app;
    this.gameWorld = gameWorld;
    this.scene = gameWorld.scene;
    this.camera = gameWorld.camera;

    // Subsystem States
    this.active = false;
    this.ndcCoords = new THREE.Vector2(0, 0); // Smoothed active NDC coords
    this.targetNdcCoords = new THREE.Vector2(0, 0); // Raw target destination NDC coords
    this.activeAimTimeout = 0.0; // Liveness buffer timer to prevent flickering/disappearing
    this.aimLivenessDuration = 0.35; // 350ms buffer window
    this.bullets = [];

    // Weapon Stats (Laser Pistol defaults - Infinite Ammo)
    this.ammo = 12; // Internal unused backup
    this.maxAmmo = 12;
    this.isReloading = false;
    this.reloadTimer = 0.0;
    this.reloadDuration = 2.0; // 2.0 seconds reload

    this.shootCooldownTimer = 0.0;
    this.shootCooldown = 0.45; // 450ms cooldown (slightly increased)
    this.damage = 25;
    this.bulletSpeed = 45.0;
    this.knockbackStrength = 8.0;

    // Semi-automatic trigger lock state
    this.isShootPressed = false;

    // Overheat Passive Stats ("爐心溶解")
    this.heat = 0.0;
    this.maxHeat = 100.0;
    this.heatPerShot = 20.0;
    this.heatDecayRate = 12.0; // Slow decay: 12% heat per second
    this.isOverheated = false;
    this.overheatDuration = 4.0; // 4.0 seconds meltdown lockout (2x reload)
    this.overheatTimer = 0.0;

    this.crosshair = null; // Still used for internal 3D target point calculation
    this.crosshairMat = null;
    this.crosshairDom = null; // 2D DOM screen-space crosshair cursor
    this.hudEl = null;

    // Bind event reference cache for removal on destroy
    this.mouseMoveHandler = null;
    this.mouseDownHandler = null;
    this.keyDownHandler = null;

    this.init();
  }

  /**
   * Helper to verify if active hand gestures are currently captured.
   * If true, mouse fallback input is bypassed to ensure hand-tracking priority.
   */
  isHandActive() {
    const w = this.app.gestureTestWindow;
    return w && w.isMediaPipeActive && w.latestResults && w.latestResults.rightHandLandmarks;
  }

  /**
   * Initialize crosshair mesh, HUD overlay, event subscriptions, and fallbacks.
   */
  init() {
    console.log('[GunSystem] Initializing Laser Pistol ballistics and crosshair...');

    // 1. Create Virtual 3D Target Node (replaces visual 3D mesh to preserve shooting calculations)
    this.crosshair = new THREE.Object3D();
    this.crosshair.position.set(0, 0, 0);

    // 2. Create 2D DOM screen-space crosshair cursor overlay (cross "+" style)
    if (!document.getElementById('spatial-crosshair-hud')) {
      this.crosshairDom = document.createElement('div');
      this.crosshairDom.id = 'spatial-crosshair-hud';
      this.crosshairDom.style.position = 'fixed';
      this.crosshairDom.style.width = '48px';
      this.crosshairDom.style.height = '48px';
      this.crosshairDom.style.pointerEvents = 'none';
      this.crosshairDom.style.zIndex = '9999';
      this.crosshairDom.style.transform = 'translate(-50%, -50%)';
      this.crosshairDom.style.display = 'none'; // Controlled dynamically during gameplay ticks
      
      this.crosshairDom.innerHTML = `
        <!-- Horizontal line -->
        <div class="crosshair-bar-h" style="position: absolute; left: 0; top: 22px; width: 48px; height: 4px; border: 1px solid #000; box-sizing: border-box; background: #00f2fe; box-shadow: 0 0 6px #00f2fe; transition: background 0.15s, box-shadow 0.15s;"></div>
        <!-- Vertical line -->
        <div class="crosshair-bar-v" style="position: absolute; left: 22px; top: 0; width: 4px; height: 48px; border: 1px solid #000; box-sizing: border-box; background: #00f2fe; box-shadow: 0 0 6px #00f2fe; transition: background 0.15s, box-shadow 0.15s;"></div>
        <!-- Center dot -->
        <div style="position: absolute; left: 21px; top: 21px; width: 6px; height: 6px; border: 1px solid #000; box-sizing: border-box; border-radius: 50%; background: #fff; box-shadow: 0 0 3px #fff;"></div>
      `;
      document.body.appendChild(this.crosshairDom);
    } else {
      this.crosshairDom = document.getElementById('spatial-crosshair-hud');
    }

    // 3. Mount custom Cyberpunk HUD overlay to DOM
    this.createHUDDOM();

    // 4. Listen to GestureEngine events
    if (this.app.gestureEngine) {
      this.app.gestureEngine.addEventListener('ON_AIM', (data) => {
        if (data.active) {
          this.activeAimTimeout = this.aimLivenessDuration; // Lock cursor visible inside liveness window
          this.mapGestureCoordsToNDC(data.wristX, data.wristY);
        }
      });

      this.app.gestureEngine.addEventListener('ON_FIRE', (data) => {
        if (data.active) {
          if (!this.isShootPressed) {
            this.shoot();
            this.isShootPressed = true;
          }
        } else {
          this.isShootPressed = false;
        }
      });

      this.app.gestureEngine.addEventListener('ON_RELOAD', () => {
        this.reload();
      });
    }

    // 5. Register Keyboard / Mouse developer fallbacks
    this.setupDeveloperFallbacks();
  }

  /**
   * Create HUD overlay DOM container.
   */
  createHUDDOM() {
    if (document.getElementById('gameplay-hud')) return;

    this.hudEl = document.createElement('div');
    this.hudEl.id = 'gameplay-hud';
    this.hudEl.style.position = 'fixed';
    this.hudEl.style.bottom = '30px';
    this.hudEl.style.right = '30px';
    this.hudEl.style.zIndex = '100';
    this.hudEl.style.fontFamily = "'Share Tech Mono', 'Rajdhani', sans-serif";
    this.hudEl.style.pointerEvents = 'none';
    this.hudEl.style.color = '#fff';
    this.hudEl.style.background = 'rgba(10, 11, 15, 0.75)';
    this.hudEl.style.border = '1px solid rgba(0, 242, 254, 0.25)';
    this.hudEl.style.borderRadius = '12px';
    this.hudEl.style.padding = '15px 25px';
    this.hudEl.style.minWidth = '220px';
    this.hudEl.style.backdropFilter = 'blur(10px)';
    this.hudEl.style.boxShadow = '0 0 15px rgba(0, 242, 254, 0.15)';
    this.hudEl.style.display = 'none'; // Initially hidden, shown during PLAYING state

    this.hudEl.innerHTML = `
      <div style="font-size: 0.7rem; color: #8c9bb3; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 2px;">裝備武器 (WEAPON)</div>
      <div id="hud-weapon-name" style="font-size: 1.35rem; font-weight: bold; color: #00f2fe; text-transform: uppercase; letter-spacing: 1px;">雷射手槍</div>
      
      <div id="hud-ammo-section" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <span style="font-size: 0.7rem; color: #8c9bb3; text-transform: uppercase; letter-spacing: 1px;">核心能源 (AMMO)</span>
          <div id="hud-ammo-val" style="font-size: 1.8rem; font-weight: bold; font-family: 'Rajdhani', sans-serif; line-height: 1.0; margin-top: 2px;">12 / 12</div>
        </div>
        <div id="hud-overheat-indicator" style="font-size: 0.75rem; color: #ff3b30; font-weight: bold; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(255, 59, 48, 0.15); border: 1px solid rgba(255, 59, 48, 0.3); display: none; animation: blink-hud 1s infinite alternate;">熔斷鎖定 (MELTDOWN)</div>
      </div>

      <div id="hud-heat-section" style="margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #8c9bb3; text-transform: uppercase; margin-bottom: 2px;">
          <span>核心溫度 (HEAT)</span>
          <span id="hud-heat-val">0%</span>
        </div>
        <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
          <div id="hud-heat-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00f2fe 30%, #ff9f0a 70%, #ff3b30 100%); transition: width 0.1s ease; border-radius: 3px;"></div>
        </div>
      </div>
      
      <div style="margin-top: 12px; font-size: 0.65rem; color: #8c9bb3; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 6px;">
        測試操作提示：滑鼠移動瞄準，點擊射擊，[R]鍵冷卻換彈
      </div>

      <style>
        @keyframes blink-hud {
          from { opacity: 0.4; }
          to { opacity: 1.0; }
        }
      </style>
    `;

    document.body.appendChild(this.hudEl);
  }

  /**
   * Standardized keyboard and mouse developer triggers.
   */
  setupDeveloperFallbacks() {
    // 1. Mouse movement maps screen coordinates directly to target Raycast NDC coords
    this.mouseMoveHandler = (e) => {
      const currentState = this.app.stateManager.getState();
      if (currentState !== 'PLAYING') return;
      if (this.isHandActive()) return; // Prioritize hand gestures over mouse move

      this.activeAimTimeout = this.aimLivenessDuration; // Reset liveness window
      this.targetNdcCoords.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.targetNdcCoords.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    // 2. Mouse Click triggers fire
    this.mouseDownHandler = (e) => {
      const currentState = this.app.stateManager.getState();
      if (currentState !== 'PLAYING') return;
      if (this.isHandActive()) return; // Prioritize hand gestures over mouse clicks

      // Ignore clicks on pause buttons or custom modals (any UI buttons)
      if (e.target.closest('button, .menu-panel')) return;

      this.shoot();
    };

    // 3. Keypress R triggers reload/cooldown
    this.keyDownHandler = (e) => {
      const currentState = this.app.stateManager.getState();
      if (currentState !== 'PLAYING') return;
      if (this.isHandActive()) return; // Prioritize hand gestures over keyboard

      if (e.key === 'r' || e.key === 'R') {
        this.reload();
      }
    };

    window.addEventListener('mousemove', this.mouseMoveHandler);
    window.addEventListener('mousedown', this.mouseDownHandler);
    window.addEventListener('keydown', this.keyDownHandler);
  }

  /**
   * Helper to map gesture coordinates based on calibration configuration.
   */
  mapGestureCoordsToNDC(wristX, wristY) {
    const ui = this.app.uiManager;
    const xMin = ui ? ui.calib_xMin : 0.15;
    const xMax = ui ? ui.calib_xMax : 0.85;
    const yMin = ui ? ui.calib_yMin : 0.20;
    const yMax = ui ? ui.calib_yMax : 0.80;

    let cx = (wristX - xMin) / (xMax - xMin);
    let cy = (wristY - yMin) / (yMax - yMin);

    cx = Math.max(0, Math.min(1, cx));
    cy = Math.max(0, Math.min(1, cy));

    // Mirror horizontal camera alignment for natural aiming feel
    this.targetNdcCoords.x = (1 - cx) * 2 - 1;
    this.targetNdcCoords.y = -(cy * 2 - 1);
  }

  /**
   * Command to fire standard Laser bullet projectile.
   */
  shoot() {
    // Firing validation guard (cooldowns, reload cycles, meltdown overheats)
    if (this.isReloading || this.isOverheated || this.shootCooldownTimer > 0.0) {
      return;
    }

    // Set cooldown timer (300ms)
    this.shootCooldownTimer = this.shootCooldown;

    // Overheat logic: +20% heat per laser shot
    this.heat = Math.min(this.maxHeat, this.heat + this.heatPerShot);
    if (this.heat >= this.maxHeat) {
      this.isOverheated = true;
      this.overheatTimer = this.reloadDuration * 2.0; // Automatic reload is 2x reload duration (4.0s)
      console.log('%c[GunSystem] OVERHEAT MELTDOWN! Auto-reload lock triggered (4.0s).', 'color: #ff3b30; font-weight: bold;');
    }

    // Bullet physics launch
    // Spawn bullet slightly in front of player camera coordinates
    const startPos = this.camera.position.clone();
    
    // Direction vector points from camera origin to spatial crosshair coordinates
    const direction = new THREE.Vector3()
      .subVectors(this.crosshair.position, startPos)
      .normalize();

    // Spawn 3D bullet mesh (neon cyan sphere)
    const bulletGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe, // Cyan laser energy
      transparent: true,
      opacity: 0.9
    });
    const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);
    bulletMesh.position.copy(startPos);
    this.scene.add(bulletMesh);

    // Store bullet data
    this.bullets.push({
      mesh: bulletMesh,
      velocity: direction.clone().multiplyScalar(this.bulletSpeed),
      damage: this.damage,
      knockbackStrength: this.knockbackStrength,
      life: 2.5, // Dies after 2.5 seconds max
      homing: false // Standard straight trajectory
    });
  }

  /**
   * Command to reload and reset overheat levels.
   */
  reload() {
    if (this.isReloading) return;

    this.isReloading = true;
    this.reloadTimer = this.reloadDuration;
    console.log('[GunSystem] Overload cooling initiated. Loading ammo...');
  }

  /**
   * Framework interface structure to fetch homing target coordinate.
   * Finds the closest alive enemy.
   */
  getNearestEnemy(origin) {
    const enemies = this.gameWorld.enemyManager.getAliveEnemies();
    let closest = null;
    let minDist = Infinity;

    enemies.forEach((enemy) => {
      const dist = origin.distanceTo(enemy.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        closest = enemy;
      }
    });

    return closest;
  }

  /**
   * Core frame update.
   */
  update(deltaTime) {
    const currentState = this.app.stateManager.getState();
    const isPlaying = currentState === 'PLAYING';

    // 1. Manage HUD & Crosshair Visibility based on State
    if (this.hudEl) {
      this.hudEl.style.display = isPlaying ? 'block' : 'none';
    }
    if (this.crosshairDom && !isPlaying) {
      this.crosshairDom.style.display = 'none';
    }

    if (!isPlaying) return;

    // 2. Cooldowns & Overheat timers ticking
    if (this.shootCooldownTimer > 0.0) {
      this.shootCooldownTimer -= deltaTime;
    }

    if (this.isOverheated) {
      this.overheatTimer -= deltaTime;
      if (this.overheatTimer <= 0.0) {
        this.isOverheated = false;
        this.heat = 0.0; // Reset heat entirely after cooling period
        console.log('[GunSystem] Meltdown lockout cleared. Weapon operational.');
      }
    } else if (this.heat > 0.0) {
      // Natural passive cooling decay
      this.heat = Math.max(0.0, this.heat - this.heatDecayRate * deltaTime);
    }

    if (this.isReloading) {
      this.reloadTimer -= deltaTime;
      if (this.reloadTimer <= 0.0) {
        this.isReloading = false;
        this.heat = 0.0; // Clear heat on reload/cool
        console.log('[GunSystem] Overload cooling complete. Heat reset.');
      }
    }

    // 3. Update Aim Liveness Timeout & Coordinates Direct Copy
    if (this.activeAimTimeout > 0.0) {
      this.activeAimTimeout -= deltaTime;
      this.active = true;

      // Coordinates copy directly since GestureEngine already provides globally smoothed right thumb coordinates
      this.ndcCoords.copy(this.targetNdcCoords);
    } else {
      this.active = false;
    }

    // Project Right-Hand Aiming Vector (Raycast)
    if (this.active) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(this.ndcCoords, this.camera);

      // Intersect ground Y=0 plane
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const groundIntersect = new THREE.Vector3();
      const hasGroundHit = raycaster.ray.intersectPlane(groundPlane, groundIntersect);

      // Intersect dynamic enemies
      const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();
      let closestEnemy = null;
      let closestDistance = Infinity;

      // Determine default target point (fallback to 100 units far along the ray if pointing at the sky)
      const targetPoint = new THREE.Vector3();
      if (hasGroundHit) {
        targetPoint.copy(groundIntersect);
      } else {
        targetPoint.copy(raycaster.ray.direction).multiplyScalar(100.0).add(raycaster.ray.origin);
      }

      aliveEnemies.forEach((enemy) => {
        if (enemy.enemyMesh) {
          const hits = raycaster.intersectObject(enemy.enemyMesh);
          if (hits && hits.length > 0) {
            if (hits[0].distance < closestDistance) {
              closestDistance = hits[0].distance;
              closestEnemy = enemy;
              targetPoint.copy(hits[0].point);
            }
          }
        }
      });

      // Update virtual 3D target coordinates for bullets
      this.crosshair.position.copy(targetPoint);

      // Position the 2D DOM screen-space crosshair cursor
      if (this.crosshairDom) {
        const clientX = (this.ndcCoords.x + 1) * 0.5 * window.innerWidth;
        const clientY = (1 - this.ndcCoords.y) * 0.5 * window.innerHeight;
        this.crosshairDom.style.left = `${clientX}px`;
        this.crosshairDom.style.top = `${clientY}px`;
        this.crosshairDom.style.display = 'block';

        const barsH = this.crosshairDom.querySelector('.crosshair-bar-h');
        const barsV = this.crosshairDom.querySelector('.crosshair-bar-v');

        if (closestEnemy) {
          // Highlight RED when locked onto enemy body
          if (barsH) {
            barsH.style.background = '#ff3b30';
            barsH.style.boxShadow = '0 0 4px #ff3b30';
          }
          if (barsV) {
            barsV.style.background = '#ff3b30';
            barsV.style.boxShadow = '0 0 4px #ff3b30';
          }
          this.crosshairDom.style.transform = 'translate(-50%, -50%) scale(1.35)';
        } else {
          // Normal CYAN when aiming at ground / space
          if (barsH) {
            barsH.style.background = '#00f2fe';
            barsH.style.boxShadow = '0 0 4px #00f2fe';
          }
          if (barsV) {
            barsV.style.background = '#00f2fe';
            barsV.style.boxShadow = '0 0 4px #00f2fe';
          }
          this.crosshairDom.style.transform = 'translate(-50%, -50%) scale(1.0)';
        }
      }
    } else {
      if (this.crosshairDom) {
        this.crosshairDom.style.display = 'none';
      }
    }

    // 4. Update Bullet Projectiles and check bounding box hit registers
    const aliveEnemies = this.gameWorld.enemyManager.getAliveEnemies();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];

      // Homing trajectory vector steering
      if (bullet.homing) {
        const nearest = this.getNearestEnemy(bullet.mesh.position);
        if (nearest && nearest.enemyMesh) {
          const targetPos = new THREE.Vector3();
          nearest.enemyMesh.getWorldPosition(targetPos);
          const targetDir = new THREE.Vector3()
            .subVectors(targetPos, bullet.mesh.position)
            .normalize();
          
          // Steer velocity vector smoothly towards target position
          bullet.velocity.lerp(targetDir.multiplyScalar(this.bulletSpeed), deltaTime * 6.0)
            .normalize()
            .multiplyScalar(this.bulletSpeed);
        }
      }

      // Translate bullet mesh
      bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
      bullet.life -= deltaTime;

      // Query bounding box collisions
      let bulletDestroyed = false;
      for (let j = 0; j < aliveEnemies.length; j++) {
        const enemy = aliveEnemies[j];
        // Expanded bullet collision check (bullet collision radius of 1.2 units)
        if (enemy.boundingBox.distanceToPoint(bullet.mesh.position) <= 1.2) {
          // Resolve hit registry: apply damage and knockback vector
          const shootDirection = bullet.velocity.clone().normalize();
          const knockback = shootDirection.multiplyScalar(bullet.knockbackStrength);

          enemy.takeDamage(bullet.damage, bullet.mesh.position, knockback);
          bulletDestroyed = true;
          break;
        }
      }

      // Cleanup expired or collided bullets
      if (bulletDestroyed || bullet.life <= 0.0) {
        this.scene.remove(bullet.mesh);
        bullet.mesh.geometry.dispose();
        bullet.mesh.material.dispose();
        this.bullets.splice(i, 1);
      }
    }

    // 5. Update HTML HUD statistics
    this.updateHUDUI();
  }

  /**
   * Sync active stats to HTML elements.
   */
  updateHUDUI() {
    if (!this.hudEl) return;

    const ammoVal = this.hudEl.querySelector('#hud-ammo-val');
    const heatVal = this.hudEl.querySelector('#hud-heat-val');
    const heatBar = this.hudEl.querySelector('#hud-heat-bar');
    const indicator = this.hudEl.querySelector('#hud-overheat-indicator');

    if (ammoVal) {
      ammoVal.textContent = '∞ / ∞';
    }

    if (heatVal) heatVal.textContent = `${Math.round(this.heat)}%`;
    if (heatBar) heatBar.style.width = `${this.heat}%`;

    if (indicator) {
      if (this.isReloading) {
        indicator.textContent = '散熱裝填中 (2.0s)';
        indicator.style.color = '#00f2fe';
        indicator.style.background = 'rgba(0, 242, 254, 0.15)';
        indicator.style.borderColor = 'rgba(0, 242, 254, 0.3)';
        indicator.style.display = 'block';
      } else if (this.isOverheated) {
        indicator.textContent = '過熱熔斷中 (4.0s)';
        indicator.style.color = '#ff3b30';
        indicator.style.background = 'rgba(255, 59, 48, 0.15)';
        indicator.style.borderColor = 'rgba(255, 59, 48, 0.3)';
        indicator.style.display = 'block';
      } else if (this.heat > 75.0) {
        indicator.textContent = '溫度過高 (WARNING)';
        indicator.style.color = '#ff9f0a';
        indicator.style.background = 'rgba(255, 159, 10, 0.15)';
        indicator.style.borderColor = 'rgba(255, 159, 10, 0.3)';
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }
  }

  /**
   * Release resources and event listeners on teardown.
   */
  destroy() {
    console.log('[GunSystem] Cleaning up weapon and HUD overlays...');
    
    // 1. Remove HUD DOM node
    if (this.hudEl && this.hudEl.parentNode) {
      this.hudEl.parentNode.removeChild(this.hudEl);
    }

    // 2. Remove keyboard/mouse event listeners
    window.removeEventListener('mousemove', this.mouseMoveHandler);
    window.removeEventListener('mousedown', this.mouseDownHandler);
    window.removeEventListener('keydown', this.keyDownHandler);

    // 3. Remove 2D DOM crosshair cursor
    if (this.crosshairDom && this.crosshairDom.parentNode) {
      this.crosshairDom.parentNode.removeChild(this.crosshairDom);
    }

    // 4. Clear and dispose bullets
    this.bullets.forEach((bullet) => {
      this.scene.remove(bullet.mesh);
      bullet.mesh.geometry.dispose();
      bullet.mesh.material.dispose();
    });
    this.bullets = [];
  }
}
