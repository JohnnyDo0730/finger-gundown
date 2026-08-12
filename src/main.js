import { App } from './core/App.js';

// Initialize the game coordinator when the DOM is fully loaded.
window.addEventListener('DOMContentLoaded', () => {
  // Bind app instance to window for global debugging and stage transitions
  window.app = new App();
  
  // Set up standard interaction controls for state transition demonstration
  const setupStateControlHUD = () => {
    const buttons = {
      MENU: document.getElementById('btn-state-menu'),
      TEST_MODE: document.getElementById('btn-state-test'),
      PLAYING: document.getElementById('btn-state-playing'),
      PAUSED: document.getElementById('btn-state-paused'),
    };

    const statusBadge = document.getElementById('current-state-display');

    // Subscribe to state transitions to synchronize visual indicators
    window.app.stateManager.subscribe((newState) => {
      if (statusBadge) {
        statusBadge.textContent = newState;
        statusBadge.className = `state-badge state-${newState.toLowerCase()}`;
      }
      
      // Highlight the button corresponding to the current state
      Object.keys(buttons).forEach(state => {
        const btn = buttons[state];
        if (btn) {
          if (state === newState) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        }
      });
    });

    // Attach event listeners to buttons
    Object.keys(buttons).forEach(state => {
      const btn = buttons[state];
      if (btn) {
        btn.addEventListener('click', () => {
          window.app.stateManager.transitionTo(state);
        });
      }
    });
  };

  setupStateControlHUD();
});
