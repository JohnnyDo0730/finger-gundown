import { WeaponConfig } from '../core/WeaponConfig.js';

/**
 * MenuManager - Handles Main Menu, Pause Menu, and Weapon Selection UI.
 * Connects UI actions to StateManager and implements virtual gesture cursor cursor clicking.
 */
export class MenuManager {
  /**
   * @param {App} app - Reference to the core App instance.
   */
  constructor(app) {
    this.app = app;
    this.overlayEl = null;
    this.menuPanelEl = null;
    this.weaponsPanelEl = null;

    // Virtual cursor element
    this.cursorEl = null;
    this.clickCooldown = false;

    // Hot-swap mouse idle tracking
    this.lastMouseMoveTime = 0;
    window.addEventListener('mousemove', () => {
      this.lastMouseMoveTime = Date.now();
    });

    // Active weapon details selection
    this.currentWeapon = 'pistol';
    this.lastRenderedWeapon = null;
    this.lockedSkillKey = null;
    this.lastHoveredElement = null;

    // Calibration bounds for gesture mapping (comfortable central viewport mapping)
    this.loadCalibrationData();

    this.createDOM();
    this.setupStyles();
    this.bindEvents();
    this.syncState();
  }

  /**
   * Load stored calibration coordinates from localStorage or default bounds.
   */
  loadCalibrationData() {
    this.calib_xMin = parseFloat(localStorage.getItem('gesture_calib_xMin')) || 0.15;
    this.calib_xMax = parseFloat(localStorage.getItem('gesture_calib_xMax')) || 0.85;
    this.calib_yMin = parseFloat(localStorage.getItem('gesture_calib_yMin')) || 0.20;
    this.calib_yMax = parseFloat(localStorage.getItem('gesture_calib_yMax')) || 0.80;
  }

  /**
   * Dynamically build Menu DOM elements and append them to document.
   */
  createDOM() {
    if (document.getElementById('game-menu-overlay')) return;

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'game-menu-overlay';
    this.overlayEl.className = 'menu-overlay hidden';

    this.overlayEl.innerHTML = `
      <!-- Main / Pause Menu Card (Width 620px, Height 750px aligned to center panel) -->
      <div id="menu-panel" class="menu-panel">
        <h2 id="menu-title">FINGER GUNDOWN</h2>
        <div class="menu-btn-list">
          <button id="btn-play" class="menu-btn"><span class="btn-glow"></span>開始遊戲</button>
          <button id="btn-weapons" class="menu-btn">武器選擇與技能介紹</button>
          <button id="btn-test" class="menu-btn">操作測試與手勢教學</button>
          <button id="btn-exit" class="menu-btn danger">退出遊戲</button>
        </div>
      </div>

      <!-- Weapon Selection Fullscreen Layout mirroring Diagnostic Studio -->
      <div id="weapons-panel" class="weapons-panel-wrapper hidden">
        <!-- Block A: Top Panel (Weapon title and category) -->
        <div id="weapon-top-panel" class="floating-panel top-panel">
          <div id="weapon-title-container">
            <!-- Weapon Name and Short Description dynamically loaded -->
          </div>
        </div>

        <!-- Block B: Left Panel (Ranged Weapons List) -->
        <div id="weapon-left-panel" class="floating-panel side-panel left-panel">
          <div class="side-panel-title">◀ 槍械類武器 (Ranged)</div>
          <div class="weapons-sidebar" id="ranged-weapons-sidebar">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Block C: Right Panel (Melee Weapons List) -->
        <div id="weapon-right-panel" class="floating-panel side-panel right-panel">
          <div class="side-panel-title">技能組組合 ▶</div>
          <div class="weapons-sidebar" id="melee-weapons-sidebar">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Block D: Center Panel (Hexagonal hive skill details area) -->
        <div id="weapon-center-panel" class="floating-panel center-panel">
          <div id="weapon-details-container" style="width: 100%; height: 100%; position: relative;">
            <!-- Hexagonal hive and passive details dynamically loaded -->
          </div>
        </div>

        <!-- Block E: Bottom Panel (Back button) -->
        <button id="btn-weapons-back" class="floating-panel bottom-panel">返回主選單</button>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    // Create global virtual cursor directly on body so it floats above all screen layers
    this.cursorEl = document.getElementById('gesture-cursor');
    if (!this.cursorEl) {
      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'gesture-cursor';
      this.cursorEl.className = 'gesture-cursor';
      document.body.appendChild(this.cursorEl);
    }

    // Create global bottom-right gesture control & status widget
    if (!document.getElementById('gesture-toggle-widget')) {
      const widget = document.createElement('div');
      widget.id = 'gesture-toggle-widget';
      widget.className = 'gesture-toggle-widget';
      widget.innerHTML = `
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
      document.body.appendChild(widget);

      // Create modal DOM
      const modal = document.createElement('div');
      modal.id = 'gesture-guide-modal';
      modal.className = 'gesture-guide-modal';
      modal.innerHTML = `
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
                <strong>鏡頭採集與舒適活動區間校正</strong>
                <p>調整鏡頭亮度與曝光曝光，使畫面清晰易辨識；接著切換至定位校準分頁，依照提示在舒適的四角進行捏合錄製，使系統能根據您的舒適活動範圍精準縮放游標。</p>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-num">3</span>
              <div class="step-text">
                <strong>熟悉槍械與技能手勢</strong>
                <p>在不同類別下練習並熟悉各類別手勢動作（例如比讚舉槍瞄準、扣指射擊、握拳蓄力、雙手三角形大招等）。</p>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-num">4</span>
              <div class="step-text">
                <strong>開啟手勢操作</strong>
                <p>勾選右下角的「啟用手勢操作」，即可將雙手手勢無縫應用於主選單與各頁面的虛擬游標控制與互動。</p>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-num">5</span>
              <div class="step-text">
                <strong>閱讀武器技能說明</strong>
                <p>點選「武器選擇」頁面，可隨時查看每款雷射手槍、突擊步槍或魔法太刀的核心被動、主動技能與對應手勢。</p>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-num">6</span>
              <div class="step-text">
                <strong>進入遊戲，享受冒險</strong>
                <p>一切準備就緒後，點擊「開始遊戲」投身戰場，盡情享受全身心沉浸的手勢射擊遊戲體驗！</p>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Create loading overlay DOM
      if (!document.getElementById('gesture-loading-overlay')) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'gesture-loading-overlay';
        loadingOverlay.className = 'gesture-loading-overlay';
        loadingOverlay.innerHTML = `
          <div class="gesture-loading-spinner"></div>
          <div class="gesture-loading-text">正在啟動相機與手勢引擎...</div>
          <div class="gesture-loading-subtext">請稍候，加載完成後將自動啟用手勢操作。</div>
        `;
        document.body.appendChild(loadingOverlay);
      }

      const guideBtn = widget.querySelector('#gesture-widget-guide-btn');
      const closeBtn = modal.querySelector('#btn-close-guide');

      guideBtn.addEventListener('click', () => {
        modal.classList.add('active');
      });
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });

      const checkbox = widget.querySelector('#gesture-toggle-checkbox');
      const isEnabled = localStorage.getItem('gesture_control_enabled') === 'true';
      checkbox.checked = isEnabled;

      // Check first-time user to automatically pop up settings guide modal
      const isFirstTime = localStorage.getItem('gesture_first_time_user') !== 'false';
      if (isFirstTime) {
        setTimeout(() => {
          modal.classList.add('active');
          localStorage.setItem('gesture_first_time_user', 'false');
        }, 1000);
      }

      checkbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        localStorage.setItem('gesture_control_enabled', checked ? 'true' : 'false');

        if (checked) {
          if (this.app.gestureTestWindow) {
            this.app.gestureTestWindow.initMediaPipe();
          }
        } else {
          if (this.app.gestureTestWindow) {
            this.app.gestureTestWindow.stopTracking();
          }
          if (this.cursorEl) {
            this.cursorEl.classList.remove('active');
          }
        }
      });
    }

    // Bind DOM cache
    this.menuPanelEl = this.overlayEl.querySelector('#menu-panel');
    this.weaponsPanelEl = this.overlayEl.querySelector('#weapons-panel');

    // Populate Ranged and Melee weapons list sidebars dynamically
    const rangedSidebar = this.overlayEl.querySelector('#ranged-weapons-sidebar');
    const meleeSidebar = this.overlayEl.querySelector('#melee-weapons-sidebar');

    if (rangedSidebar && meleeSidebar) {
      rangedSidebar.innerHTML = '';
      meleeSidebar.innerHTML = '';

      let isFirst = true;
      Object.keys(WeaponConfig).forEach(key => {
        const w = WeaponConfig[key];
        if (w.isPlayable) {
          const item = document.createElement('div');
          // Start with active pistol
          item.className = `weapon-item ${key === 'pistol' ? 'active' : ''}`;
          item.setAttribute('data-weapon', key);
          const catLabel = w.category === 'ranged' ? '遠程槍械類' : ((key === 'blood-magic' || key === 'crimson-clan') ? '遠程技能組' : '近戰技能組');
          item.innerHTML = `
            <h4>${w.name}</h4>
            <p>${catLabel}</p>
          `;

          if (w.category === 'ranged') {
            rangedSidebar.appendChild(item);
          } else {
            meleeSidebar.appendChild(item);
          }
        }
      });
    }
  }

  /**
   * Inject CSS styles for the glassmorphic menus, buttons, and custom cursor.
   */
  setupStyles() {
    if (document.getElementById('menu-system-styles')) return;

    const style = document.createElement('style');
    style.id = 'menu-system-styles';
    style.textContent = `
      .menu-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: var(--bg-deep-space);
        backdrop-filter: blur(20px);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 1;
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .menu-overlay.hidden {
        display: none !important;
        opacity: 0;
        pointer-events: none;
      }
      .menu-panel.hidden, .weapons-panel-wrapper.hidden {
        display: none !important;
      }
      
      /* Main Menu Card - Sized exactly like Diagnostic center panel (620x750px) */
      .menu-panel {
        background: var(--glass-surface);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border: 1px solid var(--glass-border);
        border-radius: 20px;
        padding: 60px 40px;
        position: absolute;
        top: 130px;
        left: 50%;
        transform: translateX(-50%);
        width: 620px;
        height: 750px;
        box-sizing: border-box;
        text-align: center;
        box-shadow: var(--drop-shadow-vr);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 50px;
        z-index: 110;
        transition: opacity 0.5s ease-in-out, border-color 0.3s, box-shadow 0.3s;
      }
      .menu-panel.collapsed {
        transform: translateX(-50%);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.4s ease-in-out 0.15s;
      }
      .menu-panel:hover {
        border-color: var(--glass-border-light);
        box-shadow: var(--drop-shadow-vr), var(--glow-cyan);
      }
      .menu-panel h2 {
        font-family: 'Rajdhani', sans-serif;
        font-size: 3.2rem;
        font-weight: 700;
        letter-spacing: 6px;
        background: linear-gradient(45deg, var(--cyan-spatial), var(--violet-spell));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 30px rgba(0, 242, 254, 0.15);
        margin: 0;
      }
      .menu-btn-list {
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: center;
      }
      
      /* Premium VR Menu Buttons */
      .menu-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        color: var(--text-main);
        font-family: 'Rajdhani', 'Inter', system-ui, sans-serif;
        font-weight: 600;
        font-size: 1.05rem;
        padding: 16px 24px;
        width: 320px;
        cursor: pointer;
        outline: none;
        backdrop-filter: blur(8px);
        transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        position: relative;
        overflow: hidden;
        letter-spacing: 1px;
      }
      .menu-btn:hover {
        background: var(--glass-surface-hover);
        border-color: var(--cyan-spatial);
        transform: translateZ(10px) scale(1.03);
        box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
        color: var(--text-main);
      }
      .menu-btn:active {
        transform: translateZ(2px) scale(0.97);
        background: rgba(0, 242, 254, 0.25);
        border-color: var(--cyan-spatial);
      }
      .menu-btn.danger {
        border-color: rgba(230, 57, 70, 0.2);
        color: #e63946;
      }
      .menu-btn.danger:hover {
        background: rgba(230, 57, 70, 0.15);
        border-color: #e63946;
        box-shadow: 0 0 20px rgba(230, 57, 70, 0.25);
      }

      /* Fullscreen Hologram layout for Weapon Selection Page */
      .weapons-panel-wrapper {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 1000;
        overflow: hidden;
      }
      .weapons-panel-wrapper .floating-panel {
        background: var(--glass-surface);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border-radius: 20px;
        box-shadow: var(--drop-shadow-vr);
        position: absolute;
        box-sizing: border-box;
        transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.5s ease-in-out, border-color 0.3s;
      }
      .weapons-panel-wrapper .floating-panel:hover {
        border-color: var(--glass-border-light);
      }
      
      /* Collapsed states (default) */
      .weapons-panel-wrapper .top-panel {
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(110px);
        opacity: 0;
        width: 620px;
        height: 100px;
        padding: 15px 25px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        z-index: 90;
      }
      .weapons-panel-wrapper .side-panel {
        top: 20px;
        width: 320px;
        height: 860px;
        padding: 20px 15px;
        z-index: 90;
        overflow-y: auto;
      }
      .weapons-panel-wrapper .left-panel {
        left: calc(50% - 310px - 320px - 20px);
        transform: translateX(340px) translateY(0);
        opacity: 0;
      }
      .weapons-panel-wrapper .right-panel {
        right: calc(50% - 310px - 320px - 20px);
        transform: translateX(-340px) translateY(0);
        opacity: 0;
      }
      .weapons-panel-wrapper .side-panel-title {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.95rem;
        font-weight: bold;
        color: #f0f3ff;
        margin-bottom: 15px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 8px;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .weapons-panel-wrapper .center-panel {
        top: 130px;
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
        width: 620px;
        height: 750px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        z-index: 110;
        transition: opacity 0.4s ease-in-out 0.15s;
      }
      .weapons-panel-wrapper button.bottom-panel {
        top: 890px;
        left: 50%;
        transform: translateX(-50%) translateY(-760px);
        opacity: 0;
        width: 620px;
        height: 60px;
        z-index: 90;
        background: var(--glass-surface);
        border: 1px solid var(--glass-border);
        border-radius: 20px;
        color: var(--text-muted);
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.1rem;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.5s ease-in-out, border-color 0.3s, background 0.2s, box-shadow 0.2s, color 0.2s;
      }
      .weapons-panel-wrapper button.bottom-panel:hover {
        background: var(--glass-surface-hover);
        border-color: #ff007f;
        color: #fff;
        box-shadow: 0 0 20px rgba(255, 0, 127, 0.3);
      }

      /* Expanded states when wrapper has .active-anim class */
      .weapons-panel-wrapper.active-anim .top-panel,
      .weapons-panel-wrapper.active-anim .bottom-panel {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .weapons-panel-wrapper.active-anim .left-panel,
      .weapons-panel-wrapper.active-anim .right-panel {
        transform: translateX(0) translateY(0);
        opacity: 1;
      }
      .weapons-panel-wrapper.active-anim .center-panel {
        transform: translateX(-50%);
        opacity: 1;
        transition: opacity 0.4s ease-in-out 0s;
      }

      /* Weapons Sidebar items */
      .weapons-sidebar {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .weapon-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 15px;
        cursor: pointer;
        transition: all 0.25s;
        text-align: left;
      }
      .weapon-item h4 {
        font-family: 'Rajdhani', sans-serif;
        margin: 0;
        font-size: 1.05rem;
        color: #f0f3ff;
      }
      .weapon-item p {
        margin: 4px 0 0 0;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .weapon-item:hover {
        background: var(--glass-surface-hover);
        border-color: var(--glass-border-light);
      }
      .weapon-item.active {
        background: rgba(0, 242, 254, 0.08);
        border-color: var(--cyan-spatial);
      }
      .weapon-item.active h4 {
        color: var(--cyan-spatial);
      }

      /* Hexagonal Hive layout stylesheet - Modern absolute centering layout without clip-paths */
      .hive-node {
        position: absolute;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
        user-select: none;
        box-sizing: border-box;
        text-align: center;
        z-index: 10;
      }
      
      .hive-node.center-node {
        width: 180px;
        height: 156px;
        z-index: 20;
      }
      
      .hive-node.outer-node {
        width: 162px;
        height: 140px;
        z-index: 15;
      }
      
      /* Transform-aware hover and active guides to prevent layout shifting */
      .hive-node.outer-node:hover {
        transform: translate(-50%, -50%) scale(1.08);
      }
      .hive-node.outer-node.active-guide {
        transform: translate(-50%, -50%) scale(1.05);
      }
      
      /* Target child SVG polygons directly for smooth stroke/fill transitions */
      .hive-node:hover polygon {
        stroke: var(--hive-accent, var(--cyan-spatial)) !important;
        fill: rgba(var(--hive-accent-rgb, 0, 242, 254), 0.12) !important;
      }
      .hive-node.active-guide polygon {
        stroke: var(--hive-accent, var(--cyan-spatial)) !important;
        fill: rgba(var(--hive-accent-rgb, 0, 242, 254), 0.12) !important;
      }
      
      .hive-node.outer-node.disabled-node {
        background: transparent !important;
        border: none !important;
        color: rgba(255, 255, 255, 0.15) !important;
        opacity: 0.35;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.75) !important;
        filter: grayscale(100%);
      }

      /* Hover descriptions panel */
      .hive-hover-panel {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        height: 180px;
        background: rgba(28, 29, 36, 0.65);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 15px 20px;
        box-sizing: border-box;
        overflow-y: auto;
        text-align: left;
      }
      .hive-hover-title {
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.1rem;
        font-weight: bold;
        color: var(--cyan-spatial);
        margin-bottom: 8px;
        border-bottom: 1px solid rgba(0, 242, 254, 0.2);
        padding-bottom: 6px;
        letter-spacing: 1px;
      }
      .hive-hover-desc {
        font-size: 0.88rem;
        color: var(--text-muted);
        line-height: 1.5;
      }

      /* VR Nav return buttons styles - Flex centering and line height reset */
      .long-nav-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        color: var(--text-muted);
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.05rem;
        font-weight: bold;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        max-width: 320px;
        text-transform: uppercase;
        letter-spacing: 2px;
        line-height: 1;
      }
      .long-nav-btn:hover {
        background: var(--glass-surface-hover);
        border-color: #ff007f;
        color: #fff;
        transform: translateZ(10px) scale(1.03);
        box-shadow: 0 0 15px rgba(255, 0, 127, 0.35);
      }

      /* Gesture floating cursor styles */
      .gesture-cursor {
        position: absolute;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(0, 242, 254, 0.4);
        border: 2px solid var(--cyan-spatial);
        box-shadow: var(--glow-cyan);
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%) scale(1);
        transition: transform 0.15s cubic-bezier(0.1, 0.8, 0.3, 1), background-color 0.15s;
        display: none;
      }
      .gesture-cursor.active {
        display: block;
      }
      .gesture-cursor.pinched {
        background: rgba(255, 0, 127, 0.7);
        border-color: #ff007f;
        box-shadow: 0 0 20px #ff007f;
        transform: translate(-50%, -50%) scale(0.7);
      }

      /* Global Gesture Widget styles */
      .gesture-toggle-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(20, 21, 26, 0.75);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(15px);
        border-radius: 14px;
        padding: 14px 18px;
        z-index: 10001;
        box-shadow: var(--drop-shadow-vr);
        font-family: 'Rajdhani', 'Outfit', sans-serif;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 230px;
        transition: all 0.3s ease;
      }
      .gesture-widget-guide-btn {
        background: rgba(0, 242, 254, 0.08);
        border: 1px solid rgba(0, 242, 254, 0.2);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--cyan-spatial);
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.88rem;
        font-weight: bold;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        width: 100%;
        box-sizing: border-box;
      }
      .gesture-widget-guide-btn:hover {
        background: rgba(0, 242, 254, 0.16);
        border-color: var(--cyan-spatial);
        box-shadow: 0 0 10px rgba(0, 242, 254, 0.2);
      }
      
      /* Gesture Guide Modal styles */
      .gesture-guide-modal {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 10, 12, 0.7);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 10005;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.4s ease-in-out;
      }
      .gesture-guide-modal.active {
        opacity: 1;
        pointer-events: auto;
      }
      .gesture-guide-content {
        background: rgba(20, 21, 26, 0.85);
        border: 1px solid var(--glass-border);
        border-radius: 24px;
        width: 600px;
        max-width: 90%;
        max-height: 85%;
        padding: 30px;
        box-shadow: var(--drop-shadow-vr);
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        transform: scale(0);
        transform-origin: calc(50% + 50vw - 135px) calc(50% + 50vh - 60px);
        transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .gesture-guide-modal.active .gesture-guide-content {
        transform: scale(1);
      }
      .gesture-guide-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(0, 242, 254, 0.15);
        padding-bottom: 12px;
      }
      .gesture-guide-header h3 {
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.4rem;
        color: var(--cyan-spatial);
        margin: 0;
        letter-spacing: 1px;
      }
      .close-guide-btn {
        background: transparent;
        border: none;
        color: var(--text-muted);
        font-size: 1.8rem;
        cursor: pointer;
        line-height: 1;
        transition: color 0.2s;
      }
      .close-guide-btn:hover {
        color: #ff007f;
      }
      .gesture-guide-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .guide-step {
        display: flex;
        gap: 15px;
        align-items: flex-start;
      }
      .step-num {
        background: rgba(0, 242, 254, 0.15);
        border: 1px solid var(--cyan-spatial);
        border-radius: 50%;
        color: var(--cyan-spatial);
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.1rem;
        font-weight: bold;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .step-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: left;
      }
      .step-text strong {
        font-size: 0.98rem;
        color: #fff;
      }
      .step-text p {
        font-size: 0.85rem;
        color: var(--text-muted);
        margin: 0;
        line-height: 1.4;
      }
      .gesture-widget-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .gesture-widget-label {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-main);
        letter-spacing: 0.5px;
      }
      .gesture-widget-status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        color: var(--text-muted);
      }
      
      /* Switch styling */
      .gesture-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
      }
      .gesture-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .gesture-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border);
        transition: .3s;
        border-radius: 24px;
      }
      .gesture-slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 4px;
        bottom: 3px;
        background-color: white;
        transition: .3s;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      input:checked + .gesture-slider {
        background-color: rgba(0, 242, 254, 0.25);
        border-color: var(--cyan-spatial);
      }
      input:checked + .gesture-slider:before {
        transform: translateX(20px);
        background-color: var(--cyan-spatial);
      }
      /* Click visual feedback class that preserves translations */
      .hive-node.outer-node.virtual-clicked,
      .hive-node.center-node.virtual-clicked {
        transform: translate(-50%, -50%) scale(0.95) !important;
      }
      .weapons-panel-wrapper button.bottom-panel.virtual-clicked {
        transform: translateX(-50%) translateY(0) scale(0.95) !important;
      }
      .menu-btn.virtual-clicked,
      .weapon-item.virtual-clicked {
        transform: scale(0.95) !important;
      }
      
      /* Status dot styling */
      .status-dot-widget {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #8c9bb3;
        transition: background-color 0.3s, box-shadow 0.3s;
      }
      .status-dot-widget.initializing {
        background-color: #ff9f0a;
        box-shadow: 0 0 10px #ff9f0a;
      }
      .status-dot-widget.active {
        background-color: var(--cyan-spatial);
        box-shadow: var(--glow-cyan);
      }
      .status-dot-widget.error {
        background-color: #ff453a;
        box-shadow: 0 0 10px #ff453a;
      
      /* Global Gesture Loading Overlay Screen */
      .gesture-loading-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 10, 12, 0.6);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        z-index: 20000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease-in-out;
      }
      .gesture-loading-overlay.active {
        opacity: 1;
        pointer-events: auto;
      }
      .gesture-loading-spinner {
        width: 50px;
        height: 50px;
        border: 3px solid rgba(0, 242, 254, 0.1);
        border-radius: 50%;
        border-top-color: var(--cyan-spatial);
        animation: spin-loader 1s linear infinite;
      }
      .gesture-loading-text {
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.4rem;
        font-weight: bold;
        color: #fff;
        letter-spacing: 1px;
      }
      .gesture-loading-subtext {
        font-size: 0.9rem;
        color: var(--text-muted);
      }
      @keyframes spin-loader {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Add click logic to buttons and weapons items.
   */
  bindEvents() {
    // Play button
    this.overlayEl.querySelector('#btn-play').addEventListener('click', () => {
      this.app.stateManager.transitionTo('PLAYING');
    });

    // Weapons list button
    this.overlayEl.querySelector('#btn-weapons').addEventListener('click', () => {
      // 1. Collapse main menu
      this.menuPanelEl.classList.add('collapsed');

      // 2. Show weapon panel wrapper, starting collapsed
      this.weaponsPanelEl.classList.remove('hidden');
      this.weaponsPanelEl.classList.remove('active-anim');

      // Force reflow
      this.weaponsPanelEl.offsetHeight;

      // 3. Expand weapons panel
      this.weaponsPanelEl.classList.add('active-anim');
      this.renderWeaponDetails();

      // Hide menu panel completely after transition finishes
      setTimeout(() => {
        if (this.menuPanelEl.classList.contains('collapsed')) {
          this.menuPanelEl.classList.add('hidden');
        }
      }, 500);
    });

    // Test mode button
    this.overlayEl.querySelector('#btn-test').addEventListener('click', () => {
      this.app.stateManager.transitionTo('TEST_MODE');
    });

    // Exit button
    this.overlayEl.querySelector('#btn-exit').addEventListener('click', () => {
      if (confirm('確定要關閉遊戲嗎？')) {
        window.close();
        alert('退出遊戲 (請關閉此瀏覽器分頁)');
      }
    });

    // Close Weapons button
    this.overlayEl.querySelector('#btn-weapons-back').addEventListener('click', () => {
      // 1. Collapse weapons panel
      this.weaponsPanelEl.classList.remove('active-anim');

      // 2. Show main menu panel, starting collapsed
      this.menuPanelEl.classList.remove('hidden');
      this.menuPanelEl.classList.add('collapsed');

      // Force reflow
      this.menuPanelEl.offsetHeight;

      // 3. Expand main menu panel
      this.menuPanelEl.classList.remove('collapsed');

      // Hide weapons panel wrapper after transition finishes
      setTimeout(() => {
        if (!this.weaponsPanelEl.classList.contains('active-anim')) {
          this.weaponsPanelEl.classList.add('hidden');
        }
      }, 500);
    });

    // Weapon items click selector
    const items = this.overlayEl.querySelectorAll('.weapon-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentWeapon = item.getAttribute('data-weapon');
        this.renderWeaponDetails();
      });
    });
  }

  /**
   * Monitor StateManager to toggle overlays.
   */
  syncState() {
    this.app.stateManager.subscribe((newState) => {
      if (newState === 'MENU' || newState === 'PAUSED') {
        this.overlayEl.classList.remove('hidden');

        const playBtn = this.overlayEl.querySelector('#btn-play');
        const menuTitle = this.overlayEl.querySelector('#menu-title');

        if (newState === 'PAUSED') {
          playBtn.innerHTML = '<span class="btn-glow"></span>繼續遊戲';
          menuTitle.textContent = 'GAME PAUSED';

          this.menuPanelEl.classList.add('collapsed');
          this.menuPanelEl.classList.add('hidden');
          this.weaponsPanelEl.classList.remove('hidden');

          // Force reflow
          this.weaponsPanelEl.offsetHeight;
          this.weaponsPanelEl.classList.add('active-anim');
          this.renderWeaponDetails();
        } else {
          playBtn.innerHTML = '<span class="btn-glow"></span>開始遊戲';
          menuTitle.textContent = 'FINGER GUNDOWN';

          this.weaponsPanelEl.classList.remove('active-anim');
          this.weaponsPanelEl.classList.add('hidden');
          this.menuPanelEl.classList.remove('hidden');

          // Force reflow
          this.menuPanelEl.offsetHeight;
          this.menuPanelEl.classList.remove('collapsed');
        }
      } else {
        // Transitioning away from MENU / PAUSED (e.g. to PLAYING or TEST_MODE)
        this.menuPanelEl.classList.add('collapsed');
        this.weaponsPanelEl.classList.remove('active-anim');

        // Wait for slide/fade out transitions to finish before adding hidden
        setTimeout(() => {
          const currState = this.app.stateManager.getState();
          if (currState !== 'MENU' && currState !== 'PAUSED') {
            this.overlayEl.classList.add('hidden');
            this.menuPanelEl.classList.add('hidden');
            this.weaponsPanelEl.classList.add('hidden');
          }
        }, 500);
      }
    });
  }

  /**
   * Render active weapon info inside the panel, utilizing sharp blueprint SVGs.
   */
  renderWeaponDetails() {
    const titleContainer = this.overlayEl.querySelector('#weapon-title-container');
    const detailsContainer = this.overlayEl.querySelector('#weapon-details-container');
    const w = WeaponConfig[this.currentWeapon];
    if (!w) return;

    const isRanged = w.category === 'ranged';
    let accentColor = 'var(--cyan-spatial)'; // default for ranged
    let accentRgb = '0, 242, 254'; // default for ranged
    if (!isRanged) {
      if (w.id === 'katana') {
        accentColor = '#0077ff'; // 比目前主題稍深的藍
        accentRgb = '0, 119, 255';
      } else if (w.id === 'blood-magic') {
        accentColor = '#ff2b3d'; // 血紅
        accentRgb = '255, 43, 61';
      } else if (w.id === 'crimson-clan') {
        accentColor = '#ff7b00'; // 火橘
        accentRgb = '255, 123, 0';
      } else {
        accentColor = 'var(--violet-spell)';
        accentRgb = '157, 78, 221';
      }
    }

    // Update Top Title Panel
    const isSpecialRanged = (this.currentWeapon === 'blood-magic' || this.currentWeapon === 'crimson-clan');
    titleContainer.innerHTML = `
      <h2 style="font-family: 'Rajdhani', sans-serif; font-size: 1.6rem; color: #fff; margin: 0 0 4px 0; letter-spacing: 1px; text-align: left;">
        ${w.name} 
        <span style="font-size: 0.85rem; padding: 2px 8px; border-radius: 4px; background: ${isRanged ? 'rgba(0,242,254,0.1)' : (isSpecialRanged ? 'rgba(0,255,204,0.1)' : 'rgba(157,78,221,0.1)')}; color: ${isSpecialRanged ? 'var(--cyan-spatial)' : accentColor}; font-weight: bold; margin-left: 8px;">
          ${isRanged ? '遠程槍械類' : (isSpecialRanged ? '遠程技能組' : '近戰技能組')}
        </span>
      </h2>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.3; text-align: left;">${w.description}</p>
    `;

    // Coordinates mapping for outer nodes (Flat Hexagonal Hive Grid with top-center node alignment)
    // Synchronously enlarged (162x140px) and spaced slightly further apart (D = 155px) relative to center (290px, 260px)
    const coords = {
      'fire': { left: '290px', top: '105px', label: '射擊' },
      'reload': { left: '156px', top: '182px', label: '換彈' },
      'aim': { left: '156px', top: '338px', label: '瞄準射擊' },
      'slash': { left: '424px', top: '182px', label: '揮舞' },
      'skill': { left: '424px', top: '338px', label: '蓄力技能' },
      'ult': { left: '290px', top: '415px', label: '蓄力大招' }
    };

    // Construct Hexagonal Hive layout HTML using inline SVGs for perfect borders
    let nodesHtml = `
      <!-- Center passive node (180x156px) -->
      <div class="hive-node center-node" id="hive-center-passive" style="left: 290px; top: 260px;">
        <svg width="100%" height="100%" viewBox="0 0 180 156" style="position: absolute; top:0; left:0; z-index:1;">
          <polygon points="46,2 134,2 178,78 134,154 46,154 2,78" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" stroke-width="2" style="transition: all 0.3s;"></polygon>
        </svg>
        <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; z-index: 5;">核心被動</div>
        <div style="font-size: 1.05rem; font-weight: bold; color: ${accentColor}; font-family: 'Rajdhani', sans-serif; z-index: 5; margin-top: 4px;">${w.passive.name}</div>
      </div>
    `;

    Object.keys(coords).forEach(key => {
      const action = w.hiveActions[key];
      const coord = coords[key];
      const isDisabled = !action.active;

      const strokeColor = isDisabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)';
      const fillColor = isDisabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.04)';

      nodesHtml += `
        <div class="hive-node outer-node ${isDisabled ? 'disabled-node' : ''}" 
             data-action-key="${key}"
             style="left: ${coord.left}; top: ${coord.top};">
          <svg class="hex-svg" width="100%" height="100%" viewBox="0 0 162 140" style="position: absolute; top:0; left:0; z-index:1;">
            <polygon points="42,2 120,2 160,70 120,138 42,138 2,70" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" style="transition: all 0.3s;"></polygon>
          </svg>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 2px; z-index: 5;">${coord.label}</div>
          <div style="font-size: 0.9rem; font-weight: bold; font-family: 'Rajdhani', sans-serif; line-height: 1.1; z-index: 5;">${isDisabled ? '已停用' : action.name}</div>
        </div>
      `;
    });

    // Hover details panel
    nodesHtml += `
      <div class="hive-hover-panel">
        <div class="hive-hover-title" id="hive-hover-title">核心被動：${w.passive.name}</div>
        <div class="hive-hover-desc" id="hive-hover-desc">${w.passive.description}</div>
      </div>
    `;

    detailsContainer.innerHTML = nodesHtml;
    detailsContainer.style.setProperty('--hive-accent', accentColor);
    detailsContainer.style.setProperty('--hive-accent-rgb', accentRgb);

    // Add interactivity to the hexagon nodes
    const hoverTitle = detailsContainer.querySelector('#hive-hover-title');
    const hoverDesc = detailsContainer.querySelector('#hive-hover-desc');
    const outerNodes = detailsContainer.querySelectorAll('.hive-node.outer-node');
    const centerNode = detailsContainer.querySelector('.hive-node.center-node');

    // Reset selected skill key if we changed weapon
    if (this.lastRenderedWeapon !== this.currentWeapon) {
      this.selectedSkillKey = 'passive';
      this.lastRenderedWeapon = this.currentWeapon;
    }

    const updateStableDisplay = () => {
      centerNode.classList.remove('active-guide');
      outerNodes.forEach(node => node.classList.remove('active-guide'));

      if (this.selectedSkillKey && this.selectedSkillKey !== 'passive') {
        const action = w.hiveActions[this.selectedSkillKey];
        hoverTitle.innerHTML = `手勢操作：${coords[this.selectedSkillKey].label} ◀ ${action.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = action.desc;

        // Highlight the selected outer node
        const node = detailsContainer.querySelector(`[data-action-key="${this.selectedSkillKey}"]`);
        if (node) node.classList.add('active-guide');
      } else {
        hoverTitle.innerHTML = `核心被動：${w.passive.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = w.passive.description;
        centerNode.classList.add('active-guide');
      }
    };

    // Set initial display state
    updateStableDisplay();

    outerNodes.forEach(node => {
      if (node.classList.contains('disabled-node')) return;

      const key = node.getAttribute('data-action-key');
      const action = w.hiveActions[key];

      node.addEventListener('mouseenter', () => {
        centerNode.classList.remove('active-guide');
        outerNodes.forEach(n => n.classList.remove('active-guide'));
        node.classList.add('active-guide');
        hoverTitle.innerHTML = `手勢操作：${coords[key].label} ◀ ${action.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = action.desc;
      });

      node.addEventListener('mouseleave', updateStableDisplay);

      node.addEventListener('click', () => {
        this.selectedSkillKey = key;
        updateStableDisplay();
      });
    });

    centerNode.addEventListener('mouseenter', () => {
      centerNode.classList.add('active-guide');
      outerNodes.forEach(node => node.classList.remove('active-guide'));
      hoverTitle.innerHTML = `核心被動：${w.passive.name}`;
      hoverTitle.style.color = accentColor;
      hoverDesc.textContent = w.passive.description;
    });
    centerNode.addEventListener('mouseleave', updateStableDisplay);
    centerNode.addEventListener('click', () => {
      this.selectedSkillKey = 'passive';
      updateStableDisplay();
    });
  }

  /**
   * Translate hand tracking coordinates (normalized 0-1) to UI cursor clicks.
   * Enables hands-free menu interaction.
   * 
   * @param {number} cursorX - Hand coordinates on X axis (0 = left, 1 = right)
   * @param {number} cursorY - Hand coordinates on Y axis (0 = top, 1 = bottom)
   * @param {boolean} isPinching - True if index and thumb are pinched together
   * @param {boolean} isPinchStarting - True if index and thumb are closing in to pinch
   */
  updateGestureCursor(cursorX, cursorY, isPinching, isPinchStarting = false) {
    // Skip hover/click processing if a panel transition is currently active (collapsing)
    const isWeaponsTransitioning = this.weaponsPanelEl && !this.weaponsPanelEl.classList.contains('hidden') && !this.weaponsPanelEl.classList.contains('active-anim');
    const isTestTransitioning = this.app.gestureTestWindow && this.app.gestureTestWindow.overlayEl && !this.app.gestureTestWindow.overlayEl.classList.contains('hidden') && !this.app.gestureTestWindow.overlayEl.classList.contains('active-anim');

    if (isWeaponsTransitioning || isTestTransitioning) {
      if (this.cursorEl) this.cursorEl.classList.remove('active');
      return;
    }

    const currentState = this.app.stateManager.getState();
    const isUIState = currentState === 'MENU' || currentState === 'TEST_MODE' || currentState === 'PAUSED';

    // Hot-swap detection: if the physical mouse was moved in the last 1.5 seconds, hide the gesture cursor
    const mouseActiveThreshold = 1500;
    const isMouseActive = (Date.now() - this.lastMouseMoveTime) < mouseActiveThreshold;

    if (isMouseActive || !isUIState || cursorX === undefined || cursorY === undefined) {
      if (this.cursorEl) this.cursorEl.classList.remove('active');
      return;
    }

    // Freeze coordinates if a pinch is starting or active to prevent index finger tip drift
    if (isPinchStarting && this.lastGestureX !== undefined && this.lastGestureY !== undefined) {
      cursorX = this.lastGestureX;
      cursorY = this.lastGestureY;
    } else {
      this.lastGestureX = cursorX;
      this.lastGestureY = cursorY;
    }

    // 1. Clamp and map normalized coords based on calibration bounds
    let mappedX = (cursorX - this.calib_xMin) / (this.calib_xMax - this.calib_xMin);
    let mappedY = (cursorY - this.calib_yMin) / (this.calib_yMax - this.calib_yMin);

    // Clamp to 0-1
    mappedX = Math.max(0, Math.min(1, mappedX));
    mappedY = Math.max(0, Math.min(1, mappedY));

    // Map to window size (using mirrored X alignment)
    const screenX = (1 - mappedX) * window.innerWidth;
    const screenY = mappedY * window.innerHeight;

    // 2. Position cursor
    this.cursorEl.style.left = `${screenX}px`;
    this.cursorEl.style.top = `${screenY}px`;
    this.cursorEl.classList.add('active');

    // 3. Find element under cursor for hover emulation (simulates mouseenter/mouseleave)
    this.cursorEl.style.display = 'none';
    const rawTarget = document.elementFromPoint(screenX, screenY);
    this.cursorEl.style.display = 'block';

    const targetNode = rawTarget ? rawTarget.closest('.hive-node, button, .weapon-item, .mode-tab-btn, .cam-filter-slider, .cam-reset-btn') : null;

    if (targetNode !== this.lastHoveredElement) {
      if (this.lastHoveredElement) {
        const leaveEvent = new MouseEvent('mouseleave', { bubbles: false, cancelable: true });
        this.lastHoveredElement.dispatchEvent(leaveEvent);
      }
      if (targetNode) {
        const enterEvent = new MouseEvent('mouseenter', { bubbles: false, cancelable: true });
        targetNode.dispatchEvent(enterEvent);
      }
      this.lastHoveredElement = targetNode;
    }

    // 4. Update pinch visualization
    if (isPinching) {
      this.cursorEl.classList.add('pinched');

      // Trigger virtual click (with cooldown to prevent multiple triggers)
      if (!this.clickCooldown) {
        this.clickCooldown = true;
        this.triggerVirtualClick(screenX, screenY);

        setTimeout(() => {
          this.clickCooldown = false;
        }, 800); // 800ms click cooldown
      }
    } else {
      this.cursorEl.classList.remove('pinched');
    }
  }

  /**
   * Find element under cursor coordinates and fire click event if it's an active button.
   */
  triggerVirtualClick(x, y) {
    // Hide cursor temporarily to inspect underlying element
    this.cursorEl.style.display = 'none';
    const target = document.elementFromPoint(x, y);
    this.cursorEl.style.display = 'block';

    if (!target) return;

    // Check if target is a button, weapon item, or skill hex node
    const clickable = target.closest('button, .weapon-item, .hive-node');
    if (clickable) {
      console.log(`%c[GestureClick] Virtual clicked: ${clickable.id || clickable.className}`, 'color: #ff007f; font-weight: bold;');

      // Dispatch a native bubbling click event to ensure custom div listeners are fired
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      clickable.dispatchEvent(clickEvent);

      // Provide a brief haptic visual feedback using class instead of inline style to prevent transform conflicts
      clickable.classList.add('virtual-clicked');
      setTimeout(() => {
        clickable.classList.remove('virtual-clicked');
      }, 150);
    }
  }

  showMenu() {
    // Handled by state subscription
  }
  showDebugOverlay() {
    // Handled by state subscription
  }
  showGameHUD() {
    // Handled by state subscription
  }
  showPauseMenu() {
    // Handled by state subscription
  }
  update(timestamp) {
    // Optional animations tick
  }
}
