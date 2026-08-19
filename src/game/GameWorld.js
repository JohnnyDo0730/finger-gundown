const THREE = window.THREE;
import { PlayerController } from './PlayerController.js';
import { EnemyManager } from './EnemyManager.js';
import { ActionHelper } from './ActionHelper.js';
import { GameUIManager } from '../ui/GameUIManager.js';

/**
 * GameWorld - Central orchestrator for the Three.js 3D space, renderer, lights,
 * combat arena grid floor, and updates.
 */
export class GameWorld {
  /**
   * @param {App} app - Reference to the core App instance
   */
  constructor(app) {
    this.app = app;
    this.isSimulationPaused = true;

    // 3D Scene Core Setup
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;

    // Lights references
    this.ambientLight = null;
    this.dirLight = null;
    this.pointLight = null;

    // Controllers/Managers
    this.playerController = null;
    this.enemyManager = null;
    this.actionHelper = null;
    this.gameUIManager = null;

    this.init();
    window.gameWorld = this; // Expose globally for testing/verification
  }

  /**
   * Initialize Three.js scene, camera, lights, floor, and managers.
   */
  init() {
    console.log('[GameWorld] Initializing 3D battle arena...');

    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf1f3f5); // Soft neutral light gray-white
    this.scene.fog = new THREE.FogExp2(0xf1f3f5, 0.008); // Horizon fog matching light gray background

    // 2. Create Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // 3. Create WebGL Renderer with transparency
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Standard positioning to slide WebGL canvas behind dashboard overlays
    this.renderer.domElement.id = 'game-canvas-3d';
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100vw';
    this.renderer.domElement.style.height = '100vh';
    this.renderer.domElement.style.zIndex = '0'; // Placed behind HUD overlays
    this.renderer.domElement.style.pointerEvents = 'none'; // Clicks fall through to DOM buttons

    document.body.appendChild(this.renderer.domElement);

    // 4. Setup Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.dirLight.position.set(40, 80, 40);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 250;

    const d = 110;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.pointLight = new THREE.PointLight(0xffffff, 0.3, 120);
    this.pointLight.position.set(-40, 40, -40);
    this.scene.add(this.pointLight);

    // 5. Setup Arena Floor (200x200 Plane)
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xeaeaea,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid helper overlay
    const gridHelper = new THREE.GridHelper(200, 100, 0x888888, 0xcccccc);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // 6. Instantiate ActionHelper
    this.actionHelper = new ActionHelper(this.app, this);

    // 7. Instantiate PlayerController Camera wrapper
    this.playerController = new PlayerController(this.camera, this.app, this);
    this.app.cameraController = this.playerController; // Expose to App coordinator

    // 8. Instantiate EnemyManager
    this.enemyManager = new EnemyManager(this.app, this);

    // 9. Instantiate GameUIManager
    this.gameUIManager = new GameUIManager(this.app);

    this.clock = new THREE.Clock();

    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);
  }

  handleResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resumeSimulation() {
    this.isSimulationPaused = false;
    if (this.clock) {
      this.clock.getDelta(); // Consume time gap
    }
    if (this.gameUIManager) {
      this.gameUIManager.show(true);
    }
    console.log('[GameWorld] Simulation resumed.');
  }

  pauseSimulation() {
    this.isSimulationPaused = true;
    if (this.gameUIManager) {
      this.gameUIManager.show(false);
    }
    console.log('[GameWorld] Simulation paused.');
  }

  update(timestamp) {
    if (!this.clock || !this.renderer) return;

    let deltaTime = this.clock.getDelta();
    if (deltaTime > 0.1) {
      deltaTime = 0.1;
    }

    if (!this.isSimulationPaused) {
      if (this.playerController) this.playerController.update(deltaTime);
      if (this.enemyManager) this.enemyManager.update(deltaTime);
      if (this.actionHelper) this.actionHelper.update(deltaTime);
      if (this.gameUIManager) this.gameUIManager.update(deltaTime, this.playerController);
    }

    this.renderer.render(this.scene, this.camera);
  }

  reset() {
    console.log('[GameWorld] Resetting game world state...');
    
    if (this.playerController) {
      this.playerController.reset();
    }

    if (this.enemyManager) {
      this.enemyManager.clearAll();
      this.enemyManager.enemyIdCounter = 0;
      this.enemyManager.init();
    }

    if (this.actionHelper) {
      this.actionHelper.clearAll();
    }
  }

  destroy() {
    console.log('[GameWorld] Tearing down 3D environment...');
    
    if (this.enemyManager) {
      this.enemyManager.clearAll();
    }

    if (this.actionHelper) {
      this.actionHelper.clearAll();
    }

    if (this.gameUIManager) {
      this.gameUIManager.destroy();
    }

    window.removeEventListener('resize', this.resizeHandler);

    if (this.renderer && this.renderer.domElement) {
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}
