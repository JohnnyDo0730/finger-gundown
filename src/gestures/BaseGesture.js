/**
 * BaseGesture - Abstract base class for all gesture recognition algorithms.
 * Every concrete gesture implementation (e.g., Movement, Weapons fire) must extend this class.
 */
export class BaseGesture {
  /**
   * @param {string} name - Name of the gesture (e.g. 'FIRE', 'SWORD_SLASH')
   * @param {string} targetHand - Target hand to observe ('left', 'right', or 'both')
   */
  constructor(name, targetHand = 'right') {
    if (new.target === BaseGesture) {
      throw new TypeError("Cannot construct BaseGesture instances directly. Please subclass instead.");
    }
    this.name = name;
    this.targetHand = targetHand;
    this.isActive = false;
    this.confidence = 0.0;
  }

  /**
   * Main detection loop. Evaluates landmarks from MediaPipe.
   * Must be overridden in child classes.
   * 
   * @param {Array} landmarks - The hand landmarks array from MediaPipe.
   * @returns {{active: boolean, confidence: number}} The recognition status.
   */
  detect(landmarks) {
    throw new Error(`Method 'detect()' must be implemented by subclass: ${this.constructor.name}`);
  }

  /**
   * Tick update for tracking timelines, timers, or transitions.
   * @param {number} timestamp - Ellapsed time.
   */
  update(timestamp) {
    // Optional hook for subclasses to handle cooldowns, decay, or smoothing filters
  }

  /**
   * Reset gesture state (cooldowns, history buffers).
   */
  reset() {
    this.isActive = false;
    this.confidence = 0.0;
  }
}
