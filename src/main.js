import { App } from './core/App.js';

// Initialize the game coordinator when the DOM is fully loaded.
window.addEventListener('DOMContentLoaded', () => {
  // Bind app instance to window for global debugging and stage transitions
  window.app = new App();
});
