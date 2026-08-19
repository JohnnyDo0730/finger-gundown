import { BaseView } from './BaseView.js';
import { WeaponConfig } from '../../core/WeaponConfig.js';
import { MainMenuView } from './MainMenuView.js';
import { PauseView } from './PauseView.js';

/**
 * WeaponsView - Renders the weapons selection and skill description page.
 */
export class WeaponsView extends BaseView {
  constructor(app) {
    super(app);
    this.currentWeapon = localStorage.getItem('gesture_selected_weapon') || 'pistol';
    this.selectedSkillKey = 'passive';
    this.lastRenderedWeapon = null;
  }

  formatHiveText(text) {
    if (!text) return '';
    // 1. Split by slash to handle dual mode names
    if (text.includes('/')) {
      return text.replace(/\s*\/\s*/g, '<br>');
    }
    // 2. Specific wrapping rules for known long names
    if (text === '為美好的爆裂獻上祝福') {
      return '為美好的爆裂<br>獻上祝福';
    }
    if (text === '我的經費在你之上') {
      return '我的經費<br>在你之上';
    }
    if (text === '亂丟劍氣的好日子') {
      return '亂丟劍氣<br>的好日子';
    }
    if (text === 'MG3讓遊戲變簡單') {
      return 'MG3讓遊戲<br>變簡單';
    }
    if (text === '快速擴容彈夾') {
      return '快速擴容<br>彈夾';
    }
    if (text === '狙擊槍擴容彈夾') {
      return '狙擊槍擴容<br>彈夾';
    }
    if (text === '最需要操作之人') {
      return '最需要<br>操作之人';
    }
    return text;
  }

  formatDescription(descTemplate, actionObj, weaponObj) {
    if (!descTemplate) return '';
    return descTemplate.replace(/\{(\w+)\}/g, (match, key) => {
      if (actionObj && actionObj[key] !== undefined) {
        const val = actionObj[key];
        if ((key === 'cooldown' || key === 'chargeTime' || key === 'duration' || key === 'animationTime') && typeof val === 'number') {
          return val >= 100 ? (val / 1000).toFixed(1).replace(/\.0$/, '') : val;
        }
        return val;
      }
      if (weaponObj && weaponObj[key] !== undefined) {
        const val = weaponObj[key];
        if ((key === 'reloadTime' || key === 'reloadOverheatTime') && typeof val === 'number') {
          return val >= 100 ? (val / 1000).toFixed(1).replace(/\.0$/, '') : val;
        }
        return val;
      }
      return match;
    });
  }


  createDOM() {
    const layout = document.createElement('div');
    layout.id = 'weapons-panel';
    layout.className = 'weapons-layout view-panel';

    layout.innerHTML = `
      <!-- Block A: Top Panel -->
      <div id="weapon-top-panel" class="floating-panel top-panel">
        <div id="weapon-title-container"></div>
      </div>

      <!-- Block B: Left Panel (Ranged Weapons Sidebar) -->
      <div id="weapon-left-panel" class="floating-panel side-panel left-panel">
        <div class="side-panel-title">◀ 槍械類武器 (Ranged)</div>
        <div class="weapons-sidebar" id="ranged-weapons-sidebar"></div>
      </div>

      <!-- Block C: Right Panel (Melee Weapons Sidebar) -->
      <div id="weapon-right-panel" class="floating-panel side-panel right-panel">
        <div class="side-panel-title">技能組組合 ▶</div>
        <div class="weapons-sidebar" id="melee-weapons-sidebar"></div>
      </div>

      <!-- Block D: Center Panel (Hexagonal hive skills) -->
      <div id="weapon-center-panel" class="floating-panel center-panel">
        <div id="weapon-details-container" style="width: 100%; height: 100%; position: relative;"></div>
      </div>

      <!-- Block E: Bottom Panel (Exit back button) -->
      <button id="btn-weapons-back" class="floating-panel bottom-panel">返回主選單</button>
    `;

    return layout;
  }

  bindEvents() {
    // Sync active weapon with GestureEngine on bind
    if (this.app.gestureEngine) {
      this.app.gestureEngine.setWeaponMode(this.currentWeapon);
    }

    // Populate ranged and melee weapon sidebars
    const rangedSidebar = this.domElement.querySelector('#ranged-weapons-sidebar');
    const meleeSidebar = this.domElement.querySelector('#melee-weapons-sidebar');
    const backBtn = this.domElement.querySelector('#btn-weapons-back');

    if (rangedSidebar && meleeSidebar) {
      rangedSidebar.innerHTML = '';
      meleeSidebar.innerHTML = '';

      Object.keys(WeaponConfig).forEach(key => {
        const w = WeaponConfig[key];
        if (w.isPlayable) {
          const item = document.createElement('div');
          item.className = `weapon-item ${key === this.currentWeapon ? 'active' : ''}`;
          item.setAttribute('data-weapon', key);

          const catLabel = w.category === 'ranged' ? '遠程槍械類' : 
            ((key === 'blood-magic' || key === 'crimson-clan') ? '遠程技能組' : '近戰技能組');

          item.innerHTML = `
            <h4>${w.name}</h4>
            <p>${catLabel}</p>
          `;

          item.addEventListener('click', () => {
            this.selectWeapon(key);
          });

          if (w.category === 'ranged') {
            rangedSidebar.appendChild(item);
          } else {
            meleeSidebar.appendChild(item);
          }
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        console.log('[WeaponsView] Back clicked.');
        if (this.app.uiManager) {
          const currentState = this.app.stateManager.getState();
          if (currentState === 'PAUSED') {
            this.app.uiManager.transitionToView(PauseView);
          } else {
            this.app.uiManager.transitionToView(MainMenuView);
          }
        }
      });
    }

    this.renderWeaponDetails();
  }

  selectWeapon(key) {
    if (this.currentWeapon === key) return;

    this.currentWeapon = key;
    localStorage.setItem('gesture_selected_weapon', key);

    // Sync with GestureEngine
    if (this.app.gestureEngine) {
      this.app.gestureEngine.setWeaponMode(key);
    }

    // Update active class in sidebar items
    const items = this.domElement.querySelectorAll('.weapon-item');
    items.forEach(item => {
      if (item.getAttribute('data-weapon') === key) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    this.renderWeaponDetails();
  }

  renderWeaponDetails() {
    const titleContainer = this.domElement.querySelector('#weapon-title-container');
    const detailsContainer = this.domElement.querySelector('#weapon-details-container');
    const w = WeaponConfig[this.currentWeapon];
    if (!w || !titleContainer || !detailsContainer) return;

    const isRanged = w.category === 'ranged';
    let accentColor = 'var(--cyan-spatial)';
    let accentRgb = '0, 242, 254';

    if (!isRanged) {
      if (w.id === 'katana') {
        accentColor = '#4cc9f0';
        accentRgb = '76, 201, 240';
      } else if (w.id === 'blood-magic') {
        accentColor = '#ff2b3d';
        accentRgb = '255, 43, 61';
      } else if (w.id === 'crimson-clan') {
        accentColor = '#ff7b00';
        accentRgb = '255, 123, 0';
      } else {
        accentColor = 'var(--violet-spell)';
        accentRgb = '157, 78, 221';
      }
    }

    const isSpecialRanged = (this.currentWeapon === 'blood-magic' || this.currentWeapon === 'crimson-clan');
    const categoryText = isRanged ? '遠程槍械類' : (isSpecialRanged ? '遠程技能組' : '近戰技能組');
    const categoryBg = isRanged ? 'rgba(0,242,254,0.1)' : (isSpecialRanged ? 'rgba(0,255,204,0.1)' : 'rgba(157,78,221,0.1)');

    titleContainer.innerHTML = `
      <h2 style="font-family: 'Rajdhani', sans-serif; font-size: calc(2.2 * var(--scale-unit)); color: #fff; margin: 0 0 calc(0.4 * var(--scale-unit)) 0; letter-spacing: 1px; text-align: left;">
        ${w.name} 
        <span style="font-size: calc(1.2 * var(--scale-unit)); padding: calc(0.2 * var(--scale-unit)) calc(0.8 * var(--scale-unit)); border-radius: 4px; background: ${categoryBg}; color: ${accentColor}; font-weight: bold; margin-left: calc(0.8 * var(--scale-unit)); vertical-align: middle;">
          ${categoryText}
        </span>
      </h2>
      <p style="font-size: calc(1.25 * var(--scale-unit)); color: var(--text-muted); margin: 0; line-height: 1.35; text-align: left;">${w.description}</p>
    `;

    const coords = {
      'fire': { left: '50%', top: 'calc(40% - 17.5 * var(--scale-unit))', label: '射擊' },
      'reload': { left: 'calc(50% - 15.2 * var(--scale-unit))', top: 'calc(40% - 8.8 * var(--scale-unit))', label: '換彈' },
      'aim': { left: 'calc(50% - 15.2 * var(--scale-unit))', top: 'calc(40% + 8.8 * var(--scale-unit))', label: '瞄準射擊' },
      'slash': { left: 'calc(50% + 15.2 * var(--scale-unit))', top: 'calc(40% - 8.8 * var(--scale-unit))', label: '揮舞' },
      'skill': { left: 'calc(50% + 15.2 * var(--scale-unit))', top: 'calc(40% + 8.8 * var(--scale-unit))', label: '蓄力技能' },
      'ult': { left: '50%', top: 'calc(40% + 17.5 * var(--scale-unit))', label: '蓄力大招' }
    };

    let nodesHtml = `
      <!-- Center passive node -->
      <div class="hive-node center-node" id="hive-center-passive" style="left: 50%; top: 40%;">
        <svg width="100%" height="100%" viewBox="0 0 180 156" style="position: absolute; top:0; left:0; z-index:1;">
          <polygon points="46,2 134,2 178,78 134,154 46,154 2,78" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" stroke-width="2"></polygon>
        </svg>
        <div style="font-size: calc(1.3 * var(--scale-unit)); color: var(--text-muted); text-transform: uppercase; z-index: 5;">核心被動</div>
        <div style="font-size: calc(1.8 * var(--scale-unit)); font-weight: bold; color: ${accentColor}; font-family: 'Rajdhani', sans-serif; z-index: 5; margin-top: calc(0.4 * var(--scale-unit));">${this.formatHiveText(w.passive.name)}</div>
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
            <polygon points="42,2 120,2 160,70 120,138 42,138 2,70" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"></polygon>
          </svg>
          <div style="font-size: calc(1.3 * var(--scale-unit)); color: var(--text-muted); margin-bottom: calc(0.2 * var(--scale-unit)); z-index: 5;">${coord.label}</div>
          <div style="font-size: calc(1.75 * var(--scale-unit)); font-weight: bold; font-family: 'Rajdhani', sans-serif; line-height: 1.1; z-index: 5;">${isDisabled ? '已停用' : this.formatHiveText(action.name)}</div>
        </div>
      `;
    });

    nodesHtml += `
      <div class="hive-hover-panel" style="position: absolute; bottom: 0; left: 0; right: 0;">
        <div class="hive-hover-title" id="hive-hover-title"></div>
        <div class="hive-hover-desc" id="hive-hover-desc"></div>
      </div>
    `;

    detailsContainer.innerHTML = nodesHtml;
    detailsContainer.style.setProperty('--hive-accent', accentColor);
    detailsContainer.style.setProperty('--hive-accent-rgb', accentRgb);

    const hoverTitle = detailsContainer.querySelector('#hive-hover-title');
    const hoverDesc = detailsContainer.querySelector('#hive-hover-desc');
    const outerNodes = detailsContainer.querySelectorAll('.hive-node.outer-node');
    const centerNode = detailsContainer.querySelector('.hive-node.center-node');

    if (this.lastRenderedWeapon !== this.currentWeapon) {
      this.selectedSkillKey = 'passive';
      this.lastRenderedWeapon = this.currentWeapon;
    }

    const updateStableDisplay = () => {
      centerNode.classList.remove('active-guide');
      outerNodes.forEach(node => node.classList.remove('active-guide'));

      if (this.selectedSkillKey && this.selectedSkillKey !== 'passive') {
        const action = w.hiveActions[this.selectedSkillKey];
        hoverTitle.innerHTML = `手勢操作 - ${coords[this.selectedSkillKey].label}：${action.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = this.formatDescription(action.desc, action, w);

        const node = detailsContainer.querySelector(`[data-action-key="${this.selectedSkillKey}"]`);
        if (node) node.classList.add('active-guide');
      } else {
        hoverTitle.innerHTML = `核心被動：${w.passive.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = this.formatDescription(w.passive.description, w.passive, w);
        centerNode.classList.add('active-guide');
      }
    };

    updateStableDisplay();

    outerNodes.forEach(node => {
      if (node.classList.contains('disabled-node')) return;

      const key = node.getAttribute('data-action-key');
      const action = w.hiveActions[key];

      node.addEventListener('mouseenter', () => {
        centerNode.classList.remove('active-guide');
        outerNodes.forEach(n => n.classList.remove('active-guide'));
        node.classList.add('active-guide');
        hoverTitle.innerHTML = `手勢操作 - ${coords[key].label}：${action.name}`;
        hoverTitle.style.color = accentColor;
        hoverDesc.textContent = this.formatDescription(action.desc, action, w);
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
      hoverDesc.textContent = this.formatDescription(w.passive.description, w.passive, w);
    });

    centerNode.addEventListener('mouseleave', updateStableDisplay);

    centerNode.addEventListener('click', () => {
      this.selectedSkillKey = 'passive';
      updateStableDisplay();
    });
  }
}
