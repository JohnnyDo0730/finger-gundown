import { BaseView } from './BaseView.js';

// Hand joint links
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

// Pose links (Shoulders and arms)
const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16]
];

/**
 * GestureTestView - Decoupled Concurrent Dual-Hand Diagnostic View.
 * Directly subscribes to VisionManager callbacks, implementing unified
 * canvas-only rendering (Option B) for video frames and skeletons.
 */
export class GestureTestView extends BaseView {
  constructor(app) {
    super(app);
    this.activeTestMode = localStorage.getItem('gesture_test_mode_tab') || 'basic';
    const savedShowVideo = localStorage.getItem('gesture_test_show_video');
    this.showVideoFeed = savedShowVideo === null ? false : (savedShowVideo === 'true');
    this.showSkeleton = true;

    // Load filter settings from VisionManager
    this.camBrightness = this.app.visionManager.camBrightness;
    this.camContrast = this.app.visionManager.camContrast;

    // Canvas rendering context
    this.canvasEl = null;
    this.ctx = null;
    
    // Bind frame callback to instance
    this.resultsHandler = (results) => this.onResults(results);

    // Tracks current engine-managed card states: 'charging' | 'danger' | 'suppressed'
    this.cardStates = {};
    this.isPinchingActive = false;
    this.latestSlash = null;
    
    // Calibration parameters
    this.latestVisionResults = null;
    this.calibrationStep = 0; // 0 = Idle, 1 = TL, 2 = TR, 3 = BL, 4 = BR, 5 = Done
    this.calibPoints = [];
    this.recordedPoses = this.loadRecordedPoses();
  }

  createDOM() {
    const layout = document.createElement('div');
    layout.id = 'gesture-test-panel';
    layout.className = 'gesture-test-layout view-panel';

    layout.innerHTML = `
      <!-- Block A: Top Center Header (Tab Switches) -->
      <div id="floating-panel-top" class="floating-panel top-panel">
        <div class="panel-header-compact">操作測試與手勢教學</div>
        <div class="tabs-list">
          <button class="mode-tab-btn" data-mode="basic">測試<br>基礎手勢</button>
          <button class="mode-tab-btn" data-mode="ranged">測試<br>槍械手勢</button>
          <button class="mode-tab-btn" data-mode="melee">測試<br>技能手勢</button>
          <button class="mode-tab-btn" data-mode="calibrate">定位<br>校準</button>
          <button class="mode-tab-btn dev-tab" data-mode="record">手勢錄入<br>(開發者)</button>
        </div>
      </div>

      <!-- Block B: Left Column Panel (Left Hand Gestures) -->
      <div id="floating-panel-left" class="floating-panel side-panel left-panel test-panel-scroll">
        <div class="side-panel-title">◀ 左手偵測項目 (Left Hand)</div>
        
        <!-- Left Hand Cards -->
        <div class="gesture-card" id="card-left-joystick">
          <h4>移動搖桿 <span class="status-dot"></span></h4>
          <p>前進 (前傾掌) / 後退 (握拳) / 左右偏擺</p>
          <div class="joystick-wrapper">
            <canvas id="left-joystick-canvas" class="joystick-canvas" width="110" height="110"></canvas>
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

      <!-- Block C: Center Viewport Panel (Video Stream Placeholders) -->
      <div id="floating-panel-center" class="floating-panel center-panel">
        <div class="center-controls-bar" style="justify-content: space-between; width: 100%;">
          <!-- Left side: Toggle video / skeleton -->
          <div style="display: flex; gap: calc(0.8 * var(--scale-unit));">
            <button id="btn-toggle-video" class="view-ctrl-btn">顯示視訊</button>
            <button id="btn-toggle-skeleton" class="view-ctrl-btn active">僅顯示骨架</button>
          </div>
          
          <!-- Right side: Camera filter sliders and reset button -->
          <div style="display: flex; align-items: center; gap: calc(1.5 * var(--scale-unit));">
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
              <span style="font-size: calc(1 * var(--scale-unit)); color: var(--text-muted);">☀ 亮度: <span id="brightness-val">${this.camBrightness}</span>%</span>
              <input type="range" id="slider-brightness" class="cyber-range-input" style="width: calc(15 * var(--scale-unit)); cursor: pointer;" min="50" max="200" step="5" value="${this.camBrightness}">
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
              <span style="font-size: calc(1 * var(--scale-unit)); color: var(--text-muted);">◑ 對比: <span id="contrast-val">${this.camContrast}</span>%</span>
              <input type="range" id="slider-contrast" class="cyber-range-input" style="width: calc(15 * var(--scale-unit)); cursor: pointer;" min="50" max="200" step="5" value="${this.camContrast}">
            </div>
            <button id="btn-reset-filters" class="view-ctrl-btn" style="height: 100%; border-color: rgba(255, 255, 255, 0.15); color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: calc(0.6 * var(--scale-unit)) calc(1 * var(--scale-unit));">↺ 預設</button>
          </div>
        </div>
        
        <div class="viewport-box">
          <span id="camera-status-label" class="camera-status">狀態：等待連接相機...</span>
          <canvas id="test-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform: scaleX(-1); z-index: 2;"></canvas>
          <div id="canvas-placeholder-feed" class="viewport-placeholder">
            <span style="font-family: 'Share Tech Mono', monospace; font-size: calc(2 * var(--scale-unit)); color: var(--cyan-spatial); display: block; margin-bottom: 1vh; letter-spacing: 2px;">NEURAL SCREEN ACTIVE</span>
            <span style="font-size: calc(1.2 * var(--scale-unit)); color: var(--text-muted);">請開啟右下角鏡頭或進入測試模式...</span>
          </div>
        </div>

        <!-- Calibration instructions pane -->
        <div id="calibration-guide-container" class="calibration-panel">
          <h4>定位範圍校準指引 (Calibration Guide)</h4>
          <ul class="calibration-list">
            <li>請依序在手部擺動最舒適的四個角落執行 Pinch 捏合手勢。</li>
            <li>系統將記錄極值：左上、右上、左下、右下之極限點。</li>
            <li>完成四點定位校準後，手勢游標即可完美映射至整個螢幕邊界。</li>
          </ul>
        </div>

        <!-- Inline Developer Recorder (Displays in Center when record tab is active) -->
        <div id="recorder-controls-panel" class="developer-record-panel hidden">
          <h4>手勢姿勢記錄器 (Developer Pose Recorder)</h4>
          <div class="record-input-group">
            <input type="text" id="record-pose-name" placeholder="請輸入當前姿勢名稱 (例如: 右手-開槍)">
            <button id="btn-record-pose" class="record-btn">錄製當前格</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin: 4px 0;">
            <div class="record-stats">目前已錄製格數：<span id="record-pose-count" style="color:var(--crimson-danger); font-weight:bold;">0</span></div>
          </div>
          <div class="record-actions">
            <button id="btn-download-poses" class="action-btn download-btn">下載 JSON 檔案</button>
            <button id="btn-clear-poses" class="action-btn clear-btn">清除全部暫存</button>
          </div>
          <textarea id="record-preview-box" class="preview-box" readonly>尚無錄製紀錄。請輸入名稱並點選「錄製當前格」。</textarea>
        </div>
      </div>

      <!-- Block D: Right Column Panel (Right Hand Gestures) -->
      <div id="floating-panel-right" class="floating-panel side-panel right-panel test-panel-scroll">
        <div class="side-panel-title">右手偵測項目 (Right Hand) ▶</div>
        
        <!-- Right Hand Cards -->
        <div class="gesture-card" id="card-right-cursor">
          <h4>選單游標座標 <span class="status-dot"></span></h4>
          <p>移入右手，以大拇指頂點映射游標位置</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-pinch">
          <h4>Pinch 捏合點擊 <span class="status-dot"></span></h4>
          <p>大拇指與食指捏合碰觸以點選或開火</p>
          <div class="card-status-text">等待右手偵測...</div>
        </div>

        <div class="gesture-card" id="card-right-gun">
          <h4>開火射擊 <span class="status-dot"></span></h4>
          <p>右手移入瞄準(Aim) / 碰觸捏合開槍(Fire)</p>
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

      <!-- Block E: Bottom Center Panel (Exit Button) -->
      <button id="btn-return-menu" class="floating-panel bottom-panel">返回主選單</button>
    `;

    return layout;
  }

  bindEvents() {
    // DOM bindings
    const backBtn = this.domElement.querySelector('#btn-return-menu');
    const tabBtns = this.domElement.querySelectorAll('.mode-tab-btn');
    const brightnessSlider = this.domElement.querySelector('#slider-brightness');
    const contrastSlider = this.domElement.querySelector('#slider-contrast');
    const brightnessVal = this.domElement.querySelector('#brightness-val');
    const contrastVal = this.domElement.querySelector('#contrast-val');
    const toggleVideoBtn = this.domElement.querySelector('#btn-toggle-video');
    const toggleSkeletonBtn = this.domElement.querySelector('#btn-toggle-skeleton');
    
    this.canvasEl = this.domElement.querySelector('#test-canvas');
    if (this.canvasEl) {
      this.ctx = this.canvasEl.getContext('2d');
      // Sync canvas dimensions with parent
      this.resizeCanvas();
      window.addEventListener('resize', this.resizeHandler = () => this.resizeCanvas());
    }

    // Return to main menu
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.app.stateManager.transitionTo('MENU');
      });
    }

    // Toggle Modes
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        localStorage.setItem('gesture_test_mode_tab', mode);
        this.selectMode(mode);
        if (this.app.gestureEngine) {
          this.app.gestureEngine.setDebugTab(mode);
        }
      });
    });

    // Camera pre-filtering sliders updates
    if (brightnessSlider && brightnessVal) {
      brightnessSlider.addEventListener('input', (e) => {
        this.camBrightness = parseInt(e.target.value, 10);
        brightnessVal.textContent = this.camBrightness;
        this.app.visionManager.updateFilters(this.camBrightness, this.camContrast);
      });
    }

    if (contrastSlider && contrastVal) {
      contrastSlider.addEventListener('input', (e) => {
        this.camContrast = parseInt(e.target.value, 10);
        contrastVal.textContent = this.camContrast;
        this.app.visionManager.updateFilters(this.camBrightness, this.camContrast);
      });
    }

    // Toggle camera visual streams modes
    if (toggleVideoBtn && toggleSkeletonBtn) {
      // Sync initial active state
      if (this.showVideoFeed) {
        toggleVideoBtn.classList.add('active');
        toggleSkeletonBtn.classList.remove('active');
      } else {
        toggleVideoBtn.classList.remove('active');
        toggleSkeletonBtn.classList.add('active');
      }

      toggleVideoBtn.addEventListener('click', () => {
        this.showVideoFeed = true;
        localStorage.setItem('gesture_test_show_video', 'true');
        toggleVideoBtn.classList.add('active');
        toggleSkeletonBtn.classList.remove('active');
      });

      toggleSkeletonBtn.addEventListener('click', () => {
        this.showVideoFeed = false;
        localStorage.setItem('gesture_test_show_video', 'false');
        toggleVideoBtn.classList.remove('active');
        toggleSkeletonBtn.classList.add('active');
      });
    }

    // Reset filters
    const resetBtn = this.domElement.querySelector('#btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.camBrightness = 100;
        this.camContrast = 110;
        if (brightnessSlider) {
          brightnessSlider.value = 100;
          brightnessVal.textContent = 100;
        }
        if (contrastSlider) {
          contrastSlider.value = 110;
          contrastVal.textContent = 110;
        }
        this.app.visionManager.updateFilters(100, 110);
      });
    }

    // Developer Pose Recorder buttons
    const recordBtn = this.domElement.querySelector('#btn-record-pose');
    const downloadBtn = this.domElement.querySelector('#btn-download-poses');
    const clearBtn = this.domElement.querySelector('#btn-clear-poses');

    if (recordBtn) {
      recordBtn.addEventListener('click', () => this.recordPoseCurrentFrame());
    }
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadPoses());
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearPoses());
    }
    this.updateRecordUI();

    // Define GestureEngine event listeners for active card transitions
    this.fireStateListener = (data) => {
      const wasPinching = this.isPinchingActive;
      this.isPinchingActive = data.active;

      // Detect rising edge of pinch click for calibration
      if (data.active && !wasPinching) {
        if (this.activeTestMode === 'calibrate' && this.calibrationStep >= 1 && this.calibrationStep <= 4) {
          const landmarks = this.latestVisionResults && this.latestVisionResults.rightHandLandmarks;
          if (landmarks && landmarks[4]) {
            const rawThumb = landmarks[4];
            this.handleCalibrationPinch(rawThumb.x, rawThumb.y);
          }
        }
      }
    };

    this.moveListener = (data) => {
      const cardId = 'card-left-joystick';
      const isMoving = data.moveX !== 0 || data.moveY !== 0;
      
      // Update joystick canvas knob
      this.drawStaticJoystick(data.moveX, data.moveY);

      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        // Only update status class if NOT locked by dynamic lockout!
        if (!this.cardStates[cardId]) {
          if (isMoving) {
            card.classList.add('active');
            card.classList.remove('ready');
          } else {
            card.classList.remove('active');
            card.classList.add('ready');
          }
        }
      }
    };

    this.syncAimListener = (data) => {
      const leftCardId = 'card-left-aim';
      const rightCardId = 'card-right-sync-aim-fire';

      const leftCard = this.domElement.querySelector(`#${leftCardId}`);
      if (leftCard && !leftCard.classList.contains('disabled-item')) {
        if (data.active) {
          this.cardStates[leftCardId] = 'danger'; // Register as engine-controlled danger state
          const txt = leftCard.querySelector('.card-status-text');
          const multiplier = 1.0 + (data.zoom || 0) * 3.0; // Map ratio to 1.0x - 4.0x range
          if (txt) txt.textContent = `瞄準鏡開啟 (倍率: ${multiplier.toFixed(1)}x)`;
        } else {
          delete this.cardStates[leftCardId];
        }
      }

      const rightCard = this.domElement.querySelector(`#${rightCardId}`);
      if (rightCard && !rightCard.classList.contains('disabled-item')) {
        if (data.active) {
          this.cardStates[rightCardId] = 'danger'; // Register as engine-controlled danger state
          const txt = rightCard.querySelector('.card-status-text');
          if (txt) txt.textContent = `瞄準微調：X: ${data.deltaX.toFixed(2)} | Y: ${data.deltaY.toFixed(2)}`;
        } else {
          delete this.cardStates[rightCardId];
        }
      }
    };

    this.slashListener = (data) => {
      const cardId = 'card-right-slash';
      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        this.cardStates[cardId] = 'danger'; // Turn red on trigger success
        
        // Save visual arrow parameters
        this.latestSlash = {
          dirX: data.dirX,
          dirY: data.dirY,
          time: Date.now()
        };

        const txt = card.querySelector('.card-status-text');
        if (txt) txt.textContent = `斬擊觸發！速度: ${data.speed.toFixed(1)} m/s`;
        if (card._flashTimeout) clearTimeout(card._flashTimeout);
        card._flashTimeout = setTimeout(() => {
          delete this.cardStates[cardId];
        }, 800); // 800ms matches the arrow visibility duration
      }
    };

    this.reloadStateListener = (data) => {
      const cardId = 'card-right-reload';
      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        if (data.active) {
          this.cardStates[cardId] = 'charging';
          const txt = card.querySelector('.card-status-text');
          if (txt) txt.textContent = '換彈蓄力中...';
        } else {
          delete this.cardStates[cardId];
        }
      }
    };

    this.skillStateListener = (data) => {
      const cardId = 'card-right-skill';
      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        if (data.active) {
          this.cardStates[cardId] = 'charging';
          const txt = card.querySelector('.card-status-text');
          if (txt) txt.textContent = '蓄力技能中...';
        } else {
          delete this.cardStates[cardId];
        }
      }
    };

    this.ultStateListener = (data) => {
      const cardIds = ['card-right-sync-ult', 'card-left-ult'];
      cardIds.forEach(cardId => {
        const card = this.domElement.querySelector(`#${cardId}`);
        if (card && !card.classList.contains('disabled-item')) {
          if (data.active) {
            this.cardStates[cardId] = 'charging';
            const txt = card.querySelector('.card-status-text');
            if (txt) txt.textContent = '大招蓄力中...';
          } else {
            delete this.cardStates[cardId];
          }
        }
      });
    };

    this.pauseStateListener = (data) => {
      const cardId = 'card-left-pause';
      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        if (data.active) {
          this.cardStates[cardId] = 'charging';
          const txt = card.querySelector('.card-status-text');
          if (txt) txt.textContent = '暫停判定中...';
        } else {
          delete this.cardStates[cardId];
        }
      }
    };

    this.pauseTriggerListener = () => {
      const cardId = 'card-left-pause';
      const card = this.domElement.querySelector(`#${cardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        this.cardStates[cardId] = 'danger';
        const txt = card.querySelector('.card-status-text');
        if (txt) txt.textContent = '暫停遊戲觸發！';
        
        if (card._pauseTimeout) clearTimeout(card._pauseTimeout);
        card._pauseTimeout = setTimeout(() => {
          delete this.cardStates[cardId];
        }, 1200);
      }
    };

    this.syncAimStateListener = (data) => {
      const leftCardId = 'card-left-aim';
      const card = this.domElement.querySelector(`#${leftCardId}`);
      if (card && !card.classList.contains('disabled-item')) {
        if (data.charging) {
          this.cardStates[leftCardId] = 'charging';
          const txt = card.querySelector('.card-status-text');
          if (txt) {
            txt.textContent = data.type === 'entering' 
              ? '瞄準模式切換中... (蓄力0.5s)' 
              : '退出瞄準模式中... (蓄力0.5s)';
          }
        } else {
          if (this.cardStates[leftCardId] === 'charging') {
            delete this.cardStates[leftCardId];
          }
        }
      }
    };

    this.lockoutListener = (data) => {
      const actionCardMap = {
        'reload': ['card-right-reload'],
        'skill': ['card-right-skill'],
        'ult': ['card-right-sync-ult', 'card-left-ult']
      };

      const actionToCardIdMap = {
        'aim': ['card-right-cursor'],
        'fire': ['card-right-pinch', 'card-right-gun'],
        'sync_aim': ['card-left-aim', 'card-right-sync-aim-fire'],
        'reload': ['card-right-reload'],
        'slash': ['card-right-slash'],
        'skill': ['card-right-skill'],
        'ult': ['card-right-sync-ult', 'card-left-ult'],
        'move': ['card-left-joystick']
      };

      if (data.active) {
        // 1. Highlight the card(s) that triggered the lockout in red (danger)
        const triggerCardIds = actionCardMap[data.action] || [];
        triggerCardIds.forEach(triggerCardId => {
          this.cardStates[triggerCardId] = 'danger';
          const card = this.domElement.querySelector(`#${triggerCardId}`);
          if (card && !card.classList.contains('disabled-item')) {
            const txt = card.querySelector('.card-status-text');
            const actionText = data.action === 'reload' ? '裝彈中' : '施法中';
            if (txt) txt.textContent = `${actionText} (${(data.duration / 1000).toFixed(1)}s)`;

            let remaining = data.duration;
            if (card._lockoutInterval) clearInterval(card._lockoutInterval);
            card._lockoutInterval = setInterval(() => {
              remaining -= 100;
              if (remaining <= 0) {
                clearInterval(card._lockoutInterval);
              } else {
                if (txt) txt.textContent = `${actionText} (${(remaining / 1000).toFixed(1)}s)`;
              }
            }, 100);
          }
        });

        // 2. Grey out all other cards that are temporarily suppressed/blocked
        if (data.suppressedActions) {
          data.suppressedActions.forEach(action => {
            if (action === data.action) return; // Skip trigger card
            const cardIds = actionToCardIdMap[action] || [];
            cardIds.forEach(cardId => {
              if (triggerCardIds.includes(cardId)) return;
              const card = this.domElement.querySelector(`#${cardId}`);
              if (card && !card.classList.contains('disabled-item')) {
                this.cardStates[cardId] = 'suppressed';
                const txt = card.querySelector('.card-status-text');
                if (txt) {
                  if (cardId === 'card-left-joystick') {
                    txt.textContent = '施法中：移動鎖定';
                    this.drawStaticJoystick(0, 0);
                  } else {
                    txt.textContent = '動作禁用中 (鎖定)';
                  }
                }
              }
            });
          });
        }
      } else {
        // Lockout finished: Release the trigger card(s)
        const triggerCardIds = actionCardMap[data.action] || [];
        triggerCardIds.forEach(triggerCardId => {
          delete this.cardStates[triggerCardId];
          const card = this.domElement.querySelector(`#${triggerCardId}`);
          if (card) {
            card.classList.remove('danger', 'suppressed-item', 'charging');
            card.classList.add('ready');
            if (card._lockoutInterval) {
              clearInterval(card._lockoutInterval);
              card._lockoutInterval = null;
            }
            const txt = card.querySelector('.card-status-text');
            if (txt) txt.textContent = '就緒';
          }
        });

        // Release all suppressed cards
        Object.values(actionToCardIdMap).flat().forEach(cardId => {
          if (triggerCardIds.includes(cardId)) return;
          delete this.cardStates[cardId];
          const card = this.domElement.querySelector(`#${cardId}`);
          if (card) {
            card.classList.remove('danger', 'suppressed-item', 'charging');
            card.classList.add('ready');
            const txt = card.querySelector('.card-status-text');
            if (txt) {
              const side = cardId.includes('left') ? '左手' : '右手';
              txt.textContent = `等待${side}偵測...`;
            }
          }
        });
      }
    };

    if (this.app.gestureEngine) {
      this.app.gestureEngine.addEventListener('ON_FIRE', this.fireStateListener);
      this.app.gestureEngine.addEventListener('ON_MOVE', this.moveListener);
      this.app.gestureEngine.addEventListener('ON_SYNC_AIM', this.syncAimListener);
      this.app.gestureEngine.addEventListener('ON_SYNC_AIM_STATE', this.syncAimStateListener);
      this.app.gestureEngine.addEventListener('ON_SLASH', this.slashListener);
      this.app.gestureEngine.addEventListener('ON_RELOAD_STATE', this.reloadStateListener);
      this.app.gestureEngine.addEventListener('ON_SKILL_STATE', this.skillStateListener);
      this.app.gestureEngine.addEventListener('ON_ULT_STATE', this.ultStateListener);
      this.app.gestureEngine.addEventListener('ON_PAUSE', this.pauseTriggerListener);
      this.app.gestureEngine.addEventListener('ON_PAUSE_STATE', this.pauseStateListener);
      this.app.gestureEngine.addEventListener('ON_LOCKOUT', this.lockoutListener);
    }

    // Subscribe to tracking results
    this.app.visionManager.onResults(this.resultsHandler);

    // Initial setup
    this.drawStaticJoystick();
    this.selectMode(this.activeTestMode);
    if (this.app.gestureEngine) {
      this.app.gestureEngine.setDebugTab(this.activeTestMode);
    }
    this.updateCameraStatusText();
  }

  destroy() {
    // Unsubscribe from events to prevent memory leak
    if (this.app.visionManager) {
      this.app.visionManager.removeResultsListener(this.resultsHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    // Unsubscribe from GestureEngine listeners
    if (this.app.gestureEngine) {
      this.app.gestureEngine.removeEventListener('ON_FIRE', this.fireStateListener);
      this.app.gestureEngine.removeEventListener('ON_MOVE', this.moveListener);
      this.app.gestureEngine.removeEventListener('ON_SYNC_AIM', this.syncAimListener);
      this.app.gestureEngine.removeEventListener('ON_SYNC_AIM_STATE', this.syncAimStateListener);
      this.app.gestureEngine.removeEventListener('ON_SLASH', this.slashListener);
      this.app.gestureEngine.removeEventListener('ON_RELOAD_STATE', this.reloadStateListener);
      this.app.gestureEngine.removeEventListener('ON_SKILL_STATE', this.skillStateListener);
      this.app.gestureEngine.removeEventListener('ON_ULT_STATE', this.ultStateListener);
      this.app.gestureEngine.removeEventListener('ON_PAUSE', this.pauseTriggerListener);
      this.app.gestureEngine.removeEventListener('ON_PAUSE_STATE', this.pauseStateListener);
      this.app.gestureEngine.removeEventListener('ON_LOCKOUT', this.lockoutListener);
    }

    // Clear any remaining intervals on cards defensively
    if (this.domElement) {
      const cards = ['card-right-reload', 'card-right-skill', 'card-right-sync-ult'];
      cards.forEach(id => {
        const card = this.domElement.querySelector(`#${id}`);
        if (card && card._lockoutInterval) {
          clearInterval(card._lockoutInterval);
        }
      });
    }
  }

  resizeCanvas() {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    this.canvasEl.width = rect.width;
    this.canvasEl.height = rect.height;
  }

  updateCameraStatusText() {
    const statusLabel = this.domElement.querySelector('#camera-status-label');
    const placeholder = this.domElement.querySelector('#canvas-placeholder-feed');

    if (!statusLabel) return;

    if (this.app.visionManager.isMediaPipeActive) {
      statusLabel.textContent = '狀態：手勢分析中 (ACTIVE)';
      statusLabel.style.color = 'var(--cyan-spatial)';
      if (placeholder) placeholder.classList.add('hidden');
    } else if (this.app.visionManager.isActive) {
      statusLabel.textContent = '狀態：正在開啟鏡頭...';
      statusLabel.style.color = '#ffcc00';
    } else {
      statusLabel.textContent = '狀態：相機未啟用 (INACTIVE)';
      statusLabel.style.color = 'var(--text-muted)';
      if (placeholder) placeholder.classList.remove('hidden');
    }
  }

  /**
   * Main Results Callback loop triggered by VisionManager.
   */
  onResults(results) {
    this.latestVisionResults = results; // Cache latest frame for raw calibration coordinates
    this.updateCameraStatusText();

    if (!this.ctx || !this.canvasEl) return;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    // Clear canvas
    this.ctx.clearRect(0, 0, w, h);

    // Option B: Render camera preprocessed image directly as background
    if (this.showVideoFeed && results.image) {
      this.ctx.drawImage(results.image, 0, 0, w, h);
    } else {
      // Holographic privacy mode background
      this.ctx.fillStyle = '#08090d';
      this.ctx.fillRect(0, 0, w, h);
      this.drawCyberGrid(w, h);
    }

    // Draw comfortable bounds overlay if calibrate tab is active
    if (this.activeTestMode === 'calibrate') {
      const xMin = this.app.gestureEngine ? this.app.gestureEngine.calib_xMin : 0.15;
      const xMax = this.app.gestureEngine ? this.app.gestureEngine.calib_xMax : 0.85;
      const yMin = this.app.gestureEngine ? this.app.gestureEngine.calib_yMin : 0.20;
      const yMax = this.app.gestureEngine ? this.app.gestureEngine.calib_yMax : 0.80;

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([8, 6]);
      this.ctx.strokeRect(xMin * w, yMin * h, (xMax - xMin) * w, (yMax - yMin) * h);
      this.ctx.setLineDash([]);

      this.ctx.fillStyle = 'rgba(0, 255, 204, 0.06)';
      this.ctx.fillRect(xMin * w, yMin * h, (xMax - xMin) * w, (yMax - yMin) * h);

      // Draw text non-mirrored (double-flip horizontally)
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
      this.ctx.fillStyle = 'rgba(0, 255, 204, 0.9)';
      this.ctx.font = 'bold 13px Rajdhani, sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText('舒適操作活動邊界 (Comfortable Bounds)', w - (xMin * w + 12), yMin * h - 10);
      this.ctx.textAlign = 'left';
      this.ctx.restore();

      // Draw flashing target dot if calibration is in progress
      if (this.calibrationStep >= 1 && this.calibrationStep <= 4) {
        let targetX = 0;
        let targetY = 0;
        if (this.calibrationStep === 1) { targetX = xMin; targetY = yMin; }
        else if (this.calibrationStep === 2) { targetX = xMax; targetY = yMin; }
        else if (this.calibrationStep === 3) { targetX = xMin; targetY = yMax; }
        else if (this.calibrationStep === 4) { targetX = xMax; targetY = yMax; }

        const px = targetX * w;
        const py = targetY * h;

        const timeFactor = (Date.now() % 1000) / 1000;
        const radius = 15 + timeFactor * 15;

        this.ctx.save();
        this.ctx.strokeStyle = '#ff007f';
        this.ctx.lineWidth = 3;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#ff007f';

        // Inner solid dot
        this.ctx.beginPath();
        this.ctx.arc(px, py, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ff007f';
        this.ctx.fill();

        // Expanding outer ring
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    // Draw pose links
    if (results.poseLandmarks && this.showSkeleton) {
      this.drawPoseSkeleton(results.poseLandmarks, w, h);
    }

    // Draw hand skeletons
    if (results.leftHandLandmarks && this.showSkeleton) {
      this.drawHandLandmarks(results.leftHandLandmarks, w, h, '#ff007f');
    }
    if (results.rightHandLandmarks && this.showSkeleton) {
      this.drawHandLandmarks(results.rightHandLandmarks, w, h, '#00ffcc');
    }

    // Draw Melee Slash Arrow if triggered recently (within 800ms)
    if (this.latestSlash && (Date.now() - this.latestSlash.time < 800)) {
      this.drawSlashArrow(this.latestSlash.dirX, this.latestSlash.dirY);
    }

    // Update diagnostic side panels status dots & coordinates text
    this.updateHUDCards(results);
  }

  /**
   * Draw visual arrows for weapon swing vector cuts on the center canvas.
   */
  drawSlashArrow(dirX, dirY) {
    if (!this.ctx || !this.canvasEl) return;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const cx = w / 2;
    const cy = h / 2;
    const arrowLength = 80;

    // Negate dirX because canvas has CSS scaleX(-1) mirroring
    const targetX = cx + (-dirX) * arrowLength;
    const targetY = cy + dirY * arrowLength;

    this.ctx.save();
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
    this.ctx.lineTo(targetX - 18 * Math.cos(angle - Math.PI / 6), targetY - 18 * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(targetX - 18 * Math.cos(angle + Math.PI / 6), targetY - 18 * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Draw cybernetic grid lines.
   */
  drawCyberGrid(w, h) {
    this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.04)';
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
   * Draw pose skeletal bones.
   */
  drawPoseSkeleton(landmarks, w, h) {
    this.ctx.strokeStyle = 'rgba(157, 78, 221, 0.5)';
    this.ctx.lineWidth = 2.5;

    POSE_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x * w, p1.y * h);
        this.ctx.lineTo(p2.x * w, p2.y * h);
        this.ctx.stroke();
      }
    });

    // Draw joints
    this.ctx.fillStyle = '#9d4ede';
    [11, 12, 13, 14, 15, 16].forEach(idx => {
      const p = landmarks[idx];
      if (p && p.visibility > 0.5) {
        this.ctx.beginPath();
        this.ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });
  }

  /**
   * Draw hand skeletal lines and neon dots.
   */
  drawHandLandmarks(landmarks, w, h, color) {
    // Draw bones
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2.5;

    HAND_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (p1 && p2) {
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x * w, p1.y * h);
        this.ctx.lineTo(p2.x * w, p2.y * h);
        this.ctx.stroke();
      }
    });

    // Draw joints
    this.ctx.fillStyle = '#ffffff';
    landmarks.forEach(p => {
      this.ctx.beginPath();
      this.ctx.arc(p.x * w, p.y * h, 4.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
      this.ctx.stroke();
    });
  }

  /**
   * Draw default neon cyber joystick on canvas.
   */
  drawStaticJoystick(jx = 0, jy = 0) {
    const canvas = this.domElement.querySelector('#left-joystick-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 110, 110);

    const cx = 55;
    const cy = 55;
    const radius = 45;

    // Draw outer boundary circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw grid crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, 15); ctx.lineTo(cx, 95);
    ctx.moveTo(15, cy); ctx.lineTo(95, cy);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Compute stick coords
    const stickX = cx + jx * radius;
    const stickY = cy + jy * radius;

    // Draw line from center to stick
    const isActive = jx !== 0 || jy !== 0;
    if (isActive) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(stickX, stickY);
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Draw glowing center stick knob
    ctx.beginPath();
    ctx.arc(stickX, stickY, 18, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? 'rgba(0, 255, 204, 0.85)' : 'rgba(0, 242, 254, 0.65)';
    ctx.shadowBlur = isActive ? 15 : 10;
    ctx.shadowColor = '#00F2FE';
    ctx.fill();
    ctx.shadowBlur = 0; // reset
  }

  /**
   * Filter active/inactive mode cards.
   */
  selectMode(mode) {
    this.activeTestMode = mode;
    localStorage.setItem('gesture_test_mode_tab', mode);

    const tabBtns = this.domElement.querySelectorAll('.mode-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const calibrationGuide = this.domElement.querySelector('#calibration-guide-container');
    const recordControls = this.domElement.querySelector('#recorder-controls-panel');

    if (mode === 'record') {
      if (recordControls) recordControls.classList.remove('hidden');
      if (calibrationGuide) calibrationGuide.classList.add('hidden');
    } else {
      if (recordControls) recordControls.classList.add('hidden');
      if (calibrationGuide) {
        calibrationGuide.classList.remove('hidden');
        this.updateGuidePanel();
      }
    }

    // Define card availability list
    const availabilityMap = {
      // Left Hand
      'left-joystick': (mode === 'record' || mode === 'basic' || mode === 'ranged' || mode === 'melee'),
      'left-pause': (mode === 'record' || mode === 'basic' || mode === 'ranged' || mode === 'melee'),
      'left-aim': (mode === 'record' || mode === 'ranged'),
      'left-ult': (mode === 'record' || mode === 'ranged' || mode === 'melee'),

      // Right Hand
      'right-cursor': (mode === 'record' || mode === 'basic' || mode === 'calibrate' || mode === 'ranged' || mode === 'melee'),
      'right-pinch': (mode === 'record' || mode === 'basic' || mode === 'calibrate'),
      'right-gun': (mode === 'record' || mode === 'ranged' || mode === 'melee'),
      'right-reload': (mode === 'record' || mode === 'ranged'),
      'right-sync-aim-fire': (mode === 'record' || mode === 'ranged'),
      'right-slash': (mode === 'record' || mode === 'melee'),
      'right-skill': (mode === 'record' || mode === 'ranged' || mode === 'melee'),
      'right-sync-ult': (mode === 'record' || mode === 'ranged' || mode === 'melee')
    };

    Object.keys(availabilityMap).forEach(id => {
      const card = this.domElement.querySelector(`#card-${id}`);
      if (card) {
        const statusText = card.querySelector('.card-status-text');
        if (availabilityMap[id]) {
          card.classList.remove('disabled-item');
          card.classList.add('ready');
          if (statusText) {
            const handText = id.startsWith('left') ? '左手' : '右手';
            statusText.textContent = `等待${handText}偵測...`;
          }
        } else {
          card.classList.remove('ready', 'active', 'danger', 'charging');
          card.classList.add('disabled-item');
          if (statusText) {
            statusText.textContent = '未啟用';
          }
        }
      }
    });
  }

  /**
   * Sync active tracking frame visibility to details panels cards.
   */
  updateHUDCards(results) {
    const hasLeft = !!results.leftHandLandmarks;
    const hasRight = !!results.rightHandLandmarks;

    const isCardDisabled = (id) => {
      const el = this.domElement.querySelector(`#card-${id}`);
      return el && el.classList.contains('disabled-item');
    };

    const updateSingleCard = (id, side, isDetected, activeText, overrideState = null) => {
      const cardId = `card-${id}`;
      const el = this.domElement.querySelector(`#${cardId}`);
      if (!el || isCardDisabled(id)) return;

      const txt = el.querySelector('.card-status-text');

      // 1. Check if there is an engine-controlled state for this card
      const engineState = this.cardStates[cardId];
      if (engineState) {
        // Mutually exclusive: clean other states and apply only the engine state
        el.classList.remove('ready', 'active', 'charging', 'danger', 'suppressed-item');
        el.classList.add(engineState === 'suppressed' ? 'suppressed-item' : engineState);
        return;
      }

      if (!isDetected) {
        const engineState = this.cardStates[cardId];
        // If actively in dynamic lockout (danger/suppressed), DO NOT reset card to ready! Let it finish.
        if (engineState === 'danger' || engineState === 'suppressed') {
          return;
        }

        // Clean up any remaining states (like 'charging') and return card to ready/waiting
        delete this.cardStates[cardId];
        el.classList.remove('active', 'danger', 'charging', 'suppressed-item');
        el.classList.add('ready');
        if (el._lockoutInterval) {
          clearInterval(el._lockoutInterval);
          el._lockoutInterval = null;
        }
        if (txt) txt.textContent = `等待${side}偵測...`;
      } else {
        const stateClass = overrideState || 'active';
        el.classList.remove('ready', 'active', 'danger', 'charging', 'suppressed-item');
        el.classList.add(stateClass);
        if (txt) {
          txt.textContent = activeText;
        }
      }
    };

    // Update Left Hand Cards
    updateSingleCard('left-joystick', '左手', hasLeft, '左手已偵測，搖桿就緒');
    updateSingleCard('left-pause', '左手', hasLeft, '左手已偵測，手掌張開可暫停');
    updateSingleCard('left-aim', '左手', hasLeft, '左手已偵測，比 OK 進入瞄準');
    updateSingleCard('left-ult', '左手', hasLeft, '左手已偵測，等待雙手大招');

    // Update Right Hand Cards
    if (hasRight && results.rightHandLandmarks) {
      const indexTip = results.rightHandLandmarks[8];
      const thumbTip = results.rightHandLandmarks[4];
      let pinchText = '右手已偵測...';
      let isPinching = false;
      if (indexTip && thumbTip) {
        const dist = Math.sqrt((indexTip.x - thumbTip.x) ** 2 + (indexTip.y - thumbTip.y) ** 2);
        pinchText = `間距: ${dist.toFixed(3)} (Pinch 點擊)`;
        isPinching = dist < 0.035;
      }

      const pinchOrActiveState = this.isPinchingActive ? 'danger' : 'active';

      updateSingleCard('right-cursor', '右手', hasRight, indexTip ? `X: ${indexTip.x.toFixed(2)} | Y: ${indexTip.y.toFixed(2)}` : '游標準備中');
      updateSingleCard('right-pinch', '右手', hasRight, pinchText, pinchOrActiveState);
      updateSingleCard('right-gun', '右手', hasRight, '右手已偵測，捏合以開槍', pinchOrActiveState);
      updateSingleCard('right-reload', '右手', hasRight, '右手已偵測，翻轉手背以裝彈');
      updateSingleCard('right-sync-aim-fire', '右手', hasRight, '右手已偵測，控制視角');
      updateSingleCard('right-slash', '右手', hasRight, '右手已偵測，快速揮動揮舞');
      updateSingleCard('right-skill', '右手', hasRight, '右手已偵測，握拳蓄力技能');
      updateSingleCard('right-sync-ult', '右手', hasRight, '右手已偵測，比三角形大招');
    }
  }

  updateGuidePanel() {
    const guideContainer = this.domElement.querySelector('#calibration-guide-container');
    if (!guideContainer) return;

    const xMin = localStorage.getItem('gesture_calib_xMin') || '0.150';
    const xMax = localStorage.getItem('gesture_calib_xMax') || '0.850';
    const yMin = localStorage.getItem('gesture_calib_yMin') || '0.200';
    const yMax = localStorage.getItem('gesture_calib_yMax') || '0.800';

    if (this.activeTestMode === 'basic') {
      guideContainer.innerHTML = `
        <h4 style="margin-top: 0; color: var(--cyan-spatial);">基礎手勢操作指引</h4>
        <ul class="calibration-list">
          <li><strong>左手移動搖桿：</strong>掌心朝鏡頭，前傾前進、左右側傾控制轉向。</li>
          <li><strong>左手握拳後退：</strong>左手五指合攏握拳，可快速往後移動。</li>
          <li><strong>左手暫停選單：</strong>五指伸直完全併攏（掌心朝前）維持 <strong>1.0 秒</strong>，以開啟或暫停選單。</li>
          <li><strong>右手選單游標：</strong>右手移入畫面，以大拇指頂點映射游標位置。</li>
          <li><strong>右手 Pinch 點擊：</strong>大拇指與食指捏合，用以觸發選單按鈕的點選動作。</li>
        </ul>
      `;
    } else if (this.activeTestMode === 'ranged') {
      guideContainer.innerHTML = `
        <h4 style="margin-top: 0; color: var(--cyan-spatial);">槍械模式手勢指引 (Ranged Mode)</h4>
        <ul class="calibration-list">
          <li><strong>左手搖桿移動：</strong>支援前傾前進、握拳後退與併攏暫停遊戲。</li>
          <li><strong>左手精準瞄準 (Sync Aim)：</strong>左手比出【OK 手勢】維持 <strong>0.5 秒</strong>開啟；開合中指調節 1.0x ~ 4.0x 瞄準鏡倍率。</li>
          <li><strong>右手移動瞄準 (Aim)：</strong>右手移入相機畫面即可控制空間準心。</li>
          <li><strong>右手捏合開火 (Fire)：</strong>大拇指與食指捏合 (Pinch) 即可單點發射雷射。</li>
          <li><strong>右手手勢裝彈 (Reload)：</strong>將右手翻為【手背朝前且食指伸直】維持 <strong>2.0 秒</strong>，裝彈動作鎖定武器 <strong>2.0 秒</strong>。</li>
          <li><strong>右手蓄力技能 (投擲武器)：</strong>右手握拳朝上（上鉤拳姿勢）維持 <strong>1.5 秒</strong>，鎖定 <strong>1.5 秒</strong> 施法動畫。</li>
          <li><strong>雙手大招 (Plasma Shield)：</strong>雙手合攏比三角形維持 <strong>1.5 秒</strong>，鎖定 <strong>3.0 秒</strong> 發動期（期間禁止移動）。</li>
          <li style="color:#ff007f;"><em>🚫 模式限制：此模式下已禁用右手近戰揮砍 (Slash) 手勢。</em></li>
        </ul>
      `;
    } else if (this.activeTestMode === 'melee') {
      guideContainer.innerHTML = `
        <h4 style="margin-top: 0; color: var(--cyan-spatial);">近戰與技能模式手勢指引 (Melee Mode)</h4>
        <ul class="calibration-list">
          <li><strong>左手搖桿移動：</strong>支援前傾前進、握拳後退與併攏暫停遊戲。</li>
          <li><strong>右手近戰揮砍 (Slash)：</strong>食指指尖快速揮掃（速度門檻需高於 1.5 units/s）以劃出刀光。</li>
          <li><strong>右手普通射擊 (連發招式)：</strong>大拇指與食指捏合 (Pinch) 觸發碰觸射擊，可用於施放快速法球。</li>
          <li><strong>右手蓄力技能 (裂地衝擊)：</strong>右手握拳朝上維持 <strong>1.5 秒</strong>，鎖定 <strong>1.5 秒</strong> 施法動畫。</li>
          <li><strong>雙手大招 (Plasma Shield)：</strong>雙手合攏比三角形維持 <strong>1.5 秒</strong>，鎖定 <strong>3.0 秒</strong> 發動期（期間與施法時禁止移動）。</li>
          <li style="color:#ff007f;"><em>🚫 模式限制：此模式下已禁用左手 OK 瞄準與右手 Reload 手勢。</em></li>
        </ul>
      `;
    } else if (this.activeTestMode === 'calibrate') {
      if (this.calibrationStep === 0) {
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: var(--cyan-spatial);">手勢操作定位校準 (Comfort Boundary Calibration)</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            為了讓游標對應您的手臂舒適伸展範圍，請點擊按鈕，並在相機前指示位置比出 Pinch 捏合點擊手勢。
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-family: 'Share Tech Mono', monospace; font-size: 13px;">
            <span style="color: var(--cyan-spatial);">X 範圍: [${xMin} ~ ${xMax}]</span>
            <span style="color: var(--cyan-spatial);">Y 範圍: [${yMin} ~ ${yMax}]</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="btn-start-calib" class="view-ctrl-btn active" style="flex: 1; padding: 6px 0;">開始定位校準</button>
            <button id="btn-reset-calib" class="view-ctrl-btn" style="flex: 1; padding: 6px 0; border-color: rgba(255, 255, 255, 0.15); color: var(--text-muted);">恢復預設</button>
          </div>
        `;

        const startBtn = guideContainer.querySelector('#btn-start-calib');
        const resetBtn = guideContainer.querySelector('#btn-reset-calib');

        if (startBtn) {
          startBtn.addEventListener('click', () => {
            this.calibrationStep = 1;
            this.calibPoints = [];
            this.updateGuidePanel();
          });
        }
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            localStorage.removeItem('gesture_calib_xMin');
            localStorage.removeItem('gesture_calib_xMax');
            localStorage.removeItem('gesture_calib_yMin');
            localStorage.removeItem('gesture_calib_yMax');
            if (this.app.gestureEngine) {
              this.app.gestureEngine.loadCalibrationData();
            }
            this.calibrationStep = 0;
            this.calibPoints = [];
            this.updateGuidePanel();
          });
        }
      } else if (this.calibrationStep === 1) {
        // xMin, yMin in canvas space renders as Top-Right on scaleX(-1) mirrored screen
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: #ff007f;">定位步驟 1 / 4：右上角</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            請將右手移動到舒適範圍的 <strong style="color: #ff007f;">【右上角】</strong>（對應畫面右上閃爍標靶）並做一次 Pinch 捏合點擊。
          </p>
          <div style="font-family: 'Share Tech Mono', monospace; font-size: 12px; color: var(--cyan-spatial); text-align: center; border: 1px dashed rgba(0, 242, 254, 0.3); padding: 8px;">
            等待右上點捏合訊號...
          </div>
        `;
      } else if (this.calibrationStep === 2) {
        // xMax, yMin in canvas space renders as Top-Left on scaleX(-1) mirrored screen
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: #ff007f;">定位步驟 2 / 4：左上角</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            請將右手移動到舒適範圍的 <strong style="color: #ff007f;">【左上角】</strong>（對應畫面左上閃爍標靶）並做一次 Pinch 捏合點擊。
          </p>
          <div style="font-family: 'Share Tech Mono', monospace; font-size: 12px; color: var(--cyan-spatial); text-align: center; border: 1px dashed rgba(0, 242, 254, 0.3); padding: 8px;">
            等待左上點捏合訊號...
          </div>
        `;
      } else if (this.calibrationStep === 3) {
        // xMin, yMax in canvas space renders as Bottom-Right on scaleX(-1) mirrored screen
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: #ff007f;">定位步驟 3 / 4：右下角</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            請將右手移動到舒適範圍的 <strong style="color: #ff007f;">【右下角】</strong>（對應畫面右下閃爍標靶）並做一次 Pinch 捏合點擊。
          </p>
          <div style="font-family: 'Share Tech Mono', monospace; font-size: 12px; color: var(--cyan-spatial); text-align: center; border: 1px dashed rgba(0, 242, 254, 0.3); padding: 8px;">
            等待右下點捏合訊號...
          </div>
        `;
      } else if (this.calibrationStep === 4) {
        // xMax, yMax in canvas space renders as Bottom-Left on scaleX(-1) mirrored screen
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: #ff007f;">定位步驟 4 / 4：左下角</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            請將右手移動到舒適範圍的 <strong style="color: #ff007f;">【左下角】</strong>（對應畫面左下閃爍標靶）並做一次 Pinch 捏合點擊。
          </p>
          <div style="font-family: 'Share Tech Mono', monospace; font-size: 12px; color: var(--cyan-spatial); text-align: center; border: 1px dashed rgba(0, 242, 254, 0.3); padding: 8px;">
            等待左下點捏合訊號...
          </div>
        `;
      } else if (this.calibrationStep === 5) {
        guideContainer.innerHTML = `
          <h4 style="margin-top: 0; color: #00ffcc;">定位校準完成！</h4>
          <p style="margin: 4px 0 10px; font-size: 13px; color: var(--text-muted);">
            舒適活動區域已成功更新！手勢游標將完美對應至此範圍。
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-family: 'Share Tech Mono', monospace; font-size: 13px;">
            <span style="color: #00ffcc;">X 新範圍: [${xMin} ~ ${xMax}]</span>
            <span style="color: #00ffcc;">Y 新範圍: [${yMin} ~ ${yMax}]</span>
          </div>
          <button id="btn-finish-calib" class="view-ctrl-btn active" style="width: 100%; padding: 6px 0;">確定</button>
        `;

        const finishBtn = guideContainer.querySelector('#btn-finish-calib');
        if (finishBtn) {
          finishBtn.addEventListener('click', () => {
            this.calibrationStep = 0;
            this.calibPoints = [];
            this.updateGuidePanel();
          });
        }
      }
    }
  }

  handleCalibrationPinch(rawX, rawY) {
    this.calibPoints.push({ x: rawX, y: rawY });
    console.log(`[Calibration] Step ${this.calibrationStep} recorded: x=${rawX.toFixed(3)}, y=${rawY.toFixed(3)}`);

    this.calibrationStep++;

    if (this.calibrationStep === 5) {
      const p1 = this.calibPoints[0]; // TL (renders TR)
      const p2 = this.calibPoints[1]; // TR (renders TL)
      const p3 = this.calibPoints[2]; // BL (renders BR)
      const p4 = this.calibPoints[3]; // BR (renders BL)

      // Calculate averages mapping back correctly
      const xMin = (p1.x + p3.x) / 2;
      const xMax = (p2.x + p4.x) / 2;
      const yMin = (p1.y + p2.y) / 2;
      const yMax = (p3.y + p4.y) / 2;

      // Clamp safely
      const finalXMin = Math.min(xMin, xMax);
      const finalXMax = Math.max(xMin, xMax);
      const finalYMin = Math.min(yMin, yMax);
      const finalYMax = Math.max(yMin, yMax);

      localStorage.setItem('gesture_calib_xMin', finalXMin.toFixed(3));
      localStorage.setItem('gesture_calib_xMax', finalXMax.toFixed(3));
      localStorage.setItem('gesture_calib_yMin', finalYMin.toFixed(3));
      localStorage.setItem('gesture_calib_yMax', finalYMax.toFixed(3));

      // Reload calibration mapping factors in the engine
      if (this.app.gestureEngine) {
        this.app.gestureEngine.loadCalibrationData();
      }
    }

    this.updateGuidePanel();
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
    const nameInput = this.domElement.querySelector('#record-pose-name');
    const name = (nameInput ? nameInput.value.trim() : '') || `未命名姿勢_${new Date().toLocaleTimeString()}`;

    if (!this.latestVisionResults) {
      alert('⚠️ 無法錄製：目前尚未接收到 any landmarks frame！');
      return;
    }

    const hasLeft = !!this.latestVisionResults.leftHandLandmarks;
    const hasRight = !!this.latestVisionResults.rightHandLandmarks;
    const hasPose = !!this.latestVisionResults.poseLandmarks;

    if (!hasLeft && !hasRight && !hasPose) {
      alert('⚠️ 無法錄製：偵測到的雙手與肢體骨架數據為空。');
      return;
    }

    const record = {
      name,
      timestamp: new Date().toISOString(),
      leftHandLandmarks: this.latestVisionResults.leftHandLandmarks || null,
      rightHandLandmarks: this.latestVisionResults.rightHandLandmarks || null,
      poseLandmarks: this.latestVisionResults.poseLandmarks || null
    };

    this.recordedPoses.push(record);
    localStorage.setItem('neural_arena_recorded_poses', JSON.stringify(this.recordedPoses));

    this.updateRecordUI();
    if (nameInput) nameInput.value = '';
    console.log('[PoseRecorder] Recorded frame:', record);
  }

  /**
   * Update recorder textbox statistics.
   */
  updateRecordUI() {
    const recordCountEl = this.domElement.querySelector('#record-pose-count');
    const previewBoxEl = this.domElement.querySelector('#record-preview-box');

    if (recordCountEl) {
      recordCountEl.textContent = this.recordedPoses.length;
    }

    if (previewBoxEl && this.recordedPoses.length > 0) {
      const last = this.recordedPoses[this.recordedPoses.length - 1];
      const leftCount = last.leftHandLandmarks ? 21 : 0;
      const rightCount = last.rightHandLandmarks ? 21 : 0;
      const poseCount = last.poseLandmarks ? 33 : 0;
      previewBoxEl.value = `最新錄製: ${last.name}\n時間: ${new Date(last.timestamp).toLocaleTimeString()}\n左手節點: ${leftCount} | 右手節點: ${rightCount} | 身體骨架點: ${poseCount}`;
    } else if (previewBoxEl) {
      previewBoxEl.value = '尚無錄製紀錄。請輸入名稱並點選「錄製當前格」。';
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
    a.download = `neural_arena_recorded_poses_${new Date().toISOString().slice(0, 10)}.json`;
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
}
