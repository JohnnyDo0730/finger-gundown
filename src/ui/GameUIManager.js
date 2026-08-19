import { WeaponConfig } from '../core/WeaponConfig.js';

/**
 * GameUIManager - Manages screen-space 2D combat UI overlays,
 * including target crosshair cursor, weapon status panels, and skills cooldown grids.
 */
export class GameUIManager {
  /**
   * @param {App} app - Core application coordinator
   */
  constructor(app) {
    this.app = app;
    this.crosshairDom = null;
    this.hudEl = null;
    this.hudLeftEl = null;
    this.hudRightEl = null;
    this.init();
  }

  init() {
    console.log('[GameUIManager] Initializing battle overlays...');
    this.createDOM();
  }

  createDOM() {
    // 1. 2D Screen-space Crosshair Cursor
    this.crosshairDom = document.getElementById('spatial-crosshair-hud');
    if (!this.crosshairDom) {
      this.crosshairDom = document.createElement('div');
      this.crosshairDom.id = 'spatial-crosshair-hud';
      this.crosshairDom.style.position = 'fixed';
      this.crosshairDom.style.width = '48px';
      this.crosshairDom.style.height = '48px';
      this.crosshairDom.style.pointerEvents = 'none';
      this.crosshairDom.style.zIndex = '9999';
      this.crosshairDom.style.transform = 'translate(-50%, -50%)';
      this.crosshairDom.style.display = 'none';
      this.crosshairDom.innerHTML = `
        <div class="crosshair-bar-h" style="position: absolute; left: 0; top: 22px; width: 48px; height: 4px; border: 1px solid #000; box-sizing: border-box; background: #00f2fe; box-shadow: 0 0 6px #00f2fe;"></div>
        <div class="crosshair-bar-v" style="position: absolute; left: 22px; top: 0; width: 4px; height: 48px; border: 1px solid #000; box-sizing: border-box; background: #00f2fe; box-shadow: 0 0 6px #00f2fe;"></div>
        <div style="position: absolute; left: 21px; top: 21px; width: 6px; height: 6px; border: 1px solid #000; box-sizing: border-box; border-radius: 50%; background: #fff; box-shadow: 0 0 3px #fff;"></div>
      `;
      document.body.appendChild(this.crosshairDom);
    }

    // 2. Central HUD: Weapon Title & Core Energy
    this.hudEl = document.getElementById('gameplay-hud');
    if (!this.hudEl) {
      this.hudEl = document.createElement('div');
      this.hudEl.id = 'gameplay-hud';
      this.hudEl.className = 'gameplay-hud';
      this.hudEl.style.display = 'none';
      document.body.appendChild(this.hudEl);
    }

    // 3. Left Utilities HUD: Reload, Aim scope, Melee slash
    this.hudLeftEl = document.getElementById('gameplay-hud-left');
    if (!this.hudLeftEl) {
      this.hudLeftEl = document.createElement('div');
      this.hudLeftEl.id = 'gameplay-hud-left';
      this.hudLeftEl.className = 'hud-side-panel hud-left-utilities';
      this.hudLeftEl.style.display = 'none';
      document.body.appendChild(this.hudLeftEl);
    }

    // 4. Right Actions HUD: Fire/Strike, Skill, Ultimate
    this.hudRightEl = document.getElementById('gameplay-hud-right');
    if (!this.hudRightEl) {
      this.hudRightEl = document.createElement('div');
      this.hudRightEl.id = 'gameplay-hud-right';
      this.hudRightEl.className = 'hud-side-panel hud-right-actions';
      this.hudRightEl.style.display = 'none';
      document.body.appendChild(this.hudRightEl);
    }
  }

  show(visible) {
    const displayStyle = visible ? 'flex' : 'none';
    if (this.crosshairDom) this.crosshairDom.style.display = visible ? 'block' : 'none';
    if (this.hudEl) this.hudEl.style.display = displayStyle;
    if (this.hudLeftEl) this.hudLeftEl.style.display = displayStyle;
    if (this.hudRightEl) this.hudRightEl.style.display = displayStyle;
  }

  renderBadgeHtml(key, label, action, cd, maxCD) {
    if (!action) return '';
    const progress = maxCD > 0 ? (cd / maxCD) * 100 : 0;
    const cdText = cd > 0 ? `${cd.toFixed(1)}s` : 'READY';
    const cdClass = cd > 0 ? 'cooling' : 'ready';

    return `
      <div class="hud-skill-badge ${cdClass}">
        <div class="skill-meta">
          <span class="skill-label">${label}</span>
          <span class="skill-name">${action.name || ''}</span>
        </div>
        <div class="skill-cd-bar">
          <div class="skill-cd-fill" style="width: ${progress}%"></div>
        </div>
        <div class="skill-cd-text">${cdText}</div>
      </div>
    `;
  }

  update(deltaTime, playerController) {
    if (!playerController) return;

    // 1. Update Crosshair screen position
    if (this.crosshairDom) {
      this.crosshairDom.style.left = `${playerController.screenX}px`;
      this.crosshairDom.style.top = `${playerController.screenY}px`;
    }

    // 2. Update HUD panel content
    if (!this.hudEl) return;
    const weapon = playerController.equippedWeapon;
    if (!weapon) return;

    const hudData = weapon.getHUDData();

    // Reload active banner (above central panel)
    let reloadText = '';
    if (hudData.isReloading) {
      const progress = Math.max(0, Math.min(100, ((hudData.reloadDuration - hudData.reloadTimer) / hudData.reloadDuration) * 100));
      reloadText = `<div class="hud-reload-bar"><div class="hud-reload-progress" style="width: ${progress}%"></div>裝填中...</div>`;
    }

    // Core Energy custom visual display
    let energyPanel = '';
    const energyStyle = hudData.coreEnergyStyle;
    if (energyStyle && energyStyle.active) {
      energyPanel = `
        <div class="hud-ammo-panel">
          <span class="hud-label">${energyStyle.label}:</span>
          <div class="hud-heat-bg">
            <div class="hud-heat-fill" style="width: ${energyStyle.value}%; background: ${energyStyle.color}; box-shadow: 0 0 8px ${energyStyle.color};"></div>
          </div>
          <span class="hud-heat-val" style="color: ${energyStyle.color};">${energyStyle.text || Math.floor(energyStyle.value) + '%'}</span>
        </div>
      `;
    }

    // Left Utilities (Reload, Scope aim, Slash swing)
    let reloadHtml = '';
    const reloadAction = weapon.config.hiveActions?.reload;
    if (reloadAction && reloadAction.active) {
      const cd = hudData.isReloading ? hudData.reloadTimer : 0;
      const maxCD = hudData.reloadDuration;
      reloadHtml = this.renderBadgeHtml('reload', '換彈', reloadAction, cd, maxCD);
    }

    let aimHtml = '';
    const aimAction = weapon.config.hiveActions?.aim;
    if (aimAction && aimAction.active) {
      const progress = playerController.isZoomed ? 100 : 0;
      const cdText = playerController.isZoomed ? 'ACTIVE' : 'READY';
      const cdClass = playerController.isZoomed ? 'active-scoped' : 'ready';
      aimHtml = `
        <div class="hud-skill-badge ${cdClass}">
          <div class="skill-meta">
            <span class="skill-label">倍鏡</span>
            <span class="skill-name">${aimAction.name || '光學倍鏡'}</span>
          </div>
          <div class="skill-cd-bar">
            <div class="skill-cd-fill" style="width: ${progress}%"></div>
          </div>
          <div class="skill-cd-text">${cdText}</div>
        </div>
      `;
    }

    let slashHtml = '';
    const slashAction = weapon.config.hiveActions?.slash;
    if (slashAction && slashAction.active) {
      const cd = hudData.cooldowns.slash || 0;
      const maxCD = (slashAction.cooldown || 0) / 1000;
      slashHtml = this.renderBadgeHtml('slash', '斬擊', slashAction, cd, maxCD);
    }

    // Right Combat Actions (Fire primary, Skill, Ult)
    let fireHtml = '';
    const fireAction = weapon.config.hiveActions?.fire;
    if (fireAction && fireAction.active) {
      const cd = hudData.cooldowns.fire || 0;
      const maxCD = (fireAction.cooldown || 0) / 1000;
      const label = (hudData.id === 'katana' || hudData.id === 'blood-magic' || hudData.id === 'crimson-clan') ? '普攻' : '射擊';
      fireHtml = this.renderBadgeHtml('fire', label, fireAction, cd, maxCD);
    }

    let skillHtml = '';
    const skillAction = weapon.config.hiveActions?.skill;
    if (skillAction && skillAction.active) {
      const cd = hudData.cooldowns.skill || 0;
      const maxCD = (skillAction.cooldown || 0) / 1000;
      skillHtml = this.renderBadgeHtml('skill', '技能', skillAction, cd, maxCD);
    }

    let ultHtml = '';
    const ultAction = weapon.config.hiveActions?.ult;
    if (ultAction && ultAction.active) {
      const cd = hudData.cooldowns.ult || 0;
      const maxCD = (ultAction.cooldown || 0) / 1000;
      ultHtml = this.renderBadgeHtml('ult', '大招', ultAction, cd, maxCD);
    }

    // Update Central Panel: Only name, energy, and reload banner
    this.hudEl.innerHTML = `
      <div class="hud-header">
        <div class="hud-weapon-name">${hudData.name}</div>
        ${energyPanel}
      </div>
      ${reloadText}
    `;

    // Update Left Panel: Utility skills
    const leftContent = `${reloadHtml}${aimHtml}${slashHtml}`.trim();
    if (leftContent !== '') {
      this.hudLeftEl.innerHTML = leftContent;
      this.hudLeftEl.style.display = 'flex';
    } else {
      this.hudLeftEl.style.display = 'none';
    }

    // Update Right Panel: Combat skills
    const rightContent = `${fireHtml}${skillHtml}${ultHtml}`.trim();
    if (rightContent !== '') {
      this.hudRightEl.innerHTML = rightContent;
      this.hudRightEl.style.display = 'flex';
    } else {
      this.hudRightEl.style.display = 'none';
    }
  }

  destroy() {
    console.log('[GameUIManager] Tearing down battle HUD overlays...');
    if (this.crosshairDom && this.crosshairDom.parentNode) {
      this.crosshairDom.parentNode.removeChild(this.crosshairDom);
      this.crosshairDom = null;
    }
    if (this.hudEl && this.hudEl.parentNode) {
      this.hudEl.parentNode.removeChild(this.hudEl);
      this.hudEl = null;
    }
    if (this.hudLeftEl && this.hudLeftEl.parentNode) {
      this.hudLeftEl.parentNode.removeChild(this.hudLeftEl);
      this.hudLeftEl = null;
    }
    if (this.hudRightEl && this.hudRightEl.parentNode) {
      this.hudRightEl.parentNode.removeChild(this.hudRightEl);
      this.hudRightEl = null;
    }
  }
}
