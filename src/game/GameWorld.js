import { PlayerController } from './PlayerController.js';

const THREE = window.THREE;

/**
 * GameWorld - Central manager for Three.js 3D space, renderer, lights,
 * combat arena grid floor, and updates.
 */
export class GameWorld {
  /**
   * @param {App} app - Reference to the core App instance
   */
  constructor(app) {
    this.app = app;
    this.isSimulationPaused = true; // Paused until explicitly entered PLAYING state

    // 3D Scene Core Setup
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.playerController = null;
    this.clock = null;

    // Lights references
    this.ambientLight = null;
    this.dirLight = null;
    this.pointLight = null;

    this.init();
  }

  /**
   * Initialize Three.js scene, camera, lights, mesh floor, and controllers.
   */
  init() {
    console.log('[GameWorld] Initializing 3D battle arena...');

    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf1f3f5); // Soft neutral light gray-white (not blinding)
    this.scene.fog = new THREE.FogExp2(0xf1f3f5, 0.008); // Horizon fog matching light gray background

    // 2. Create Camera (FOV: 75, Near: 0.1, Far: 1000)
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // 3. Create WebGL Renderer with transparency support
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Standard positioning to slide WebGL canvas behind the dashboard overlays
    this.renderer.domElement.id = 'game-canvas-3d';
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100vw';
    this.renderer.domElement.style.height = '100vh';
    this.renderer.domElement.style.zIndex = '0'; // Placed behind relative/absolute HUDs (z-index 10+)
    this.renderer.domElement.style.pointerEvents = 'none'; // Allow clicks to fall through to DOM buttons if needed

    document.body.appendChild(this.renderer.domElement);

    // 4. Setup Lighting for Bright White-Gray Blueprint Style
    // Ambient light - Bright neutral ambient
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    // Directional light - Bright white main light
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.dirLight.position.set(40, 80, 40);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 250;

    // Fit shadow camera frustum bounds to the 200x200 arena size
    const d = 110;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    // Point Light - Soft white secondary light
    this.pointLight = new THREE.PointLight(0xffffff, 0.3, 120);
    this.pointLight.position.set(-40, 40, -40);
    this.scene.add(this.pointLight);

    // 5. Setup Arena Environment (200x200 floor grid, bounds: -100 to 100)
    // Clean off-white floor mesh to receive shadows
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xeaeaea, // Light gray/off-white floor
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid helper overlay - Medium gray lines for grid visibility on light floor
    // Divisions = 100 lines (every 2 units has a grid line)
    const gridHelper = new THREE.GridHelper(200, 100, 0x888888, 0xcccccc);
    gridHelper.position.y = 0.01; // Avoid Z-fighting overlay artifacts
    this.scene.add(gridHelper);

    // 6. Instantiate PlayerController Camera wrapper
    this.playerController = new PlayerController(this.camera, this.app);
    this.app.cameraController = this.playerController; // Expose to App coordinator

    // 7. Setup clock tracker
    this.clock = new THREE.Clock();

    // 8. Bind resize events
    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Handle camera aspect ratio and renderer resizing.
   */
  handleResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Transition state to resume simulation and physical updates.
   */
  resumeSimulation() {
    this.isSimulationPaused = false;
    // Consume clock delta to prevent massive movements caused by paused tab timeouts
    if (this.clock) {
      this.clock.getDelta();
    }
    console.log('[GameWorld] Simulation resumed.');
  }

  /**
   * Transition state to freeze movement but maintain visual render updates.
   */
  pauseSimulation() {
    this.isSimulationPaused = true;
    console.log('[GameWorld] Simulation paused.');
  }

  /**
   * Main game tick. Updates controllers and renders active scene.
   * @param {number} timestamp - Total elapsed time.
   */
  update(timestamp) {
    if (!this.clock || !this.renderer) return;

    // Get time elapsed since last tick (seconds)
    let deltaTime = this.clock.getDelta();

    // Clamp delta time to avoid coordinate explosion during performance drops
    if (deltaTime > 0.1) {
      deltaTime = 0.1;
    }

    // 1. Run physical gameplay changes (player positioning, etc.) if unpaused
    if (!this.isSimulationPaused && this.playerController) {
      this.playerController.update(deltaTime);
    }

    // 2. Render current WebGL viewport frame (runs constantly in background to keep screen fluid)
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Dispose WebGL context and remove mounted elements.
   */
  destroy() {
    console.log('[GameWorld] Tearing down 3D environment...');
    window.removeEventListener('resize', this.resizeHandler);

    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Traverse scene to dispose geometries and materials
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
