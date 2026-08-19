import { StateManager } from './StateManager.js';
import { MenuManager } from '../ui/MenuManager.js';
import { VisionManager } from './VisionManager.js';
import { GestureEngine } from './GestureEngine.js';
import { GameWorld } from '../game/GameWorld.js';

/**
 * App - Central orchestrator for the gesture-controlled application.
 * Bootstraps core subsystems and coordinates communication based on states.
 */
export class App {
  constructor() {
    this.stateManager = new StateManager();
    this.visionManager = new VisionManager(this);
    this.gestureEngine = new GestureEngine();
    this.uiManager = new MenuManager(this);
    this.gameWorld = new GameWorld(this);
    
    // Animation frame handle
    this.rafHandle = null;
    
    this.init();
  }

  /**
   * Initialize systems and wire key callbacks.
   */
  init() {
    console.log('[App] Initializing app coordinators...');

    // Subscribe to state transitions to coordinate subsystem actions
    this.stateManager.subscribe((newState, oldState) => {
      this.handleStateChange(newState, oldState);
    });

    // Listen to Escape key to toggle pause between PLAYING and PAUSED states
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const curr = this.stateManager.getState();
        if (curr === 'PLAYING') {
          this.stateManager.transitionTo('PAUSED');
        } else if (curr === 'PAUSED') {
          this.stateManager.transitionTo('PLAYING');
        }
      }
    });

    // Wire ON_PAUSE gesture trigger
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

    // Feed camera tracking landmarks to the gesture engine
    if (this.visionManager) {
      this.visionManager.onResults((results) => {
        if (this.gestureEngine) {
          this.gestureEngine.processFrame(
            results.leftHandLandmarks,
            results.rightHandLandmarks,
            results.poseLandmarks
          );
        }
      });
    }

    this.startLoop();
  }

  /**
   * Coordinate subsystem modes on state change.
   */
  handleStateChange(newState, oldState) {
    console.log(`[App] Transitioning: ${oldState} -> ${newState}`);
    
    const requiresCamera = (state) => state === 'TEST_MODE' || state === 'PLAYING' || state === 'PAUSED';

    // Auto-stop camera tracking feed if exiting debug/play states and global control is off
    if (requiresCamera(oldState) && !requiresCamera(newState)) {
      if (this.visionManager && !this.visionManager.isGlobalEnabled) {
        console.log('[App] Stopping camera feed to release resource.');
        this.visionManager.stop();
      }
    }

    // Auto-start camera tracking feed if entering debug/play states
    if (requiresCamera(newState)) {
      if (this.visionManager) {
        this.visionManager.start().catch(err => {
          console.warn('[App] Camera auto-start failed:', err);
        });
      }
    }

    // Subsystem toggles based on states
    switch (newState) {
      case 'MENU':
        if (this.gestureEngine) this.gestureEngine.setMode('UI');
        if (this.gameWorld) {
          if (this.gameWorld.renderer && this.gameWorld.renderer.domElement) {
            this.gameWorld.renderer.domElement.style.display = 'none';
          }
          this.gameWorld.pauseSimulation();
          this.gameWorld.reset();
        }
        break;
      case 'PAUSED':
        if (this.gestureEngine) this.gestureEngine.setMode('UI');
        if (this.gameWorld) {
          if (this.gameWorld.renderer && this.gameWorld.renderer.domElement) {
            this.gameWorld.renderer.domElement.style.display = 'block';
          }
          this.gameWorld.pauseSimulation();
        }
        break;
      case 'TEST_MODE':
        if (this.gestureEngine) this.gestureEngine.setMode('DEBUG');
        if (this.gameWorld) {
          if (this.gameWorld.renderer && this.gameWorld.renderer.domElement) {
            this.gameWorld.renderer.domElement.style.display = 'none';
          }
          this.gameWorld.pauseSimulation();
          this.gameWorld.reset();
        }
        break;
      case 'PLAYING':
        if (this.gestureEngine) {
          this.gestureEngine.setMode('GAMEPLAY');
          const selected = localStorage.getItem('gesture_selected_weapon') || 'pistol';
          this.gestureEngine.setWeaponMode(selected);
        }
        if (this.gameWorld) {
          if (this.gameWorld.renderer && this.gameWorld.renderer.domElement) {
            this.gameWorld.renderer.domElement.style.display = 'block';
          }
          this.gameWorld.resumeSimulation();
        }
        break;
    }
  }

  /**
   * Start frame update loops.
   */
  startLoop() {
    const loop = (timestamp) => {
      this.update(timestamp);
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  /**
   * Destroy frame updates (cleanup).
   */
  stopLoop() {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
    }
  }

  /**
   * Frame update. Executes ticks.
   */
  update(timestamp) {
    if (this.uiManager) {
      this.uiManager.update(timestamp);
    }
    if (this.gameWorld) {
      this.gameWorld.update(timestamp);
    }
  }
}
