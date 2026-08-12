/**
 * StateManager - Core game state machine.
 * Defines and controls the transition between key game states:
 * ['MENU', 'TEST_MODE', 'PLAYING', 'PAUSED']
 */
export class StateManager {
  constructor() {
    this.states = Object.freeze({
      MENU: 'MENU',
      TEST_MODE: 'TEST_MODE',
      PLAYING: 'PLAYING',
      PAUSED: 'PAUSED'
    });

    this.currentState = this.states.MENU;
    this.listeners = new Set();
  }

  /**
   * Get the current active state.
   * @returns {string}
   */
  getState() {
    return this.currentState;
  }

  /**
   * Validate and transition to a new game state.
   * @param {string} newState - Target state to transition to.
   * @returns {boolean} True if transition succeeded, false otherwise.
   */
  transitionTo(newState) {
    if (!this.states[newState]) {
      console.error(`[StateManager] Transition rejected: State "${newState}" is undefined.`);
      return false;
    }

    if (this.currentState === newState) {
      return false; // Already in target state
    }

    // State Transition Guard Rules
    if (this.currentState === this.states.MENU && newState === this.states.PAUSED) {
      console.warn(`[StateManager] Invalid transition: Cannot go from MENU directly to PAUSED.`);
      return false;
    }

    const previousState = this.currentState;
    this.currentState = newState;
    
    console.log(`%c[StateManager] State Changed: ${previousState} -> ${newState}`, 'color: #00ffcc; font-weight: bold;');
    
    this.notify(newState, previousState);
    return true;
  }

  /**
   * Subscribe to state transition updates.
   * @param {function(string, string): void} callback - Callback called on transition with (newState, oldState).
   * @returns {function(): void} Unsubscribe function.
   */
  subscribe(callback) {
    this.listeners.add(callback);
    
    // Immediately fire once with current state to synchronize subsystem
    try {
      callback(this.currentState, null);
    } catch (err) {
      console.error(`[StateManager] Sync callback failed:`, err);
    }

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all registered subscribers.
   * @private
   */
  notify(newState, oldState) {
    for (const listener of this.listeners) {
      try {
        listener(newState, oldState);
      } catch (err) {
        console.error(`[StateManager] Notification failed for subscriber:`, err);
      }
    }
  }
}
