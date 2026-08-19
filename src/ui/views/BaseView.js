/**
 * BaseView - Abstract base class for all page views.
 * Defines the standard lifecycle contract for UI views.
 */
export class BaseView {
  /**
   * @param {App} app - Reference to the core App instance.
   */
  constructor(app) {
    if (new.target === BaseView) {
      throw new Error('[BaseView] Cannot instantiate BaseView directly.');
    }
    this.app = app;
    this.container = null;
    this.domElement = null;
  }

  /**
   * Initialize and mount the view's HTML elements inside the wrapper container.
   * Runs the view's entry transitions.
   * @param {HTMLElement} container - The parent container element.
   * @returns {Promise<void>} Resolves when the transition has finished.
   */
  async enter(container) {
    this.container = container;
    console.log(`[View] Entering ${this.constructor.name}`);
    
    this.domElement = this.createDOM();
    if (this.domElement) {
      this.container.appendChild(this.domElement);
      this.bindEvents();
      
      // Force double requestAnimationFrame to ensure the initial state is painted
      // by the browser's layout engine before transitioning to .view-active,
      // guaranteeing entry animations trigger reliably.
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (this.domElement) {
              this.domElement.classList.add('view-active');
            }
            resolve();
          });
        });
      });
    }
    
    return Promise.resolve();
  }

  /**
   * Play exit animations, detach listeners, and unmount the view's DOM elements.
   * @returns {Promise<void>} Resolves when the view is completely exited and removed.
   */
  async exit() {
    console.log(`[View] Exiting ${this.constructor.name}`);
    if (this.domElement) {
      this.domElement.classList.remove('view-active');
      this.domElement.classList.add('view-exiting');

      // Wait for exit animation to complete (usually around 300ms in style.css)
      return new Promise((resolve) => {
        const onTransitionEnd = (e) => {
          if (e.target === this.domElement) {
            this.domElement.removeEventListener('transitionend', onTransitionEnd);
            this.cleanup();
            resolve();
          }
        };
        this.domElement.addEventListener('transitionend', onTransitionEnd);
        
        // Safety timeout in case transitionend does not fire
        setTimeout(() => {
          this.cleanup();
          resolve();
        }, 950);
      });
    }
    return Promise.resolve();
  }

  /**
   * Abstract method to build the view's HTML elements.
   * @protected
   * @returns {HTMLElement} The root DOM node of the view.
   */
  createDOM() {
    throw new Error('[BaseView] Method createDOM() must be implemented by subclasses.');
  }

  /**
   * Abstract method to bind event listeners.
   * @protected
   */
  bindEvents() {
    // Subclasses override this to attach click / gesture listeners
  }

  /**
   * Optional frame update hook called on animation loop.
   * @param {number} timestamp - Total elapsed time in milliseconds.
   */
  update(timestamp) {
    // Subclasses override if dynamic rendering is needed per frame
  }

  /**
   * Clean up DOM elements, cancel tasks, and release listeners.
   */
  cleanup() {
    this.destroy();
    if (this.domElement && this.domElement.parentNode) {
      this.domElement.parentNode.removeChild(this.domElement);
    }
    this.domElement = null;
    this.container = null;
  }

  /**
   * Abstract method for additional custom resource cleanup.
   * @protected
   */
  destroy() {
    // Subclasses override to release extra textures, streams, listeners
  }
}
