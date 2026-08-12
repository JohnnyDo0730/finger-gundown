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

    // Active weapon details selection
    this.currentWeapon = 'pistol';

    this.createDOM();
    this.setupStyles();
    this.bindEvents();
    this.syncState();
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
      <!-- Virtual Gesture Cursor -->
      <div id="gesture-cursor" class="gesture-cursor"></div>

      <!-- Main / Pause Menu Card -->
      <div id="menu-panel" class="menu-panel">
        <h2 id="menu-title">FINGER GUNDOWN</h2>
        <div class="menu-btn-list">
          <button id="btn-play" class="menu-btn"><span class="btn-glow"></span>開始遊戲</button>
          <button id="btn-weapons" class="menu-btn">武器選擇與技能介紹</button>
          <button id="btn-test" class="menu-btn">操作測試與手勢教學</button>
          <button id="btn-exit" class="menu-btn danger">退出遊戲</button>
        </div>
      </div>

      <!-- Weapon Selection Card -->
      <div id="weapons-panel" class="weapons-panel hidden">
        <div class="weapons-header">
          <h3>武器庫選單與操作說明</h3>
          <button id="btn-weapons-back" class="close-weapons-btn">&times;</button>
        </div>
        <div class="weapons-content">
          <!-- Left Column: Weapons List -->
          <div class="weapons-sidebar">
            <!-- Populated dynamically -->
          </div>
          
          <!-- Right Column: Details & SVG Blueprints -->
          <div class="weapon-details" id="weapon-details-container">
            <!-- Details will be dynamically injected here -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    // Bind DOM cache
    this.menuPanelEl = this.overlayEl.querySelector('#menu-panel');
    this.weaponsPanelEl = this.overlayEl.querySelector('#weapons-panel');
    this.cursorEl = this.overlayEl.querySelector('#gesture-cursor');

    // Populate playable weapons dynamically
    const sidebar = this.overlayEl.querySelector('.weapons-sidebar');
    if (sidebar) {
      sidebar.innerHTML = '';
      let isFirst = true;
      Object.keys(WeaponConfig).forEach(key => {
        const w = WeaponConfig[key];
        if (w.isPlayable) {
          const item = document.createElement('div');
          item.className = `weapon-item ${isFirst ? 'active' : ''}`;
          item.setAttribute('data-weapon', key);
          item.innerHTML = `
            <h4>${w.name}</h4>
            <p>${w.category === 'ranged' ? '遠程槍械類' : '近戰技能組'}</p>
          `;
          sidebar.appendChild(item);
          isFirst = false;
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
      .menu-panel.hidden, .weapons-panel.hidden {
        display: none !important;
      }
      
      /* Glassmorphic Panel styles */
      .menu-panel {
        background: var(--glass-surface);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        border: 1px solid var(--glass-border);
        border-radius: 20px;
        padding: 50px 40px;
        width: 90%;
        max-width: 440px;
        text-align: center;
        box-shadow: var(--drop-shadow-vr);
        display: flex;
        flex-direction: column;
        gap: 35px;
        transform: translateY(0);
        transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .menu-panel:hover {
        border-color: var(--glass-border-light);
        box-shadow: var(--drop-shadow-vr), var(--glow-cyan);
      }
      .menu-panel h2 {
        font-family: 'Rajdhani', sans-serif;
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 4px;
        background: linear-gradient(45deg, var(--cyan-spatial), var(--violet-spell));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 20px rgba(0, 242, 254, 0.1);
      }
      .menu-btn-list {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      
      /* Cyber VR buttons styles */
      .menu-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        color: var(--text-main);
        font-family: 'Rajdhani', 'Inter', system-ui, sans-serif;
        font-weight: 600;
        padding: 16px 24px;
        cursor: pointer;
        outline: none;
        backdrop-filter: blur(8px);
        transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        position: relative;
        overflow: hidden;
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
      .menu-btn.primary {
        background: rgba(0, 242, 254, 0.08);
        border-color: var(--glass-border);
        color: var(--cyan-spatial);
      }
      .menu-btn.primary:hover {
        background: rgba(0, 242, 254, 0.15);
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
      
      /* Weapons panel style */
      .weapons-panel {
        background: var(--bg-deep-space);
        backdrop-filter: blur(16px);
        border: 1px solid var(--glass-border);
        border-radius: 24px;
        width: 90%;
        max-width: 900px;
        box-shadow: var(--drop-shadow-vr);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .weapons-panel:hover {
        border-color: var(--glass-border-light);
      }
      .weapons-header {
        background: rgba(255, 255, 255, 0.02);
        padding: 20px 30px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .weapons-header h3 {
        font-family: 'Rajdhani', sans-serif;
        margin: 0;
        font-size: 1.3rem;
        color: #fff;
        letter-spacing: 1px;
      }
      .close-weapons-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--glass-border);
        border-radius: 50%;
        color: #fff;
        font-size: 1.5rem;
        width: 38px;
        height: 38px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        line-height: 1;
      }
      .close-weapons-btn:hover {
        color: #ff007f;
        background: rgba(255, 0, 127, 0.1);
        border-color: rgba(255, 0, 127, 0.3);
        box-shadow: 0 0 10px rgba(255, 0, 127, 0.2);
      }
      .weapons-content {
        display: grid;
        grid-template-columns: 280px 1fr;
        height: 480px;
      }
      
      /* Weapons list sidebar */
      .weapons-sidebar {
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: rgba(255, 255, 255, 0.015);
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
      .weapons-back-btn {
        margin-top: auto;
        background: transparent;
        border: 1px solid var(--glass-border);
        border-radius: 10px;
        color: var(--text-muted);
        padding: 12px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .weapons-back-btn:hover {
        background: rgba(255,255,255,0.05);
        color: #fff;
        border-color: var(--glass-border-light);
      }
      
      /* Weapon details panel */
      .weapon-details {
        padding: 30px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        text-align: left;
      }
      .detail-title {
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.6rem;
        color: #fff;
        margin: 0;
        font-weight: 600;
        border-left: 4px solid var(--cyan-spatial);
        padding-left: 12px;
      }
      .detail-desc {
        color: var(--text-muted);
        font-size: 0.9rem;
        line-height: 1.6;
        margin: 0;
      }
      .detail-guide-panel {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 20px;
        align-items: center;
        background: rgba(30, 30, 35, 0.4);
        border-radius: 16px;
        padding: 20px;
        border: 1px solid var(--glass-border);
      }
      .guide-image-container {
        width: 100%;
        aspect-ratio: 16/10;
        background: rgba(20, 20, 25, 0.8);
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.04);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .guide-text {
        font-size: 0.82rem;
        color: var(--text-muted);
      }
      .guide-text ul {
        margin: 10px 0 0 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .guide-text li {
        line-height: 1.4;
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
      this.menuPanelEl.classList.add('hidden');
      this.weaponsPanelEl.classList.remove('hidden');
      this.renderWeaponDetails();
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
      this.weaponsPanelEl.classList.add('hidden');
      this.menuPanelEl.classList.remove('hidden');
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
          
          // Pause state: Default to show weapon selection!
          this.menuPanelEl.classList.add('hidden');
          this.weaponsPanelEl.classList.remove('hidden');
          this.renderWeaponDetails();
        } else {
          playBtn.innerHTML = '<span class="btn-glow"></span>開始遊戲';
          menuTitle.textContent = 'FINGER GUNDOWN';
          
          // Menu state: Default to show main menu!
          this.weaponsPanelEl.classList.add('hidden');
          this.menuPanelEl.classList.remove('hidden');
        }
      } else {
        this.overlayEl.classList.add('hidden');
      }
    });
  }

  /**
   * Render active weapon info inside the panel, utilizing sharp blueprint SVGs.
   */
  renderWeaponDetails() {
    const container = this.overlayEl.querySelector('#weapon-details-container');
    const w = WeaponConfig[this.currentWeapon];
    if (!w) return;

    const isRanged = w.category === 'ranged';
    const accentColor = isRanged ? 'var(--cyan-spatial)' : 'var(--violet-spell)';
    const strokeColor = isRanged ? '#00f2fe' : '#9d4edd';

    // Build guide list dynamically based on weapon category
    let guideHtml = '';
    if (isRanged) {
      guideHtml = `
        <span style="color:#fff; font-weight:600;">操作指引 (手勢)：</span>
        <ul>
          <li><strong>舉槍瞄準：</strong>右手比讚，食指指向螢幕定位（進入瞄準狀態）。</li>
          <li><strong>扣下扳機：</strong>維持拇指朝上，將食指向下彎曲以射擊。</li>
          <li><strong>換彈裝填：</strong>將右手翻轉為手背朝前且食指伸直，維持 0.5 秒。</li>
          <li><strong>精準瞄準：</strong>左手比 OK 手勢以放大視野，中指開合可調節 1.0x~4.0x 倍率。</li>
        </ul>
      `;
    } else {
      guideHtml = `
        <span style="color:#fff; font-weight:600;">操作指引 (手勢)：</span>
        <ul>
          <li><strong>近戰普攻：</strong>右手食指快速揮動（斬擊速度大於 1.5 units/s）。</li>
          <li><strong>蓄力技能：</strong>右手握拳背朝外拳朝上（昇龍拳姿勢），維持 1.0 秒。</li>
          <li><strong>蓄力大招：</strong>雙手食指與大拇指閉合成三角形（氣功砲姿勢），維持 1.5 秒。</li>
        </ul>
      `;
    }

    // Embed SVGs dynamically
    const svgHtml = isRanged ? `
      <!-- Sci-Fi Pistol SVG blueprint -->
      <svg width="85%" height="85%" viewBox="0 0 200 120" style="filter: drop-shadow(0 0 5px rgba(0, 242, 254, 0.4));">
        <path d="M40 70 L90 70 L95 50 L180 50 L180 75 L160 85 L95 85 L85 105 L60 105 L70 85 L40 85 Z" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M110 55 L165 55 M110 62 L175 62 M110 80 L140 80" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2 2"/>
        <path d="M80 82 C82 78 88 78 90 82" fill="none" stroke="#ff007f" stroke-width="2" />
        <circle cx="150" cy="50" r="1.5" fill="#ff007f"/>
        <text x="140" y="40" fill="${strokeColor}" font-size="8" font-family="Share Tech Mono">ENERGY SYSTEM</text>
        <line x1="150" y1="42" x2="150" y2="48" stroke="${strokeColor}" stroke-width="0.5"/>
      </svg>
    ` : `
      <!-- Sci-Fi Sword SVG blueprint -->
      <svg width="85%" height="85%" viewBox="0 0 200 120" style="filter: drop-shadow(0 0 5px rgba(157, 78, 221, 0.5));">
        <path d="M30 90 L40 80 L55 85 L45 95 Z" fill="none" stroke="${strokeColor}" stroke-width="2" />
        <line x1="48" y1="82" x2="170" y2="20" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round"/>
        <line x1="51" y1="79" x2="167" y2="23" stroke="#fff" stroke-width="1"/>
        <path d="M165 15 L175 25 L170 30 Z" fill="none" stroke="${strokeColor}" stroke-width="1.5"/>
        <circle cx="110" cy="50" r="12" fill="none" stroke="#ff007f" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="115" y="40" fill="${strokeColor}" font-size="8" font-family="Share Tech Mono">PLASMA MATRIX</text>
      </svg>
    `;

    container.innerHTML = `
      <h4 class="detail-title" style="border-left-color: ${accentColor};">${w.name}</h4>
      <p class="detail-desc">${w.description}</p>
      <div class="detail-guide-panel">
        <div class="guide-image-container">
          ${svgHtml}
        </div>
        <div class="guide-text">
          ${guideHtml}
        </div>
      </div>
    `;
  }

  /**
   * Translate hand tracking coordinates (normalized 0-1) to UI cursor clicks.
   * Enables hands-free menu interaction.
   * 
   * @param {number} cursorX - Hand coordinates on X axis (0 = left, 1 = right)
   * @param {number} cursorY - Hand coordinates on Y axis (0 = top, 1 = bottom)
   * @param {boolean} isPinching - True if index and thumb are pinched together
   */
  updateGestureCursor(cursorX, cursorY, isPinching) {
    if (!this.overlayEl || this.overlayEl.classList.contains('hidden') || cursorX === undefined || cursorY === undefined) {
      if (this.cursorEl) this.cursorEl.classList.remove('active');
      return;
    }

    // 1. Map normalized coords to window sizes (using mirrored X alignment)
    const screenX = (1 - cursorX) * window.innerWidth;
    const screenY = cursorY * window.innerHeight;

    // 2. Position cursor
    this.cursorEl.style.left = `${screenX}px`;
    this.cursorEl.style.top = `${screenY}px`;
    this.cursorEl.classList.add('active');

    // 3. Update pinch visualization
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

    // Check if target is a button or clickable menu item
    const clickable = target.closest('button, .weapon-item');
    if (clickable) {
      console.log(`%c[GestureClick] Virtual clicked: ${clickable.id || clickable.className}`, 'color: #ff007f; font-weight: bold;');
      clickable.click();
      
      // Provide a brief haptic visual feedback on the button
      clickable.style.transform = 'scale(0.95)';
      setTimeout(() => {
        clickable.style.transform = '';
      }, 100);
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
