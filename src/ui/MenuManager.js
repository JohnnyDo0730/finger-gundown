import { MainMenuView } from './views/MainMenuView.js';
import { WeaponsView } from './views/WeaponsView.js';
import { GestureTestView } from './views/GestureTestView.js';
import { PauseView } from './views/PauseView.js';

/**
 * MenuManager - Central UI viewport container & view router.
 * Subscribes to StateManager transitions and coordinates page lifecycle hooks.
 * Emulates custom virtual hand-tracking cursor hover/click interactions.
 */
export class MenuManager {
  /**
   * @param {App} app - Reference to the core App instance.
   */
  constructor(app) {
    this.app = app;
    this.overlayEl = null;
    this.cursorEl = null;
    this.currentView = null;
    this.viewContainerEl = null;

    // Pointer Emulation state
    this.clickCooldown = false;
    this.lastHoveredElement = null;
    this.lastMouseMoveTime = 0;

    // Calibration coordinates (Comfortable viewport bounds)
    this.calib_xMin = 0.15;
    this.calib_xMax = 0.85;
    this.calib_yMin = 0.20;
    this.calib_yMax = 0.80;

    this.init();
  }

  init() {
    this.createDOM();
    this.createLoaderDOM();
    this.createHUDDOM();
    this.createIrisDOM();
    this.loadCalibrationData();

    // Listen to physical mouse movement to auto-hide virtual cursor
    window.addEventListener('mousemove', () => {
      this.lastMouseMoveTime = Date.now();
    });

    // Subscribe to StateManager changes to coordinate UI views
    this.app.stateManager.subscribe((newState, oldState) => {
      this.handleStateChange(newState, oldState);
    });

    // Subscribe to state machine transitions to show/hide the HUD widget
    this.app.stateManager.subscribe((newState) => {
      if (this.hudWidget) {
        if (newState === 'MENU' || newState === 'PAUSED') {
          this.hudWidget.classList.remove('hud-hidden');
        } else {
          this.hudWidget.classList.add('hud-hidden');
        }
      }
    });

    // Subscribe to VisionManager status changes
    if (this.app.visionManager) {
      this.app.visionManager.onStatusChange = (status) => {
        this.updateHUDWidgetStatus(status.isActive, status.isMediaPipeActive);
      };
      // Init status display
      this.updateHUDWidgetStatus(this.app.visionManager.isActive, this.app.visionManager.isMediaPipeActive);
    }

    // Subscribe to GestureEngine aim and fire events to drive virtual cursor
    if (this.app.gestureEngine) {
      this.lastPinchState = false;
      this.app.gestureEngine.addEventListener('ON_AIM', (data) => {
        if (data.active) {
          this.updateGestureCursor(data.wristX, data.wristY, this.lastPinchState);
        } else {
          this.updateGestureCursor(undefined, undefined, false);
        }
      });
      this.app.gestureEngine.addEventListener('ON_FIRE', (data) => {
        this.lastPinchState = data.active;
      });
    }
  }

  /**
   * Dynamically build Menu DOM shells.
   */
  createDOM() {
    // Menu backdrop overlay shell
    this.overlayEl = document.getElementById('game-menu-overlay');
    if (!this.overlayEl) {
      this.overlayEl = document.createElement('div');
      this.overlayEl.id = 'game-menu-overlay';
      this.overlayEl.className = 'menu-overlay';
      document.body.appendChild(this.overlayEl);
    }

    // View contents container
    this.viewContainerEl = this.overlayEl.querySelector('#view-container');
    if (!this.viewContainerEl) {
      this.viewContainerEl = document.createElement('div');
      this.viewContainerEl.id = 'view-container';
      this.viewContainerEl.className = 'view-container';
      this.overlayEl.appendChild(this.viewContainerEl);
    }

    // Virtual cursor element
    this.cursorEl = document.getElementById('gesture-cursor');
    if (!this.cursorEl) {
      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'gesture-cursor';
      this.cursorEl.className = 'gesture-cursor';
      document.body.appendChild(this.cursorEl);
    }
  }

  /**
   * Load stored calibration coordinates.
   */
  loadCalibrationData() {
    this.calib_xMin = parseFloat(localStorage.getItem('gesture_calib_xMin')) || 0.15;
    this.calib_xMax = parseFloat(localStorage.getItem('gesture_calib_xMax')) || 0.85;
    this.calib_yMin = parseFloat(localStorage.getItem('gesture_calib_yMin')) || 0.20;
    this.calib_yMax = parseFloat(localStorage.getItem('gesture_calib_yMax')) || 0.80;
  }

  /**
   * Handle StateManager changes by transitioning to target views.
   */
  async handleStateChange(newState, oldState) {
    console.log(`[MenuManager] State transition intercepted: ${oldState} -> ${newState}`);

    // Toggle pause overlay style class
    if (newState === 'PAUSED') {
      this.overlayEl.classList.add('paused-mode');
    } else if (newState !== 'PLAYING') {
      // Don't remove it instantly if going to PLAYING, to prevent black snap during slide out!
      this.overlayEl.classList.remove('paused-mode');
    }

    switch (newState) {
      case 'MENU':
        this.overlayEl.classList.add('active');
        await this.transitionToView(MainMenuView);
        if (this.isIrisClosed) {
          await this.openIrisExit();
        }
        break;

      case 'TEST_MODE':
        this.overlayEl.classList.add('active');
        await this.transitionToView(GestureTestView);
        if (this.isIrisClosed) {
          await this.openIrisExit();
        }
        break;

      case 'PAUSED':
        this.overlayEl.classList.add('active');
        await this.transitionToView(PauseView);
        break;

      case 'PLAYING':
        // Transition out of any menu/UI view overlay smoothly
        if (this.currentView) {
          const viewToExit = this.currentView;
          this.currentView = null; // Clear active reference instantly to prevent async race conditions during rapid triggers
          await viewToExit.exit();
        }
        this.overlayEl.classList.remove('active');
        // Delay removal of paused-mode class until the overlay opacity fade-out transition is completely finished (400ms)
        setTimeout(() => {
          this.overlayEl.classList.remove('paused-mode');
        }, 500);
        if (this.cursorEl) {
          this.cursorEl.classList.remove('active');
        }
        if (this.isIrisClosed) {
          await this.openIrisEnter();
        }
        break;
    }
  }

  /**
   * Route and swap view components with exit/enter transitions.
   * Runs exit and enter animations in parallel to support seamless overlay transitions.
   * @param {typeof BaseView} ViewClass - The class constructor of the target view.
   */
  async transitionToView(ViewClass) {
    // If a view of the same type is already showing, skip
    if (this.currentView && this.currentView instanceof ViewClass) {
      return;
    }

    const oldView = this.currentView;

    // Check if we are exiting a view that activates camera tracking and global tracking is disabled
    const isExitingCameraView = oldView && (
      oldView.constructor.name === 'GestureTestView' ||
      oldView.constructor.name === 'GameView' ||
      oldView.constructor.name === 'PlayingView'
    );
    const isGlobalDisabled = localStorage.getItem('gesture_control_enabled') !== 'true';

    if (isExitingCameraView && isGlobalDisabled) {
      // Run normal exit transitions (collapsing sidebars and fading center panel) and wait for completion
      if (oldView) {
        await oldView.exit();
      }
      // Reload page to flush Wasm heap/WebGL contexts completely
      location.reload();
      // Return a pending promise to prevent mounting new views before the page reloads
      return new Promise(() => {});
    }

    let exitPromise = Promise.resolve();
    if (oldView) {
      exitPromise = oldView.exit(); // Triggers exit animation & removes element from DOM on resolve
    }

    // Instantiate and mount the new view immediately, overlapping with the exiting view
    const newView = new ViewClass(this.app);
    this.currentView = newView;
    const enterPromise = newView.enter(this.viewContainerEl); // Triggers enter animation immediately

    // Execute transitions concurrently to achieve seamless cross-fade overlay
    await Promise.all([exitPromise, enterPromise]);
  }

  /**
   * Frame tick update loop (optional animations or dynamic updates).
   */
  update(timestamp) {
    if (this.currentView && typeof this.currentView.update === 'function') {
      this.currentView.update(timestamp);
    }
  }

  /**
   * Translate hand tracking coordinates (normalized 0-1) to UI cursor clicks.
   * Universal pointer simulation logic (Proposal 3).
   */
  updateGestureCursor(cursorX, cursorY, isPinching) {
    const currentState = this.app.stateManager.getState();
    const isUIState = currentState === 'MENU' || currentState === 'TEST_MODE' || currentState === 'PAUSED';

    // Hide virtual cursor if mouse was active recently, or if we are not in a UI state
    const mouseActiveThreshold = 1500;
    const isMouseActive = (Date.now() - this.lastMouseMoveTime) < mouseActiveThreshold;

    if (isMouseActive || !isUIState || cursorX === undefined || cursorY === undefined) {
      if (this.cursorEl) {
        this.cursorEl.classList.remove('active');
      }
      if (this.lastHoveredElement) {
        this.lastHoveredElement.classList.remove('gesture-hover');
        this.lastHoveredElement = null;
      }
      return;
    }

    // Coordinates are already mapped to 0-1 viewport by GestureEngine
    const screenX = cursorX * window.innerWidth;
    const screenY = cursorY * window.innerHeight;

    // 2. Position cursor element
    if (this.cursorEl) {
      this.cursorEl.style.left = `${screenX}px`;
      this.cursorEl.style.top = `${screenY}px`;
      this.cursorEl.classList.add('active');
    }

    // 3. Emulate Hover: Find element under cursor
    const rawTarget = document.elementFromPoint(screenX, screenY);

    // Traverse upwards from leaf element to find closest interactive node
    let targetNode = null;
    if (rawTarget) {
      let curr = rawTarget;
      while (curr && curr !== document.body) {
        if (
          curr.tagName === 'BUTTON' ||
          curr.tagName === 'A' ||
          (curr.classList && curr.classList.contains('clickable')) ||
          (curr.classList && curr.classList.contains('weapon-item')) ||
          (curr.classList && curr.classList.contains('hive-node'))
        ) {
          targetNode = curr;
          break;
        }
        if (window.getComputedStyle(curr).cursor === 'pointer') {
          // If parent also inherits/has pointer cursor, keep traversing to target the parent container
          const parent = curr.parentNode;
          if (parent && window.getComputedStyle(parent).cursor === 'pointer') {
            curr = parent;
            continue;
          }
          targetNode = curr;
          break;
        }
        curr = curr.parentNode;
      }
    }

    // Sync hover states and fire mouseenter/mouseleave events
    if (targetNode !== this.lastHoveredElement) {
      if (this.lastHoveredElement) {
        this.lastHoveredElement.classList.remove('gesture-hover');
        this.lastHoveredElement.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
      }
      if (targetNode) {
        targetNode.classList.add('gesture-hover');
        targetNode.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      }
      this.lastHoveredElement = targetNode;
    }

    // 4. Emulate Click: Trigger click event on pinch
    if (this.cursorEl) {
      if (isPinching) {
        this.cursorEl.classList.add('pinched');

        if (!this.clickCooldown) {
          this.clickCooldown = true;

          if (this.lastHoveredElement) {
            console.log(`[MenuManager] Emulating click on: ${this.lastHoveredElement.id || this.lastHoveredElement.className}`);
            
            // Trigger quick click visual shrink effect
            const clickedNode = this.lastHoveredElement;
            clickedNode.classList.add('virtual-clicked');
            setTimeout(() => clickedNode.classList.remove('virtual-clicked'), 150);

            // Dispatch standard click event
            const clickEvent = new MouseEvent('click', {
              clientX: screenX,
              clientY: screenY,
              bubbles: true,
              cancelable: true,
              view: window
            });
            clickedNode.dispatchEvent(clickEvent);
          }

          // Debounce delay to prevent multiple accidental triggerings
          setTimeout(() => {
            this.clickCooldown = false;
          }, 800);
        }
      } else {
        this.cursorEl.classList.remove('pinched');
      }
    }
  }

  /**
   * Create the full-screen neural interface loading overlay.
   */
  createLoaderDOM() {
    if (document.getElementById('neural-loader')) return;

    this.loaderOverlay = document.createElement('div');
    this.loaderOverlay.id = 'neural-loader';
    this.loaderOverlay.className = 'neural-loader-overlay hidden';

    this.loaderOverlay.innerHTML = `
      <div class="loader-bg-grid"></div>
      <div class="loader-content">
        <div class="loader-glitch-text" data-text="NEURAL FEED LINKING">NEURAL FEED LINKING</div>
        <div class="loader-sub-text">CONNECTING NEURAL FEED... LOADING MEDIAPIPE CORE...</div>
        <div class="loader-bar-container">
          <div class="loader-progress-bar"></div>
        </div>
      </div>
    `;

    document.body.appendChild(this.loaderOverlay);
  }

  /**
   * Create the bottom-right status toggle widget and instructions guide modal.
   */
  createHUDDOM() {
    if (document.getElementById('gesture-toggle-widget')) return;

    // 1. Create Floating Status Widget
    this.hudWidget = document.createElement('div');
    this.hudWidget.id = 'gesture-toggle-widget';
    this.hudWidget.className = 'gesture-toggle-widget';
    
    this.hudWidget.innerHTML = `
      <button class="gesture-widget-guide-btn" id="gesture-widget-guide-btn">
        <span style="margin-right: 6px;">ℹ</span>使用與設定指引
      </button>
      <div class="gesture-widget-row">
        <label class="gesture-switch">
          <input type="checkbox" id="gesture-toggle-checkbox">
          <span class="gesture-slider"></span>
        </label>
        <span class="gesture-widget-label">啟用手勢操作</span>
      </div>
      <div class="gesture-widget-status">
        <span class="status-dot-widget" id="gesture-widget-status-dot"></span>
        <span id="gesture-widget-status-text">手勢狀態：未啟用</span>
      </div>
    `;
    document.body.appendChild(this.hudWidget);

    // Cache elements inside the widget
    this.hudCheckbox = this.hudWidget.querySelector('#gesture-toggle-checkbox');
    this.hudStatusDot = this.hudWidget.querySelector('#gesture-widget-status-dot');
    this.hudStatusText = this.hudWidget.querySelector('#gesture-widget-status-text');

    // 2. Create Instructions Modal Overlay
    this.guideModal = document.createElement('div');
    this.guideModal.id = 'gesture-guide-modal';
    this.guideModal.className = 'gesture-guide-modal';
    
    this.guideModal.innerHTML = `
      <div class="gesture-guide-content">
        <div class="gesture-guide-header">
          <h3>使用與設定指引 (User Guide)</h3>
          <button id="btn-close-guide" class="close-guide-btn">&times;</button>
        </div>
        <div class="gesture-guide-body">
          <div class="guide-step">
            <span class="step-num">1</span>
            <div class="step-text">
              <strong>前往功能測試與教學</strong>
              <p>請先前往「操作測試與手勢教學」頁面，熟悉基本的移動搖桿、選單游標與 Pinch 捏合點擊等基礎操作。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">2</span>
            <div class="step-text">
              <strong>鏡頭設置與環境調整</strong>
              <p>在測試頁面調整相機亮度與對比度，使背景清晰。理想拍攝環境應避免強烈逆光或局部過曝（過曝會使手部邊緣模糊），且背景中儘量不要有其他人影或雜物干擾，以確保手勢精準辨識。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">3</span>
            <div class="step-text">
              <strong>活動區間與舒適度校正</strong>
              <p>切換至測試頁的定位校準分頁，依照提示在您手部擺動最舒適的四個角落進行捏合錄製，讓系統校準您的手勢穩定辨識區間，精準映射至整個螢幕邊界。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">4</span>
            <div class="step-text">
              <strong>練習槍械與技能手勢</strong>
              <p>在不同類別下練習並熟悉各類別手勢動作（例如比讚舉槍瞄準、扣指射擊、握拳蓄力、雙手三角形大招等）。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">5</span>
            <div class="step-text">
              <strong>開啟手勢操作</strong>
              <p>勾選右下角的「啟用手勢操作」，即可將雙手手勢無縫應用於主選單與各頁面的虛擬游標控制與互動。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">6</span>
            <div class="step-text">
              <strong>閱讀武器技能說明</strong>
              <p>點選「武器選擇」頁面，可隨時查看每款雷射手槍、突擊步槍或魔法太刀的核心被動、主動技能與對應手勢。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">7</span>
            <div class="step-text">
              <strong>進入遊戲，享受冒險</strong>
              <p>一切準備就緒後，點擊「開始遊戲」投身戰場，盡情享受全身心沉浸的手勢射擊遊戲體驗！</p>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.guideModal);

    // Bind event listeners for the Modal Guide UI
    const guideBtn = this.hudWidget.querySelector('#gesture-widget-guide-btn');
    const closeBtn = this.guideModal.querySelector('#btn-close-guide');

    if (guideBtn) {
      guideBtn.addEventListener('click', () => {
        this.guideModal.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.guideModal.classList.remove('active');
      });
    }

    this.guideModal.addEventListener('click', (e) => {
      if (e.target === this.guideModal) {
        this.guideModal.classList.remove('active');
      }
    });

    // Check first-time user status to pop up the modal automatically
    const isFirstTime = localStorage.getItem('gesture_first_time_user') !== 'false';
    if (isFirstTime) {
      setTimeout(() => {
        if (this.guideModal) {
          this.guideModal.classList.add('active');
          localStorage.setItem('gesture_first_time_user', 'false');
        }
      }, 1000);
    }

    // Bind checkbox change event to trigger GESTURE CONTROL toggling
    if (this.hudCheckbox) {
      this.hudCheckbox.checked = this.app.visionManager.isGlobalEnabled;
      this.hudCheckbox.addEventListener('change', (e) => {
        this.app.visionManager.toggleGlobalEnabled();
      });
    }
  }

  /**
   * Update HUD status indicators and checkboxes based on active states,
   * and show/hide the neural loading blocker overlay.
   */
  updateHUDWidgetStatus(isActive, isMediaPipeActive) {
    if (this.hudCheckbox) {
      this.hudCheckbox.checked = this.app.visionManager.isGlobalEnabled;
    }

    // Toggle loader blocker screen visibility
    if (this.loaderOverlay) {
      if (isActive && !isMediaPipeActive) {
        this.loaderOverlay.classList.remove('hidden');
      } else {
        this.loaderOverlay.classList.add('hidden');
      }
    }

    if (!this.hudStatusDot || !this.hudStatusText) return;

    if (isMediaPipeActive) {
      this.hudStatusDot.className = 'status-dot-widget active';
      this.hudStatusText.textContent = '手勢狀態：分析中';
    } else if (isActive) {
      this.hudStatusDot.className = 'status-dot-widget initializing';
      this.hudStatusText.textContent = '手勢狀態：啟動中';
    } else {
      this.hudStatusDot.className = 'status-dot-widget';
      this.hudStatusText.textContent = '手勢狀態：未啟用';
    }
  }

  /**
   * Show a premium custom confirmation dialog in game UI style.
   * @param {string} message - The question text to display.
   * @param {function} onConfirm - Callback executed when OK is clicked.
   * @param {function} onCancel - Callback executed when Cancel/Close is clicked.
   */
  showConfirmModal(message, onConfirm, onCancel) {
    let modal = document.getElementById('confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'gesture-guide-modal';
      modal.innerHTML = `
        <div class="gesture-guide-content" style="width: 450px; height: auto; min-height: 200px; padding: 30px; display: flex; flex-direction: column; justify-content: space-between; gap: 24px; background: rgba(20, 21, 26, 0.9); border: 1px solid var(--glass-border); border-radius: 20px;">
          <div class="gesture-guide-header" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <h3 style="margin: 0; color: #fff; font-family: 'Rajdhani', sans-serif; font-size: 1.3rem; letter-spacing: 1px;">系統確認 (CONFIRMATION)</h3>
            <button id="btn-confirm-close" class="close-guide-btn" style="font-size: 1.5rem; color: var(--text-muted); background: transparent; border: none; cursor: pointer;">&times;</button>
          </div>
          <div style="font-size: 0.98rem; color: #f0f3ff; line-height: 1.6; text-align: center; font-weight: 500;" id="confirm-modal-text"></div>
          <div style="display: flex; gap: 20px; justify-content: center; width: 100%; margin-top: 10px;">
            <button id="btn-confirm-ok" class="menu-btn" style="flex: 1; height: 50px; border-color: rgba(0, 242, 254, 0.4); background: rgba(0, 242, 254, 0.12); font-size: 1.1rem; font-weight: bold; letter-spacing: 2px; margin: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px;"><span class="btn-glow"></span>確定</button>
            <button id="btn-confirm-cancel" class="menu-btn danger" style="flex: 1; height: 50px; font-size: 1.1rem; font-weight: bold; letter-spacing: 2px; margin: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px;">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-confirm-close').addEventListener('click', () => {
        modal.classList.remove('active');
        if (onCancel) onCancel();
      });
    }

    modal.querySelector('#confirm-modal-text').textContent = message;

    const okBtn = modal.querySelector('#btn-confirm-ok');
    const cancelBtn = modal.querySelector('#btn-confirm-cancel');

    // Clean old listeners by cloning
    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.addEventListener('click', () => {
      modal.classList.remove('active');
      if (onConfirm) onConfirm();
    });

    newCancel.addEventListener('click', () => {
      modal.classList.remove('active');
      if (onCancel) onCancel();
    });

    // Force a style reflow to ensure CSS transitions trigger on first mount
    modal.offsetHeight;
    modal.classList.add('active');
  }

  /**
   * Create dynamically the Iris transition overlay in the DOM.
   */
  createIrisDOM() {
    this.irisEl = document.getElementById('iris-transition-overlay');
    if (!this.irisEl) {
      this.irisEl = document.createElement('div');
      this.irisEl.id = 'iris-transition-overlay';
      this.irisEl.style.position = 'fixed';
      this.irisEl.style.top = '0';
      this.irisEl.style.left = '0';
      this.irisEl.style.width = '100vw';
      this.irisEl.style.height = '100vh';
      this.irisEl.style.zIndex = '99999';
      this.irisEl.style.pointerEvents = 'none';
      this.irisEl.style.display = 'none';
      document.body.appendChild(this.irisEl);
    }
  }

  /**
   * Parse hex or rgb color strings into rgb objects.
   */
  parseColor(colorStr) {
    if (colorStr.startsWith('#')) {
      const hex = colorStr.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b };
    }
    if (colorStr.startsWith('rgb')) {
      const parts = colorStr.match(/\d+/g);
      if (parts && parts.length >= 3) {
        return { r: parseInt(parts[0]), g: parseInt(parts[1]), b: parseInt(parts[2]) };
      }
    }
    return { r: 8, g: 9, b: 13 }; // fallback `#08090d`
  }

  /**
   * Smoothly animates a radial-gradient circle mask on the iris overlay.
   * Employs cubic ease-in-out curve for premium organic feel.
   */
  animateIris(x, y, startRad, endRad, duration, startColor, endColor, isHollow) {
    return new Promise((resolve) => {
      this.irisEl.style.display = 'block';
      this.irisEl.style.opacity = '1';
      const startTime = performance.now();
      const c1 = this.parseColor(startColor);
      const c2 = this.parseColor(endColor);

      const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        
        // Cubic ease-in-out easing curve for smoother, more deliberate pacing
        const ease = progress < 0.5 
          ? 4 * progress * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        
        const currentRadius = startRad + (endRad - startRad) * ease;
        
        const r = Math.round(c1.r + (c2.r - c1.r) * ease);
        const g = Math.round(c1.g + (c2.g - c1.g) * ease);
        const b = Math.round(c1.b + (c2.b - c1.b) * ease);
        const currentColor = `rgb(${r},${g},${b})`;

        if (isHollow) {
          this.irisEl.style.background = `radial-gradient(circle ${currentRadius}px at ${x}px ${y}px, transparent 99%, ${currentColor} 100%)`;
        } else {
          this.irisEl.style.background = `radial-gradient(circle ${currentRadius}px at ${x}px ${y}px, ${currentColor} 99%, transparent 100%)`;
        }

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }

  /**
   * Hollow circle exit: shrinks transparent hole to cover the screen.
   * Returns a Promise that resolves when screen is fully covered by black.
   */
  closeIrisExit() {
    this.isIrisClosed = true;
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const maxRadius = Math.max(window.innerWidth, window.innerHeight) * 0.8;
    const startColor = '#08090d'; // deep space background color
    
    return this.animateIris(x, y, maxRadius, 0, 1000, startColor, startColor, true); // Slowed to 1000ms
  }

  /**
   * Hollow circle exit: expands transparent hole back to reveal the screen.
   */
  openIrisExit() {
    this.isIrisClosed = false;
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const maxRadius = Math.max(window.innerWidth, window.innerHeight) * 0.8;
    const startColor = '#08090d';
    
    return this.animateIris(x, y, 0, maxRadius, 1400, startColor, startColor, true).then(() => { // Slowed to 1400ms
      this.irisEl.style.display = 'none';
    });
  }

  /**
   * Solid circle enter: expands solid button colored circle to cover screen.
   * Initial color is the button hover style color `#2a2c35`.
   * Color transitions to game floor color `#f1f3f5` at end of expansion.
   */
  closeIrisEnter(x, y) {
    this.isIrisClosed = true;
    const maxRadius = Math.max(window.innerWidth, window.innerHeight) * 1.5;
    const startColor = '#2a2c35'; // button hover background color (dark gray)
    const endColor = '#f1f3f5';   // floor color (light gray)

    return this.animateIris(x, y, 0, maxRadius, 1400, startColor, endColor, false); // Slowed to 1400ms
  }

  /**
   * Solid circle enter: fades out the solid floor color to reveal the 3D scene.
   */
  openIrisEnter() {
    this.isIrisClosed = false;
    return new Promise((resolve) => {
      this.irisEl.style.transition = 'opacity 1.0s ease'; // Slowed fade to 1.0s
      this.irisEl.style.opacity = '0';
      
      setTimeout(() => {
        this.irisEl.style.display = 'none';
        this.irisEl.style.opacity = '1';
        this.irisEl.style.transition = '';
        resolve();
      }, 1000);
    });
  }
}
