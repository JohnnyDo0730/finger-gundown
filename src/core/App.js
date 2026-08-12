import { StateManager } from './StateManager.js';
import { GestureTestWindow } from '../ui/GestureTestWindow.js';
import { MenuManager } from '../ui/MenuManager.js';
import { GestureEngine } from '../gestures/GestureEngine.js';

/**
 * App - Central orchestrator for the Web 3D gesture-control game.
 * Bootstraps subsystems and coordinates communication based on current states.
 */
export class App {
  constructor() {
    this.stateManager = new StateManager();
    this.gestureEngine = new GestureEngine();
    this.gestureTestWindow = new GestureTestWindow(this);
    this.uiManager = new MenuManager(this);
    
    // Subsystem instances placeholders (to be instantiated in stages 2-5)
    this.cameraController = null;
    this.gameManager = null;

    // Animation frame handle
    this.rafHandle = null;
    
    this.init();
  }

  /**
   * Initialize systems and wire callbacks.
   */
  init() {
    console.log('[App] Initializing game application...');

    // Subscribe to state machine changes to trigger module actions
    this.stateManager.subscribe((newState, oldState) => this.handleStateChange(newState, oldState));
    
    // Listen to pause gestures to toggle between PLAYING and PAUSED states
    if (this.gestureEngine) {
      this.gestureEngine.addEventListener('ON_PAUSE', () => {
        const curr = this.stateManager.getState();
        if (curr === 'PLAYING') {
          this.stateManager.transitionTo('PAUSED');
        } else if (curr === 'PAUSED') {
          this.stateManager.transitionTo('PLAYING');
        }
      });
    }

    // Start main game loop (it will handle conditional logic based on states)
    this.startLoop();
  }

  /**
   * Handle game state transition events.
   * @param {string} newState 
   * @param {string} oldState 
   */
  handleStateChange(newState, oldState) {
    console.log(`[App] Transitioning from ${oldState} to ${newState}`);
    
    // Deactivate test window tracking when exiting TEST_MODE
    if (oldState === 'TEST_MODE' && this.gestureTestWindow) {
      this.gestureTestWindow.hide();
    }

    switch (newState) {
      case 'MENU':
        this.onEnterMenu();
        break;
      case 'TEST_MODE':
        this.onEnterTestMode();
        break;
      case 'PLAYING':
        this.onEnterPlaying();
        break;
      case 'PAUSED':
        this.onEnterPaused();
        break;
    }
  }

  /** State transition lifecycles */
  
  onEnterMenu() {
    // 1. Show Main Menu UI
    if (this.uiManager) this.uiManager.showMenu();
    
    // 2. Camera or gestures: Idle / UI selection gestures only
    if (this.gestureEngine) this.gestureEngine.setMode('UI');
    
    // 3. Stop active gameplay simulation but keep rendering background
    if (this.gameManager) this.gameManager.pauseSimulation();
  }

  onEnterTestMode() {
    // 1. Show Debug/Test Overlay
    if (this.uiManager) this.uiManager.showDebugOverlay();

    // 2. Open the diagnostic test window and start tracking
    if (this.gestureTestWindow) {
      this.gestureTestWindow.show();
    }
    
    // 3. Gesture engine: full visualization output
    if (this.gestureEngine) this.gestureEngine.setMode('DEBUG');
  }

  onEnterPlaying() {
    // 1. Hide menu overlays, show game HUD
    if (this.uiManager) this.uiManager.showGameHUD();

    // 2. Resume or Start game loop/physics
    if (this.gameManager) this.gameManager.resumeSimulation();

    // 3. Set gesture recognition to gameplay action mode
    if (this.gestureEngine) this.gestureEngine.setMode('GAMEPLAY');
  }

  onEnterPaused() {
    // 1. Show Pause UI overlay
    if (this.uiManager) this.uiManager.showPauseMenu();

    // 2. Freeze physics and game updates
    if (this.gameManager) this.gameManager.pauseSimulation();
  }

  /**
   * Start requestAnimationFrame loop.
   */
  startLoop() {
    const loop = (timestamp) => {
      this.update(timestamp);
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  /**
   * Stop loop (if app is destroyed).
   */
  stopLoop() {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
    }
  }

  /**
   * Frame update. Executes logic according to active state.
   * @param {number} timestamp - Total elapsed time in milliseconds.
   */
  update(timestamp) {
    const currentState = this.stateManager.getState();
    
    // 1. Always update UI manager (animations/transitions)
    if (this.uiManager) this.uiManager.update(timestamp);

    // 2. Conditional updates based on state
    if (currentState === 'PLAYING') {
      // Run Three.js rendering and game physics loop
      if (this.gameManager) this.gameManager.update(timestamp);
      
      // Update gesture recognition
      if (this.gestureEngine) this.gestureEngine.update(timestamp);
    } 
    else if (currentState === 'TEST_MODE') {
      // Just update camera feed and gesture visualizer
      if (this.gestureEngine) this.gestureEngine.update(timestamp);
    }
  }
}
