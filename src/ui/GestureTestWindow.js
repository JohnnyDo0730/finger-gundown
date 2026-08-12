import { ActionConfig } from '../core/WeaponConfig.js';

/**
 * GestureTestWindow - Concurrent Dual-Hand Diagnostic Studio.
 * Implements a premium floating 5-block layout: Top tabs selector, Left hand detections card stack,
 * Right hand detections card stack, Center video/canvas viewport, and Bottom navigation.
 */
export class GestureTestWindow {
  /**
   * @param {App} app - Reference to the core App instance.
   */
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    
    // Load last persistent tab selection or default to 'basic'
    this.activeTestMode = localStorage.getItem('gesture_studio_active_tab') || 'basic';

    // Load last persistent video feed toggle or default to false (show skeleton only by default)
    const storedVideoSetting = localStorage.getItem('gesture_studio_show_video');
    this.showVideoFeed = storedVideoSetting === 'true'; // default to false if not found or 'false'

    this.latestResults = null;
    this.recordedPoses = this.loadRecordedPoses();
    
    // Flag to split webcam camera connection vs. actual MediaPipe model activation
    this.isMediaPipeActive = false;

    // Cache for hand detection events
    this.gestureData = {
      moveX: 0,
      moveY: 0,
      isAiming: false,
      isFiring: false,
      isReloaded: false,
      isReloadActive: false,
      isPaused: false,
      isPauseActive: false,
      lastSlash: null,
      
      // Interface connections placeholders
      isRightSkillActive: false,
      isRightSkillTriggered: false,
      isRightSyncUltActive: false,
      isRightSyncUltTriggered: false,
      isLeftUltActive: false,
      isLeftUltTriggered: false,
      isLeftAimActive: false,
      syncAimZoom: 1.0,
      syncAimDeltaX: 0,
      syncAimDeltaY: 0
    };

    // Subscribed event handles
    this.cameraStream = null;

    // Off-screen processing canvas for brightness/contrast pre-filter
    this.processCanvas = document.createElement('canvas');
    this.processCanvas.width = 640;
    this.processCanvas.height = 480;
    this.processCtx = this.processCanvas.getContext('2d');

    // Camera visual filter (brightness + contrast, saved to localStorage)
    this.camBrightness = parseInt(localStorage.getItem('gesture_cam_brightness') || '100', 10);
    this.camContrast  = parseInt(localStorage.getItem('gesture_cam_contrast')  || '110', 10);

    this.createDOM();
    this.setupStyles();
    this.bindEvents();
    this.updateModeVisibility();
  }

  /**
   * Register logic listeners to receive events from GestureEngine.
   */
  setupGestureEngineListeners() {
    const engine = this.app.gestureEngine;
    if (!engine) return;

    engine.addEventListener('ON_MOVE', (data) => {
      this.gestureData.moveX = data.moveX;
      this.gestureData.moveY = data.moveY;
    });

    engine.addEventListener('ON_AIM', (data) => {
      this.gestureData.isAiming = data.active;
      if (data.active) this.gestureData.isFiring = false;
    });

    engine.addEventListener('ON_FIRE', (data) => {
      this.gestureData.isAiming = false;
      this.gestureData.isFiring = data.active;
      if (data.active) {
        // Auto-reset trigger state after 150ms for visual flash
        setTimeout(() => {
          this.gestureData.isFiring = false;
        }, 150);
      }
    });

    engine.addEventListener('ON_RELOAD', () => {
      this.gestureData.isReloaded = true;
      setTimeout(() => {
        this.gestureData.isReloaded = false;
      }, 1200);
    });

    engine.addEventListener('ON_RELOAD_STATE', (data) => {
      this.gestureData.isReloadActive = data.active;
    });

    engine.addEventListener('ON_PAUSE', () => {
      this.gestureData.isPaused = true;
      setTimeout(() => {
        this.gestureData.isPaused = false;
      }, 1200);
    });

    engine.addEventListener('ON_PAUSE_STATE', (data) => {
      this.gestureData.isPauseActive = data.active;
    });

    engine.addEventListener('ON_SLASH', (data) => {
      this.gestureData.lastSlash = {
        dirX: data.dirX,
        dirY: data.dirY,
        speed: data.speed,
        time: Date.now()
      };
    });

    // Custom listeners for newly implemented charging skills and ultimates
    engine.addEventListener('ON_SKILL', () => {
      this.gestureData.isRightSkillTriggered = true;
      setTimeout(() => {
        this.gestureData.isRightSkillTriggered = false;
      }, 1200);
    });

    engine.addEventListener('ON_SKILL_STATE', (data) => {
      this.gestureData.isRightSkillActive = data.active;
    });

    engine.addEventListener('ON_ULT', () => {
      this.gestureData.isRightSyncUltTriggered = true;
      setTimeout(() => {
        this.gestureData.isRightSyncUltTriggered = false;
      }, 1200);
    });

    engine.addEventListener('ON_ULT_STATE', (data) => {
      this.gestureData.isRightSyncUltActive = data.active;
    });

    // Scoping sync aim scoping events listener
    engine.addEventListener('ON_SYNC_AIM', (data) => {
      this.gestureData.isLeftAimActive = data.active;
      this.gestureData.syncAimZoom = data.zoom;
      this.gestureData.syncAimDeltaX = data.deltaX;
      this.gestureData.syncAimDeltaY = data.deltaY;
    });
  }

  /**
   * Dynamically build the floating layout blocks and append to document body.
   */
  createDOM() {
    if (document.getElementById('gesture-test-modal')) return;

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'gesture-test-modal';
    this.overlayEl.className = 'gesture-test-overlay hidden';

    this.overlayEl.innerHTML = `
      <!-- Block 3: Top Center Header (Tab Switches) -->
      <div id="floating-panel-top" class="floating-panel top-panel">
        <div class="panel-header-compact">類別測試選擇</div>
        <div class="tabs-list">
          <button class="mode-tab-btn active" data-mode="basic">測試基礎手勢</button>
          <button class="mode-tab-btn" data-mode="ranged">測試槍械手勢</button>
          <button class="mode-tab-btn" data-mode="melee">測試技能手勢</button>
          <button class="mode-tab-btn dev-tab" data-mode="record">手勢錄入 (開發者)</button>
        </div>
      </div>

      <!-- Block 4: Left Column Panel (Left Hand Gestures) -->
      <div id="floating-panel-left" class="floating-panel side-panel left-panel test-panel-scroll">
        <div class="side-panel-title">◀ 左手偵測項目 (Left Hand)</div>
        
        <!-- Left Hand Cards -->
        <div class="gesture-card" id="card-left-joystick">
          <h4>移動搖桿 <span class="status-dot"></span></h4>
          <p>前進 (前傾掌) / 後退 (握拳) / 左右偏擺</p>
          <div class="joystick-wrapper">
            <canvas id="left-joystick-canvas" width="110" height="110"></canvas>
          </div>
        </div>

        <div class="gesture-card" id="card-left-pause">
          <h4>暫停遊戲 <span class="status-dot"></span></h4>
          <p>五指平伸且完全併攏，維持 1.0 秒</p>
          <div class="card-status-text">等待左手偵測...</div>
        </div>

        <div class="gesture-card" id="card-left-aim">
          <h4>瞄準輔助 (同步) <span class="status-dot"></span></h4>
          <p>比 OK 手勢進入瞄準，貼近/張開中指調節倍率</p>
          <div class="card-status-text">等待左手偵測...</div>
        </div>

        <div class="gesture-card" id="card-left-ult">
          <h4>蓄力大招 (雙手同步) <span class="status-dot"></span></h4>
          <p>雙手合攏呈三角形，維持 2.0 秒</p>
          <div class="card-status-text">等待左手偵測...</div>
        </div>
      </div>

      <!-- Block 1: Center Viewport Panel (Video Stream & Skeletons) -->
      <div id="floating-panel-center" class="floating-panel center-panel">
        <div class="center-controls-bar">
          <button id="btn-toggle-video" class="view-ctrl-btn">顯示視訊</button>
          <button id="btn-toggle-skeleton" class="view-ctrl-btn">僅顯示骨架</button>
          <div class="cam-filter-group">
            <label class="cam-filter-label">☀ 亮度<span id="brightness-val">100</span>%</label>
            <input type="range" id="slider-brightness" class="cam-filter-slider" min="50" max="200" step="5" value="100">
          </div>
          <div class="cam-filter-group">
            <label class="cam-filter-label">◑ 對比<span id="contrast-val">110</span>%</label>
            <input type="range" id="slider-contrast" class="cam-filter-slider" min="50" max="200" step="5" value="110">
          </div>
          <button id="btn-reset-filters" class="cam-reset-btn">↺ 預設</button>
        </div>
        
        <div class="viewport-box">
          <span id="camera-status-label" class="camera-status">狀態：等待連接相機...</span>
          <video id="test-video" class="test-video-feed" autoplay playsinline muted></video>
          <canvas id="test-canvas" class="test-canvas-feed"></canvas>
        </div>

        <!-- Inline Developer Recorder (Displays in Center when record tab is active) -->
        <div id="recorder-controls-panel" class="developer-record-panel hidden">
          <h4>手勢姿勢記錄器 (Developer Pose Recorder)</h4>
          <div class="record-input-group">
            <input type="text" id="record-pose-name" placeholder="請輸入當前姿勢名稱 (例如: 右手-開槍)">
            <button id="btn-record-pose" class="record-btn">錄製當前格</button>
          </div>
          <div class="record-stats">
            目前已錄製格數：<span id="record-pose-count" style="color:#ff007f; font-weight:bold;">0</span>
          </div>
          <div class="record-actions">
            <button id="btn-download-poses" class="action-btn download-btn">下載 JSON 檔案</button>
            <button id="btn-clear-poses" class="action-btn clear-btn">清除全部暫存</button>
          </div>
          <textarea id="record-preview-box" class="preview-box" readonly>尚無錄製紀錄。請輸入名稱並點選「錄製當前格」。</textarea>
        </div>

        <!-- Interactive Guide text (for modes) -->
        <div id="calibration-guide-container" class="calibration-panel">
          <!-- Guide content injected dynamically -->
        </div>
      </div>

      <!-- Block 5: Right Column Panel (Right Hand Gestures) -->
      <div id="floating-panel-right" class="floating-panel side-panel right-panel test-panel-scroll">
        <div class="side-panel-title">右手偵測項目 (Right Hand) ▶</div>
        
        <!-- Right Hand Cards (Re-ordered to group weapon behaviors cleanly) -->
        <div class="gesture-card" id="card-right-cursor">
          <h4>選單游標座標 <span class="status-dot"></span></h4>
          <p>食指尖指向螢幕，映射游標位置</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-pinch">
          <h4>Pinch 捏合點擊 <span class="status-dot"></span></h4>
          <p>食指與大拇指捏合以點擊按鈕</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-gun">
          <h4>舉槍與發射 <span class="status-dot"></span></h4>
          <p>比讚舉槍(Aim) / 食指扣動開槍(Fire)</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-reload">
          <h4>換彈手勢 (Reload) <span class="status-dot"></span></h4>
          <p>翻轉右手呈手背朝前且食指伸直，維持 2.0 秒</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-sync-aim-fire">
          <h4>雙手聯動瞄準發射 <span class="status-dot"></span></h4>
          <p>左手瞄準時，右手移動操控視角方向</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-slash">
          <h4>揮舞攻擊 (近戰普攻) <span class="status-dot"></span></h4>
          <p>右手快速揮掃觸發斬擊或法球投擲</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-skill">
          <h4>蓄力技能 (單手) <span class="status-dot"></span></h4>
          <p>右手握拳背朝鏡頭拳朝上，維持 1.0 秒</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-sync-ult">
          <h4>蓄力大招 (雙手同步) <span class="status-dot"></span></h4>
          <p>雙手食指大拇指合攏比三角形，維持 2.0 秒</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>
      </div>

      <!-- Block 2: Bottom Center Panel (Exit Button) -->
      <div id="floating-panel-bottom" class="floating-panel bottom-panel">
        <button id="btn-return-menu" class="long-nav-btn">返回選單</button>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    // Bind DOM Caches
    this.topPanelEl = this.overlayEl.querySelector('#floating-panel-top');
    this.leftPanelEl = this.overlayEl.querySelector('#floating-panel-left');
    this.centerPanelEl = this.overlayEl.querySelector('#floating-panel-center');
    this.rightPanelEl = this.overlayEl.querySelector('#floating-panel-right');
    this.bottomPanelEl = this.overlayEl.querySelector('#floating-panel-bottom');

    this.videoEl = this.overlayEl.querySelector('#test-video');
    this.canvasEl = this.overlayEl.querySelector('#test-canvas');
    this.ctx = this.canvasEl.getContext('2d');

    // Apply saved brightness/contrast filter to the visible video feed immediately
    this.videoEl.style.filter = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
    this.videoEl.style.webkitFilter = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
    
    this.closeBtnEl = this.overlayEl.querySelector('#btn-return-menu');
    this.cameraStatusEl = this.overlayEl.querySelector('#camera-status-label');
    this.calibrationGuideEl = this.overlayEl.querySelector('#calibration-guide-container');

    // Dev pose record panel bindings
    this.recorderPanelEl = this.overlayEl.querySelector('#recorder-controls-panel');
    this.recordBtn = this.overlayEl.querySelector('#btn-record-pose');
    this.downloadBtn = this.overlayEl.querySelector('#btn-download-poses');
    this.clearBtn = this.overlayEl.querySelector('#btn-clear-poses');
    this.poseNameInput = this.overlayEl.querySelector('#record-pose-name');
    this.recordCountEl = this.overlayEl.querySelector('#record-pose-count');
    this.previewBoxEl = this.overlayEl.querySelector('#record-preview-box');

    // Unify all card titles and description texts dynamically from ActionConfig
    Object.keys(ActionConfig).forEach(id => {
      const card = this.overlayEl.querySelector(`#card-${id}`);
      if (card) {
        const titleEl = card.querySelector('h4');
        const descEl = card.querySelector('p');
        const configItem = ActionConfig[id];
        
        if (titleEl && configItem.name) {
          // Keep the status-dot element intact if present
          const dot = titleEl.querySelector('.status-dot');
          titleEl.textContent = configItem.name + ' ';
          if (dot) titleEl.appendChild(dot);
        }
        if (descEl && configItem.description) {
          descEl.textContent = configItem.description;
        }
      }
    });
  }

  /**
   * Append style rules for premium futuristic transparent floating panels.
   * Aligned all panels bottom edges flush at 830px to comfortably fit all cards.
   */
  setupStyles() {
    if (document.getElementById('gesture-test-window-styles')) return;

    const style = document.createElement('style');
    style.id = 'gesture-test-window-styles';
    style.textContent = `
      .gesture-test-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: var(--bg-deep-space);
        z-index: 1000;
        overflow: hidden;
        font-family: 'Outfit', 'Inter', sans-serif;
      }
      .gesture-test-overlay.hidden {
        display: none !important;
      }

      /* Floating panels tokens */
      .floating-panel {
        background: var(--glass-surface);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border-radius: 20px;
        box-shadow: var(--drop-shadow-vr);
        position: absolute;
        box-sizing: border-box;
        transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .floating-panel:hover {
        border-color: var(--glass-border-light);
      }

      /* Positioning */
      .top-panel {
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 620px;
        height: 100px;
        padding: 10px 20px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        z-index: 105;
      }
      .panel-header-compact {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.95rem;
        color: var(--cyan-spatial);
        text-transform: uppercase;
        letter-spacing: 2px;
        font-weight: bold;
        text-align: center;
      }
      .tabs-list {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .mode-tab-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--glass-border);
        border-radius: 10px;
        color: var(--text-muted);
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        padding: 6px 16px;
        cursor: pointer;
        transition: all 0.25s ease;
      }
      .mode-tab-btn:hover {
        background: var(--glass-surface-hover);
        color: var(--text-main);
        border-color: var(--cyan-spatial);
        box-shadow: 0 0 10px rgba(0, 242, 254, 0.3);
      }
      .mode-tab-btn.active {
        background: rgba(0, 242, 254, 0.15);
        border-color: var(--cyan-spatial);
        color: var(--cyan-spatial);
        box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
      }
      .mode-tab-btn.dev-tab.active {
        background: rgba(255, 0, 127, 0.15);
        border-color: #ff007f;
        color: #ff007f;
        box-shadow: 0 0 15px rgba(255, 0, 127, 0.4);
      }



      /* Side panels - height increased to 860px to fit right-hand cards comfortably */
      .side-panel {
        top: 20px;
        width: 320px;
        height: 860px;
        padding: 16px 14px;
        z-index: 95;
        overflow-y: auto;
      }
      .test-panel-scroll::-webkit-scrollbar {
        width: 4px;
      }
      .test-panel-scroll::-webkit-scrollbar-thumb {
        background: rgba(0, 255, 204, 0.2);
        border-radius: 2px;
      }
      .left-panel {
        left: calc(50% - 310px - 320px - 20px);
      }
      .right-panel {
        right: calc(50% - 310px - 320px - 20px);
      }
      .side-panel-title {
        font-size: 0.95rem;
        font-weight: bold;
        color: #f0f3ff;
        margin-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .side-panel.hidden {
        display: none !important;
      }

      /* Center panel - height increased to 750px (ends at 880px, matching side panels bottom) */
      .center-panel {
        top: 130px;
        left: 50%;
        transform: translateX(-50%);
        width: 620px;
        height: 750px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 15px;
        z-index: 90;
      }
      .center-controls-bar {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .view-ctrl-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #8c9bb3;
        font-size: 0.85rem;
        padding: 5px 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .view-ctrl-btn.active {
        background: rgba(0, 255, 204, 0.1);
        border-color: rgba(0, 255, 204, 0.4);
        color: #00ffcc;
      }

      .viewport-box {
        height: 380px; /* Constant viewport height */
        width: 100%;
        background: #0e0f14;
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        overflow: hidden;
        position: relative;
      }
      .test-video-feed {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        object-fit: cover;
        transform: scaleX(-1);
        z-index: 1;
        opacity: 1;
        transition: opacity 0.3s;
      }
      .test-video-feed.hidden-feed {
        opacity: 0;
      }
      .test-canvas-feed {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        transform: scaleX(-1);
        z-index: 2;
      }
      .camera-status {
        position: absolute;
        bottom: 12px; left: 12px;
        background: rgba(24, 25, 30, 0.85);
        border: 1px solid var(--glass-border);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 0.82rem;
        font-family: 'Share Tech Mono', monospace;
        color: var(--cyan-spatial);
        z-index: 10;
        pointer-events: none;
      }

      /* Bottom panel - positioned closely beneath center panel at top 890px */
      .bottom-panel {
        top: 890px;
        left: 50%;
        transform: translateX(-50%);
        width: 620px;
        height: 60px;
        padding: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 105;
      }
      .long-nav-btn {
        width: 100%;
        height: 100%;
        background: rgba(255, 0, 127, 0.05);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        color: #ff007f;
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.05rem;
        font-weight: bold;
        letter-spacing: 2px;
        cursor: pointer;
        backdrop-filter: blur(8px);
        transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .long-nav-btn:hover {
        background: rgba(255, 0, 127, 0.15);
        border-color: #ff007f;
        box-shadow: 0 0 15px rgba(255, 0, 127, 0.3);
        transform: translateZ(5px) scale(1.02);
      }
      .long-nav-btn:active {
        transform: translateZ(2px) scale(0.98);
      }

      /* Gesture Cards list - Fine-tuned height, padding and margins for clean fit */
      .gesture-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 9px 13px;
        margin-bottom: 8px;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 52px;
        position: relative;
      }
      .gesture-card h4 {
        margin: 0;
        font-size: 0.98rem;
        color: #f0f3ff;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .gesture-card p {
        margin: 0;
        font-size: 0.7rem;
        color: var(--text-muted);
        line-height: 1.25;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        transition: all 0.3s;
      }
      .card-status-text {
        font-size: 0.76rem;
        font-family: 'Share Tech Mono', monospace;
        color: var(--text-muted);
        text-transform: uppercase;
        margin-top: 2px;
      }

      /* Card disabled state styling */
      .gesture-card.disabled-item {
        opacity: 0.25;
        filter: grayscale(0.9) blur(0.2px);
        pointer-events: none;
        border-style: solid;
        border-color: rgba(255, 255, 255, 0.04);
      }

      /* Suppressed card state (for animation lockout periods to avoid interfering with disabled-item) */
      .gesture-card.suppressed-item {
        opacity: 0.25;
        filter: grayscale(0.9) blur(0.2px);
        pointer-events: none;
        border-style: solid;
        border-color: rgba(255, 255, 255, 0.04);
      }

      /* Card themes */
      .gesture-card.ready {
        background: rgba(0, 242, 254, 0.03);
        border: 1px solid rgba(0, 242, 254, 0.22);
        box-shadow: 0 0 10px rgba(0, 242, 254, 0.06);
      }
      .gesture-card.ready h4 {
        color: var(--cyan-spatial);
      }
      .gesture-card.ready .status-dot {
        background: var(--cyan-spatial);
        box-shadow: 0 0 8px var(--cyan-spatial);
      }
      .gesture-card.ready .card-status-text {
        color: var(--cyan-spatial);
      }

      .gesture-card.charging {
        background: rgba(255, 183, 3, 0.06);
        border: 1px solid rgba(255, 183, 3, 0.35);
        box-shadow: 0 0 12px rgba(255, 183, 3, 0.12);
      }
      .gesture-card.charging h4 {
        color: var(--amber-warning);
      }
      .gesture-card.charging .status-dot {
        background: var(--amber-warning);
        box-shadow: 0 0 10px var(--amber-warning);
      }
      .gesture-card.charging .card-status-text {
        color: var(--amber-warning);
      }

      .gesture-card.active {
        background: rgba(6, 214, 160, 0.08);
        border: 1px solid rgba(6, 214, 160, 0.45);
        box-shadow: 0 0 15px rgba(6, 214, 160, 0.22);
      }
      .gesture-card.active h4 {
        color: var(--emerald-success);
      }
      .gesture-card.active .status-dot {
        background: var(--emerald-success);
        box-shadow: 0 0 10px var(--emerald-success);
      }
      .gesture-card.active .card-status-text {
        color: var(--emerald-success);
      }

      .gesture-card.danger {
        background: rgba(255, 0, 127, 0.08);
        border: 1px solid rgba(255, 0, 127, 0.45);
        box-shadow: 0 0 15px rgba(255, 0, 127, 0.18);
      }
      .gesture-card.danger h4 {
        color: #ff007f;
      }
      .gesture-card.danger .status-dot {
        background: #ff007f;
        box-shadow: 0 0 10px #ff007f;
      }
      .gesture-card.danger .card-status-text {
        color: #ff007f;
      }

      /* Joystick in card */
      .joystick-wrapper {
        margin-top: 6px;
        display: flex;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 8px;
        padding: 6px;
        border: 1px solid rgba(255,255,255,0.03);
      }

      /* Calibration instructions pane - Height set to 274px to fit guide perfectly without scrolling */
      .calibration-panel {
        background: rgba(28, 29, 36, 0.5);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 15px 18px;
        text-align: left;
        font-size: 0.85rem;
        height: 274px;
        box-sizing: border-box;
        overflow-y: auto;
      }
      .calibration-panel h4 {
        font-family: 'Rajdhani', sans-serif;
        color: var(--cyan-spatial);
        font-size: 1.05rem;
        margin: 0 0 10px 0;
        border-bottom: 1px solid rgba(0, 242, 254, 0.2);
        padding-bottom: 4px;
      }
      .calibration-list {
        list-style: none;
        padding: 0; margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: #8c9bb3;
      }
      .calibration-list li {
        font-size: 0.85rem;
      }
      .calibration-list li::before {
        content: "■";
        color: var(--cyan-spatial);
        font-size: 0.55rem;
        margin-right: 6px;
        vertical-align: middle;
      }

      /* Developer recording styling */
      .developer-record-panel {
        background: rgba(28, 29, 36, 0.5);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-align: left;
        height: 274px;
        box-sizing: border-box;
        overflow-y: auto;
      }
      .developer-record-panel h4 {
        color: #ff007f;
        font-size: 0.98rem;
        margin: 0;
        border-bottom: 1px solid rgba(255, 0, 127, 0.2);
        padding-bottom: 4px;
      }
      .record-input-group {
        display: flex;
        gap: 6px;
      }
      #record-pose-name {
        flex: 1;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #fff;
        padding: 6px 10px;
        font-size: 0.82rem;
        outline: none;
      }
      #record-pose-name:focus {
        border-color: #ff007f;
      }
      .record-btn {
        background: #ff007f;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        padding: 6px 12px;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .record-btn:hover {
        background: #e60073;
        box-shadow: 0 0 8px rgba(255, 0, 127, 0.3);
      }
      .record-stats {
        font-size: 0.82rem;
        color: #8c9bb3;
      }
      .record-actions {
        display: flex;
        gap: 6px;
      }
      .action-btn {
        flex: 1;
        border: none;
        border-radius: 6px;
        padding: 6px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .download-btn {
        background: rgba(0, 255, 204, 0.15);
        color: #00ffcc;
        border: 1px solid rgba(0, 255, 204, 0.3);
      }
      .download-btn:hover {
        background: rgba(0, 255, 204, 0.25);
      }
      .clear-btn {
        background: rgba(230, 57, 70, 0.15);
        color: #e63946;
        border: 1px solid rgba(230, 57, 70, 0.3);
      }
      .clear-btn:hover {
        background: rgba(230, 57, 70, 0.25);
      }
      .preview-box {
        width: 100%;
        height: 60px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 6px;
        color: #8c9bb3;
        font-family: monospace;
        font-size: 0.78rem;
        padding: 6px;
        box-sizing: border-box;
        resize: none;
      }
      .developer-record-panel.hidden {
        display: none !important;
      }
      .calibration-panel.hidden {
        display: none !important;
      }

      /* Camera filter sliders */
      .center-controls-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        padding: 6px 8px;
      }
      .cam-filter-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cam-filter-label {
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.78rem;
        color: rgba(0,255,204,0.75);
        white-space: nowrap;
        min-width: 76px;
      }
      .cam-filter-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 90px;
        height: 4px;
        border-radius: 2px;
        background: rgba(0,255,204,0.2);
        outline: none;
        cursor: pointer;
      }
      .cam-filter-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #00ffcc;
        box-shadow: 0 0 6px rgba(0,255,204,0.6);
        cursor: pointer;
      }
      .cam-reset-btn {
        padding: 3px 10px;
        background: rgba(255,0,127,0.08);
        border: 1px solid rgba(255,0,127,0.35);
        border-radius: 6px;
        color: #ff007f;
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.78rem;
        cursor: pointer;
        transition: background 0.2s;
        white-space: nowrap;
      }
      .cam-reset-btn:hover {
        background: rgba(255,0,127,0.22);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Bind DOM event listeners.
   */
  bindEvents() {
    // 1. Exit Test Mode button (Block 2 return menu button)
    this.closeBtnEl.addEventListener('click', () => {
      this.app.stateManager.transitionTo('MENU');
    });

    // 2. View Toggle buttons (Video feed vs Skeleton) with LocalStorage persistence
    const btnVideo = this.overlayEl.querySelector('#btn-toggle-video');
    const btnSkeleton = this.overlayEl.querySelector('#btn-toggle-skeleton');

    btnVideo.addEventListener('click', () => {
      btnVideo.classList.add('active');
      btnSkeleton.classList.remove('active');
      this.showVideoFeed = true;
      this.videoEl.classList.remove('hidden-feed');
      localStorage.setItem('gesture_studio_show_video', 'true');
    });

    btnSkeleton.addEventListener('click', () => {
      btnSkeleton.classList.add('active');
      btnVideo.classList.remove('active');
      this.showVideoFeed = false;
      this.videoEl.classList.add('hidden-feed');
      localStorage.setItem('gesture_studio_show_video', 'false');
    });

    // 3. Tab Buttons binding with LocalStorage persistence
    const tabBtns = this.overlayEl.querySelectorAll('.mode-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTestMode = btn.getAttribute('data-mode');
        localStorage.setItem('gesture_studio_active_tab', this.activeTestMode);
        this.updateModeVisibility();
        this.updateCalibrationGuide();
      });
    });

    // 4. Developer Pose Recorder buttons
    this.recordBtn.addEventListener('click', () => this.recordPoseCurrentFrame());
    this.downloadBtn.addEventListener('click', () => this.downloadPoses());
    this.clearBtn.addEventListener('click', () => this.clearPoses());

    // 5. Camera filter sliders (brightness & contrast)
    const sliderBrightness = this.overlayEl.querySelector('#slider-brightness');
    const sliderContrast   = this.overlayEl.querySelector('#slider-contrast');
    const valBrightness    = this.overlayEl.querySelector('#brightness-val');
    const valContrast      = this.overlayEl.querySelector('#contrast-val');

    // Restore saved values
    if (sliderBrightness) {
      sliderBrightness.value = this.camBrightness;
      if (valBrightness) valBrightness.textContent = this.camBrightness;
    }
    if (sliderContrast) {
      sliderContrast.value = this.camContrast;
      if (valContrast) valContrast.textContent = this.camContrast;
    }

    if (sliderBrightness) {
      sliderBrightness.addEventListener('input', () => {
        this.camBrightness = parseInt(sliderBrightness.value, 10);
        if (valBrightness) valBrightness.textContent = this.camBrightness;
        localStorage.setItem('gesture_cam_brightness', this.camBrightness);
        this._applyCamFilter();
      });
    }
    if (sliderContrast) {
      sliderContrast.addEventListener('input', () => {
        this.camContrast = parseInt(sliderContrast.value, 10);
        if (valContrast) valContrast.textContent = this.camContrast;
        localStorage.setItem('gesture_cam_contrast', this.camContrast);
        this._applyCamFilter();
      });
    }

    // Reset all filter sliders to factory defaults
    const btnReset = this.overlayEl.querySelector('#btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.camBrightness = 100;
        this.camContrast   = 110;
        if (sliderBrightness) sliderBrightness.value = 100;
        if (sliderContrast)   sliderContrast.value   = 110;
        if (valBrightness)    valBrightness.textContent = 100;
        if (valContrast)      valContrast.textContent   = 110;
        localStorage.setItem('gesture_cam_brightness', 100);
        localStorage.setItem('gesture_cam_contrast',   110);
        this._applyCamFilter();
      });
    }
  }

  /**
   * Apply current brightness/contrast values to both the visible video feed
   * and the off-screen processing canvas pipeline.
   * @private
   */
  _applyCamFilter() {
    const f = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
    if (this.videoEl) {
      this.videoEl.style.filter = f;
      this.videoEl.style.webkitFilter = f;
    }
  }

  /**
   * Show the visual studio overlays and initialize camera streams.
   */
  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlayEl.classList.remove('hidden');
    console.log('[GestureTestWindow] Floating Diagnostic studio initialized.');

    // Sync state listeners with current GestureEngine instance
    this.setupGestureEngineListeners();

    // Adjust canvas layout sizes
    this.resizeCanvas();
    window.addEventListener('resize', this.handleResize = () => this.resizeCanvas());

    // Draw initial centered joystick overlay
    this.drawJoystickOverlay(0, 0);

    // Synchronize loaded persistent settings to the buttons/views
    this.syncSettingsUI();
    this.updateModeVisibility();

    // Initalize guide text
    this.updateCalibrationGuide();

    // Start video tracking loop
    this.initMediaPipe();
  }

  /**
   * Sync active variables to layout button classes.
   */
  syncSettingsUI() {
    const btnVideo = this.overlayEl.querySelector('#btn-toggle-video');
    const btnSkeleton = this.overlayEl.querySelector('#btn-toggle-skeleton');

    if (this.showVideoFeed) {
      btnVideo.classList.add('active');
      btnSkeleton.classList.remove('active');
      this.videoEl.classList.remove('hidden-feed');
    } else {
      btnSkeleton.classList.add('active');
      btnVideo.classList.remove('active');
      this.videoEl.classList.add('hidden-feed');
    }

    // Sync active tab state
    const tabBtns = this.topPanelEl.querySelectorAll('.mode-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-mode') === this.activeTestMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Hide diagnostic panels and stop camera streams.
   */
  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlayEl.classList.add('hidden');
    console.log('[GestureTestWindow] Hiding Diagnostic studio.');

    window.removeEventListener('resize', this.handleResize);
    this.stopTracking();
  }

  /**
   * Handle layout dimensions synchronization.
   */
  resizeCanvas() {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    this.canvasEl.width = rect.width;
    this.canvasEl.height = rect.height;
  }

  /**
   * Async script downloader for MediaPipe modules.
   */
  async loadScripts() {
    if (window.Holistic && window.Camera) return;

    this.updateCameraStatus('正在加載 MediaPipe 模組資源...');

    const loadScript = (url) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = (e) => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(script);
    });

    try {
      if (!window.Camera) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      }
      if (!window.Holistic) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
      }
      console.log('[GestureTestWindow] Libraries linked.');
    } catch (err) {
      console.error('[GestureTestWindow] Libraries download failed:', err);
      this.updateCameraStatus('錯誤：MediaPipe 載入失敗！');
      throw err;
    }
  }

  /**
   * Feed camera frames into MediaPipe Holistic analyzer.
   */
  async initMediaPipe() {
    try {
      await this.loadScripts();

      if (!window.Holistic) {
        throw new Error('Holistic module undefined.');
      }

      this.updateCameraStatus('正在開啟視訊鏡頭...');

      const holistic = new window.Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      holistic.onResults((results) => this.onResults(results));

      this.cameraStream = new window.Camera(this.videoEl, {
        onFrame: async () => {
          if (this.isOpen) {
            // Apply brightness/contrast pre-filter to the off-screen canvas
            // then send that processed canvas to MediaPipe for better tracking
            this.processCtx.filter = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
            this.processCtx.drawImage(this.videoEl, 0, 0, 640, 480);
            this.processCtx.filter = 'none';
            await holistic.send({ image: this.processCanvas });
          }
        },
        width: 640,
        height: 480,
        // Request 60fps for smoother gesture tracking (browser will use best available)
        frameRate: { ideal: 60, min: 30 }
      });

      this.cameraStream.start()
        .then(() => {
          this.updateCameraStatus('相機已開啟，正在啟動手勢分析...');
        })
        .catch(err => {
          console.error('[GestureTestWindow] Camera failed:', err);
          this.updateCameraStatus('錯誤：相機鏡頭開啟失敗！請檢查權限。');
        });

      this.holisticInstance = holistic;

    } catch (err) {
      console.error('[GestureTestWindow] Initialization error:', err);
      this.updateCameraStatus('錯誤：系統初始化失敗！');
    }
  }

  /**
   * Stop cameras and destroy holistic objects.
   */
  stopTracking() {
    if (this.cameraStream) {
      try {
        const stream = this.videoEl.srcObject;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        this.videoEl.srcObject = null;
      } catch (e) {
        console.warn('Failed to stop webcam stream track directly:', e);
      }
      this.cameraStream = null;
    }

    this.isMediaPipeActive = false;

    if (this.holisticInstance) {
      try {
        this.holisticInstance.close();
      } catch (e) {
        console.warn('Failed to close holistic instance:', e);
      }
      this.holisticInstance = null;
    }
  }

  /**
   * Update webcam status string.
   */
  updateCameraStatus(text) {
    if (this.cameraStatusEl) {
      this.cameraStatusEl.textContent = `狀態：${text}`;
    }
  }

  /**
   * Update grayscaled panel elements according to active test mode.
   * Keeps enabled items in cyan glowing ready mode by default instead of looking disabled.
   * Keeps left and right panels always visible in developer recording tab, fully enabling all cards.
   */
  updateModeVisibility() {
    const mode = this.activeTestMode;

    // Update weapon/testing mode in the gesture engine dynamically
    if (this.app.gestureEngine) {
      if (mode === 'record') {
        this.app.gestureEngine.setWeaponMode('all');
      } else {
        this.app.gestureEngine.setWeaponMode(mode);
      }
    }
    
    // Left and right hand panels are now permanently visible across ALL modes (including record)
    this.leftPanelEl.classList.remove('hidden');
    this.rightPanelEl.classList.remove('hidden');

    if (mode === 'record') {
      this.recorderPanelEl.classList.remove('hidden');
      this.calibrationGuideEl.classList.add('hidden');
    } else {
      this.recorderPanelEl.classList.add('hidden');
      this.calibrationGuideEl.classList.remove('hidden');
    }

    // Toggle active classes on tab selector buttons
    const btns = this.topPanelEl.querySelectorAll('.mode-tab-btn');
    btns.forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Gray-out disabling matrix (All cards are fully enabled if mode is 'record')
    const availabilityMap = {
      // Left Hand
      'left-joystick': (mode === 'record' || mode === 'basic' || mode === 'ranged' || mode === 'melee'),
      'left-pause': (mode === 'record' || mode === 'basic' || mode === 'ranged' || mode === 'melee'),
      'left-aim': (mode === 'record' || mode === 'ranged'),
      'left-ult': (mode === 'record' || mode === 'ranged' || mode === 'melee'),

      // Right Hand
      'right-cursor': (mode === 'record' || mode === 'basic'),
      'right-pinch': (mode === 'record' || mode === 'basic'),
      'right-gun': (mode === 'record' || mode === 'ranged' || mode === 'melee'),
      'right-reload': (mode === 'record' || mode === 'ranged'),
      'right-sync-aim-fire': (mode === 'record' || mode === 'ranged'),
      'right-slash': (mode === 'record' || mode === 'melee'),
      'right-skill': (mode === 'record' || mode === 'ranged' || mode === 'melee'),
      'right-sync-ult': (mode === 'record' || mode === 'ranged' || mode === 'melee')
    };

    Object.keys(availabilityMap).forEach(id => {
      const el = this.overlayEl.querySelector(`#card-${id}`);
      if (el) {
        if (availabilityMap[id]) {
          el.classList.remove('disabled-item', 'suppressed-item');
          el.classList.add('ready'); // Always start glowing cyan if enabled in mode
          const statusText = el.querySelector('.card-status-text');
          if (statusText) {
            const side = id.startsWith('left') ? '左手' : '右手';
            statusText.textContent = `等待${side}偵測...`;
          }
        } else {
          el.classList.add('disabled-item');
          el.classList.remove('ready', 'active', 'danger', 'charging', 'suppressed-item');
          // Reset card styling if disabled by mode mapping
          el.className = 'gesture-card disabled-item';
          const dot = el.querySelector('.status-dot');
          if (dot) dot.style.backgroundColor = '';
          const statusText = el.querySelector('.card-status-text');
          if (statusText) statusText.textContent = '未啟用';
        }
      }
    });
  }

  /**
   * Render diagnostic overlays and process gesture engine data loops.
   */
  onResults(results) {
    if (!this.isOpen) return;

    // Transition from webcam connection to active tracking when the first results frame arrives
    if (!this.isMediaPipeActive) {
      this.isMediaPipeActive = true;
      this.updateCameraStatus('連線成功，手勢分析中...');
    }

    try {
      this.latestResults = results;
      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

      const w = this.canvasEl.width;
      const h = this.canvasEl.height;

      // Draw dark holographic grid in privacy mode
      if (!this.showVideoFeed) {
        this.ctx.fillStyle = '#060614';
        this.ctx.fillRect(0, 0, w, h);
        this.drawCyberGrid(w, h);
      }

      // Feed raw data to GestureEngine logic handler
      if (this.app.gestureEngine) {
        this.app.gestureEngine.processFrame(
          results.leftHandLandmarks,
          results.rightHandLandmarks,
          results.poseLandmarks
        );
      }

      // Draw skeleton joints overlays
      if (results.poseLandmarks) {
        this.drawPoseSkeleton(results.poseLandmarks, w, h);
      }

      if (results.leftHandLandmarks) {
        this.drawHandLandmarks(results.leftHandLandmarks, w, h, '#ff007f');
      }

      if (results.rightHandLandmarks) {
        this.drawHandLandmarks(results.rightHandLandmarks, w, h, '#00ffcc');
      }

      // Synchronize cards states inside side columns in real-time
      this.updateDiagnosticHUD(results);
    } catch (err) {
      console.error('[GestureTestWindow] Exception during onResults loop:', err);
    }
  }

  /**
   * Draw holographic lines for custom cyber grid.
   */
  drawCyberGrid(w, h) {
    this.ctx.strokeStyle = 'rgba(0, 255, 204, 0.04)';
    this.ctx.lineWidth = 1;
    const step = 45;
    for (let x = 0; x < w; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
  }

  /**
   * Sync active gesture engine event indicators to UI cards.
   * Leverages unified card state updates matrix to handle lockouts elegantly.
   */
  updateDiagnosticHUD(results) {
    const hasLeft = !!results.leftHandLandmarks;
    const hasRight = !!results.rightHandLandmarks;
    const mode = this.activeTestMode;

    // Check generic animation lockout states from the gesture engine
    const engine = this.app.gestureEngine;
    const isLocked = engine && (Date.now() < engine.animationLockEnd);
    const lockName = engine ? engine.activeAnimationName : '';
    const isSkillCharging = engine && (engine.chargeStarts.skill > 0);
    const isUltCharging = engine && (engine.chargeStarts.ult > 0);

    const isCardModeDisabled = (id) => {
      const el = this.overlayEl.querySelector(`#card-${id}`);
      return el && el.classList.contains('disabled-item');
    };

    /**
     * Helper to unifiedly resolve card styling under lockout/hand lost/active detection.
     */
    const updateCard = (id, callbackIfActive) => {
      const el = this.overlayEl.querySelector(`#card-${id}`);
      if (!el || isCardModeDisabled(id)) return;

      const txt = el.querySelector('.card-status-text');

      // --- 1. LOCKOUT MATRIX OVERRIDES ---
      if (isLocked) {
        // Pause is NEVER locked/suppressed!
        if (id === 'left-pause') {
          const side = 'left';
          const isDetected = hasLeft;
          if (!isDetected) {
            el.className = 'gesture-card ready';
            if (txt) txt.textContent = '等待左手偵測...';
          } else {
            callbackIfActive(el, txt);
          }
          return;
        }

        // Joystick is NEVER locked/suppressed during reload!
        if (id === 'left-joystick' && lockName === 'reload') {
          const side = 'left';
          const isDetected = hasLeft;
          if (!isDetected) {
            el.className = 'gesture-card ready';
            if (txt) txt.textContent = '等待左手偵測...';
            this.drawJoystickOverlay(0, 0);
          } else {
            callbackIfActive(el, txt);
          }
          return;
        }

        // Active locking card gets premium glow/danger states
        if (id === 'right-reload' && lockName === 'reload') {
          el.className = 'gesture-card active';
          if (txt) txt.textContent = '裝彈執行中...';
          return;
        }
        if (id === 'right-skill' && lockName === 'skill') {
          el.className = 'gesture-card danger';
          if (txt) txt.textContent = '技能執行中 (禁止移動)...';
          return;
        }
        if ((id === 'right-sync-ult' || id === 'left-ult') && lockName === 'ult') {
          el.className = 'gesture-card danger';
          if (txt) txt.textContent = '大招爆發中 (禁止移動)...';
          return;
        }
        if (id === 'left-joystick' && (lockName === 'skill' || lockName === 'ult')) {
          el.className = 'gesture-card suppressed-item';
          if (txt) txt.textContent = '施法中：移動鎖定';
          this.drawJoystickOverlay(0, 0);
          return;
        }

        // Other cards suppressed
        const isRangedCard = id === 'right-gun' || id === 'right-reload' || id === 'right-sync-aim-fire' || id === 'left-aim';
        const isMeleeCard = id === 'right-slash' || id === 'right-skill' || id === 'right-sync-ult' || id === 'left-ult';

        if (lockName === 'reload') {
          if (isRangedCard) {
            el.className = 'gesture-card suppressed-item';
            if (txt) txt.textContent = '裝彈中 (鎖定武器)...';
            return;
          }
        } else if (lockName === 'skill' || lockName === 'ult') {
          if (isMeleeCard || isRangedCard) {
            el.className = 'gesture-card suppressed-item';
            if (txt) txt.textContent = '施法中 (動作冷卻)...';
            return;
          }
        }

        // Generic suppression fallback
        el.className = 'gesture-card suppressed-item';
        if (txt) txt.textContent = '動作冷卻中...';
        return;
      }

      // --- 2. INDIVIDUAL CHARGING CARDS OVERRIDES ---
      // (No lockout during charging - movement and other cards remain fully operational)
      if (id === 'right-skill' && isSkillCharging) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '技能蓄力中...';
        return;
      }
      if ((id === 'right-sync-ult' || id === 'left-ult') && isUltCharging) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '大招蓄力中...';
        return;
      }

      // --- 3. NORMAL OPERATION PATH ---
      const side = id.startsWith('left') ? 'left' : 'right';
      const isDetected = side === 'left' ? hasLeft : hasRight;

      if (!isDetected) {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = `等待${side === 'left' ? '左手' : '右手'}偵測...`;
        if (id === 'left-joystick') this.drawJoystickOverlay(0, 0);
        return;
      }

      // Execute custom active hand rendering callback
      callbackIfActive(el, txt);
    };

    // --- LEFT HAND PANEL ACTIONS ---
    updateCard('left-joystick', (el, txt) => {
      const mx = this.gestureData.moveX;
      const my = this.gestureData.moveY;
      
      // If Left hand Aim is active, movement is locked to 0
      if (this.gestureData.isLeftAimActive) {
        el.className = 'gesture-card suppressed-item';
        if (txt) txt.textContent = '瞄準中：移動鎖定';
        this.drawJoystickOverlay(0, 0);
      } else if (mx !== 0 || my !== 0) {
        el.className = 'gesture-card active';
        if (txt) {
          txt.textContent = `前進: ${(my < 0 ? -my : 0).toFixed(2)} | 後退: ${(my > 0 ? my : 0).toFixed(2)} | 轉向: ${mx.toFixed(2)}`;
        }
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：搖桿置中';
      }
      this.drawJoystickOverlay(mx, my);
    });

    updateCard('left-pause', (el, txt) => {
      if (this.gestureData.isPaused) {
        el.className = 'gesture-card danger';
        if (txt) txt.textContent = '暫停遊戲觸發！';
      } else if (this.gestureData.isPauseActive) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '暫停蓄力中...';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (掌心朝前五指併攏)';
      }
    });

    updateCard('left-aim', (el, txt) => {
      const isAimTransitioning = engine && (engine.syncAimTransitionStart > 0);
      const isEntering = isAimTransitioning && !this.gestureData.isLeftAimActive;
      const isExiting = isAimTransitioning && this.gestureData.isLeftAimActive;

      if (isEntering) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '瞄準模式切換中... (蓄力0.5秒)';
      } else if (isExiting) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '退出瞄準模式中... (蓄力0.5秒)';
      } else if (this.gestureData.isLeftAimActive) {
        el.className = 'gesture-card active';
        if (txt) txt.textContent = `瞄準配合中 | 倍率: ${this.gestureData.syncAimZoom.toFixed(2)}x`;
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (左手比 OK 手勢)';
      }
    });

    updateCard('left-ult', (el, txt) => {
      if (this.gestureData.isRightSyncUltTriggered) {
        el.className = 'gesture-card active';
        if (txt) txt.textContent = '大招爆發 (ON_ULT)！';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (雙手比三角形)';
      }
    });

    // --- RIGHT HAND PANEL ACTIONS ---
    updateCard('right-cursor', (el, txt) => {
      const indexTip = results.rightHandLandmarks[8];
      el.className = 'gesture-card ready';
      if (txt) {
        if (indexTip) {
          txt.textContent = `X: ${indexTip.x.toFixed(2)} | Y: ${indexTip.y.toFixed(2)}`;
        } else {
          txt.textContent = '等待手指偵測...';
        }
      }
    });

    updateCard('right-pinch', (el, txt) => {
      const indexTip = results.rightHandLandmarks[8];
      const thumbTip = results.rightHandLandmarks[4];
      if (indexTip && thumbTip) {
        const getDistance = (p1, p2) => Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
        const dist = getDistance(thumbTip, indexTip);
        const isPinching = dist < 0.035;

        if (this.app.uiManager) {
          this.app.uiManager.updateGestureCursor(indexTip.x, indexTip.y, isPinching);
        }

        if (isPinching) {
          el.className = 'gesture-card active';
          if (txt) txt.textContent = 'Pinch 點擊觸發！';
        } else {
          el.className = 'gesture-card ready';
          if (txt) txt.textContent = `間距: ${dist.toFixed(3)} (Pinch 點擊)`;
        }
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '等待手指偵測...';
      }
    });

    updateCard('right-gun', (el, txt) => {
      if (this.gestureData.isFiring) {
        el.className = 'gesture-card danger';
        if (txt) txt.textContent = '開槍發射 (ON_FIRE)！';
      } else if (this.gestureData.isAiming) {
        el.className = 'gesture-card active';
        if (txt) txt.textContent = '瞄準鎖定中 (ON_AIM)...';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (比讚+食指朝前)';
      }
    });

    updateCard('right-reload', (el, txt) => {
      if (this.gestureData.isReloaded) {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '換彈完成！';
      } else if (this.gestureData.isReloadActive) {
        el.className = 'gesture-card charging';
        if (txt) txt.textContent = '換彈蓄力中...';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (手背朝前且食指伸直)';
      }
    });

    updateCard('right-sync-aim-fire', (el, txt) => {
      if (this.gestureData.isLeftAimActive) {
        el.className = 'gesture-card active';
        if (txt) {
          txt.textContent = `視角位移 | DX: ${this.gestureData.syncAimDeltaX.toFixed(3)} | DY: ${this.gestureData.syncAimDeltaY.toFixed(3)}`;
        }
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (左手瞄準時啟動)';
      }
    });

    updateCard('right-slash', (el, txt) => {
      const slash = this.gestureData.lastSlash;
      const showSlash = slash && (Date.now() - slash.time < 800);
      if (showSlash) {
        el.className = 'gesture-card active';
        if (txt) {
          txt.textContent = `斬擊成功！方向:(${slash.dirX.toFixed(1)}, ${slash.dirY.toFixed(1)}) 速度:${slash.speed.toFixed(1)}`;
        }
        this.drawSlashArrow(slash.dirX, slash.dirY);
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (快速揮手)';
      }
    });

    updateCard('right-skill', (el, txt) => {
      if (this.gestureData.isRightSkillTriggered) {
        el.className = 'gesture-card active';
        if (txt) txt.textContent = '技能施放 (ON_SKILL)！';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (右手握拳背朝外拳朝上)';
      }
    });

    updateCard('right-sync-ult', (el, txt) => {
      if (this.gestureData.isRightSyncUltTriggered) {
        el.className = 'gesture-card active';
        if (txt) txt.textContent = '大招爆發 (ON_ULT)！';
      } else {
        el.className = 'gesture-card ready';
        if (txt) txt.textContent = '偵測中：待命 (雙手比三角形)';
      }
    });
  }

  /**
   * Draw a stylized 2D joystick on the canvas.
   */
  drawJoystickOverlay(mx, my) {
    const canvas = this.overlayEl.querySelector('#left-joystick-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = canvas.width / 2.5;

    // Draw background boundary ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Draw crosshair axes
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Compute pointer offset (Mirror horizontal axis due to camera mirroring)
    const px = cx + (-mx) * radius;
    const py = cy + my * radius;

    // Draw knob shadow glow if active
    const isActive = mx !== 0 || my !== 0;
    if (isActive) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ffcc';
    }

    // Draw knob
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, 2 * Math.PI);
    ctx.fillStyle = isActive ? 'rgba(0, 255, 204, 0.85)' : 'rgba(255, 255, 255, 0.18)';
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw center connecting vector line
    if (isActive) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Draw visual arrows for weapon swing vector cuts on the center canvas.
   */
  drawSlashArrow(dirX, dirY) {
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const cx = w / 2;
    const cy = h / 2;
    const arrowLength = 80;

    // The canvas has CSS scaleX(-1) which mirrors the display horizontally.
    // Negate dirX here so the visual arrow matches the user's perceived on-screen direction.
    const targetX = cx + (-dirX) * arrowLength;
    const targetY = cy + dirY * arrowLength;

    this.ctx.strokeStyle = '#ff007f';
    this.ctx.lineWidth = 5;
    this.ctx.lineCap = 'round';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#ff007f';

    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(targetX, targetY);
    this.ctx.stroke();

    const angle = Math.atan2(targetY - cy, targetX - cx);
    this.ctx.fillStyle = '#ff007f';
    this.ctx.beginPath();
    this.ctx.moveTo(targetX, targetY);
    this.ctx.lineTo(targetX - 18 * Math.cos(angle - Math.PI/6), targetY - 18 * Math.sin(angle - Math.PI/6));
    this.ctx.lineTo(targetX - 18 * Math.cos(angle + Math.PI/6), targetY - 18 * Math.sin(angle + Math.PI/6));
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.shadowBlur = 0;
  }

  /**
   * Render skeletal points from Pose landmarks.
   */
  drawPoseSkeleton(landmarks, w, h) {
    this.ctx.strokeStyle = 'rgba(157, 78, 221, 0.4)';
    this.ctx.lineWidth = 2.5;

    const links = [
      [11, 12], [11, 13], [13, 15],
      [12, 14], [14, 16]
    ];

    links.forEach(([i1, i2]) => {
      const pt1 = landmarks[i1];
      const pt2 = landmarks[i2];
      if (pt1 && pt2 && pt1.visibility > 0.5 && pt2.visibility > 0.5) {
        this.ctx.beginPath();
        this.ctx.moveTo(pt1.x * w, pt1.y * h);
        this.ctx.lineTo(pt2.x * w, pt2.y * h);
        this.ctx.stroke();
      }
    });
  }

  /**
   * Draw hand skeleton linkages on canvas.
   */
  drawHandLandmarks(landmarks, w, h, color) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [9, 10], [10, 11], [11, 12],
      [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    connections.forEach(([i1, i2]) => {
      const pt1 = landmarks[i1];
      const pt2 = landmarks[i2];
      if (pt1 && pt2) {
        this.ctx.beginPath();
        this.ctx.moveTo(pt1.x * w, pt1.y * h);
        this.ctx.lineTo(pt2.x * w, pt2.y * h);
        this.ctx.stroke();
      }
    });

    this.ctx.fillStyle = '#ffffff';
    landmarks.forEach(pt => {
      if (pt) {
        this.ctx.beginPath();
        this.ctx.arc(pt.x * w, pt.y * h, 3, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    });

    this.ctx.fillStyle = color;
    [4, 8, 12, 16, 20].forEach(tipIndex => {
      const pt = landmarks[tipIndex];
      if (pt) {
        this.ctx.beginPath();
        this.ctx.arc(pt.x * w, pt.y * h, 5, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    });
  }

  /**
   * Load stored poses from localStorage.
   */
  loadRecordedPoses() {
    try {
      const data = localStorage.getItem('neural_arena_recorded_poses');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Grab active landmarks frame and add it to the developer storage array.
   */
  recordPoseCurrentFrame() {
    const name = this.poseNameInput.value.trim() || `未命名姿勢_${new Date().toLocaleTimeString()}`;

    if (!this.latestResults) {
      alert('⚠️ 無法錄製：目前尚未接收到 any landmarks frame！');
      return;
    }

    const hasLeft = !!this.latestResults.leftHandLandmarks;
    const hasRight = !!this.latestResults.rightHandLandmarks;
    const hasPose = !!this.latestResults.poseLandmarks;

    if (!hasLeft && !hasRight && !hasPose) {
      alert('⚠️ 無法錄製：偵測到的雙手與肢體骨架數據為空。');
      return;
    }

    const record = {
      name,
      timestamp: new Date().toISOString(),
      leftHandLandmarks: this.latestResults.leftHandLandmarks || null,
      rightHandLandmarks: this.latestResults.rightHandLandmarks || null,
      poseLandmarks: this.latestResults.poseLandmarks || null
    };

    this.recordedPoses.push(record);
    localStorage.setItem('neural_arena_recorded_poses', JSON.stringify(this.recordedPoses));
    
    this.updateRecordUI();
    this.poseNameInput.value = '';
    console.log('[PoseRecorder] Recorded frame:', record);
  }

  /**
   * Update recorder textbox statistics.
   */
  updateRecordUI() {
    if (this.recordCountEl) {
      this.recordCountEl.textContent = this.recordedPoses.length;
    }

    if (this.previewBoxEl && this.recordedPoses.length > 0) {
      const last = this.recordedPoses[this.recordedPoses.length - 1];
      const leftCount = last.leftHandLandmarks ? 21 : 0;
      const rightCount = last.rightHandLandmarks ? 21 : 0;
      const poseCount = last.poseLandmarks ? 33 : 0;
      this.previewBoxEl.value = `最新錄製: ${last.name}\n時間: ${new Date(last.timestamp).toLocaleTimeString()}\n左手節點: ${leftCount} | 右手節點: ${rightCount} | 身體骨架點: ${poseCount}`;
    } else if (this.previewBoxEl) {
      this.previewBoxEl.value = '尚無錄製紀錄。請輸入名稱並點選「錄製當前格」。';
    }
  }

  /**
   * Download recorded JSON.
   */
  downloadPoses() {
    if (this.recordedPoses.length === 0) return;
    const dataStr = JSON.stringify(this.recordedPoses, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neural_arena_recorded_poses_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clear recorded storage data.
   */
  clearPoses() {
    if (this.recordedPoses.length === 0) return;
    if (confirm('❓ 確定要清除所有已錄製 of Poses嗎？')) {
      this.recordedPoses = [];
      localStorage.removeItem('neural_arena_recorded_poses');
      this.updateRecordUI();
    }
  }

  /**
   * Update calibration instructions based on the active test mode.
   */
  updateCalibrationGuide() {
    if (!this.calibrationGuideEl) return;

    const pauseTime = (ActionConfig['left-pause'].chargeTime / 1000).toFixed(1);
    const aimTime = (ActionConfig['left-aim'].chargeTime / 1000).toFixed(1);
    const reloadCharge = (ActionConfig['right-reload'].chargeTime / 1000).toFixed(1);
    const reloadLock = (ActionConfig['right-reload'].animationTime / 1000).toFixed(1);
    const skillCharge = (ActionConfig['right-skill'].chargeTime / 1000).toFixed(1);
    const skillLock = (ActionConfig['right-skill'].animationTime / 1000).toFixed(1);
    const ultCharge = (ActionConfig['right-sync-ult'].chargeTime / 1000).toFixed(1);
    const ultLock = (ActionConfig['right-sync-ult'].animationTime / 1000).toFixed(1);

    if (this.activeTestMode === 'basic') {
      this.calibrationGuideEl.innerHTML = `
        <h4>基礎手勢操作指引</h4>
        <ul class="calibration-list">
          <li><strong>左手移動搖桿：</strong>掌心朝鏡頭，前傾前進、左右側傾控制轉向。</li>
          <li><strong>左手握拳後退：</strong>左手五指合攏握拳，可快速往後移動。</li>
          <li><strong>左手暫停選單：</strong>五指伸直完全併攏（掌心朝前）維持 <strong>${pauseTime} 秒</strong>，以開啟或暫停選單。</li>
          <li><strong>右手選單游標：</strong>右手食指指尖指向螢幕，對準映射畫面中的發光游標。</li>
          <li><strong>右手 Pinch 點擊：</strong>大拇指與食指捏合，用以觸發虛擬點擊動作。</li>
        </ul>
      `;
    } else if (this.activeTestMode === 'ranged') {
      this.calibrationGuideEl.innerHTML = `
        <h4>槍械模式手勢指引 (Ranged Mode)</h4>
        <ul class="calibration-list">
          <li><strong>左手搖桿移動：</strong>支援前傾前進、握拳後退與併攏暫停遊戲。</li>
          <li><strong>左手精準瞄準 (Sync Aim)：</strong>左手比出【OK 手勢】維持 <strong>${aimTime} 秒</strong>開啟；開合中指可調節 1.0x ~ 4.0x 放大鏡倍率。</li>
          <li><strong>右手舉槍瞄準 (Aim)：</strong>右手大拇指朝上（比讚），食指指向螢幕即鎖定視角。</li>
          <li><strong>右手扣下扳機 (Fire)：</strong>食指快速向下彎曲扣動（可單點開槍）。</li>
          <li><strong>右手手勢裝彈 (Reload)：</strong>將右手翻為【手背朝前且食指伸直】維持 <strong>${reloadCharge} 秒</strong>，裝彈動作鎖定武器 <strong>${reloadLock} 秒</strong>。</li>
          <li><strong>右手蓄力技能 (投擲武器)：</strong>握拳拳頭朝上（上鉤拳姿勢）維持 <strong>${skillCharge} 秒</strong>，鎖定 <strong>${skillLock} 秒</strong> 施法動畫。</li>
          <li><strong>雙手蓄力大招 (等離子屏障)：</strong>雙手合攏比三角形維持 <strong>${ultCharge} 秒</strong>，鎖定 <strong>${ultLock} 秒</strong> 發動期（期間禁止移動）。</li>
          <li style="color:#e63946;"><em>🚫 模式限制：此模式下已禁用右手近戰揮砍 (Slash) 手勢。</em></li>
        </ul>
      `;
    } else if (this.activeTestMode === 'melee') {
      this.calibrationGuideEl.innerHTML = `
        <h4>近戰與技能模式手勢指引 (Melee Mode)</h4>
        <ul class="calibration-list">
          <li><strong>左手搖桿移動：</strong>支援前傾前進、握拳後退與併攏暫停遊戲.</li>
          <li><strong>右手近戰揮砍 (Slash)：</strong>食指指尖快速揮掃（速度門檻需高於 1.5 units/s）以劃出刀光。</li>
          <li><strong>右手普通射擊 (連發招式)：</strong>比讚（拇指朝上）並下彎食指，可用於施放快速法球等連發技能。</li>
          <li><strong>右手蓄力技能 (裂地衝擊)：</strong>握拳拳頭朝上維持 <strong>${skillCharge} 秒</strong>，鎖定 <strong>${skillLock} 秒</strong> 施法動畫。</li>
          <li><strong>雙手蓄力大招 (等離子屏障)：</strong>雙手合攏比三角形維持 <strong>${ultCharge} 秒</strong>，鎖定 <strong>${ultLock} 秒</strong> 發動期（期間禁止移動）。</li>
          <li style="color:#e63946;"><em>🚫 模式限制：此模式下已禁用左手 OK 瞄準與右手 Reload 手勢。</em></li>
        </ul>
      `;
    }
  }
}
