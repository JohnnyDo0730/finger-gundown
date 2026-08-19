import { BaseView } from './BaseView.js';
import { WeaponsView } from './WeaponsView.js';

/**
 * PauseView - Renders the pause menu overlay.
 */
export class PauseView extends BaseView {
  createDOM() {
    const panel = document.createElement('div');
    panel.id = 'pause-panel';
    panel.className = 'menu-panel view-panel';

    panel.innerHTML = `
      <h2>遊戲暫停</h2>
      <div class="menu-btn-list">
        <button id="btn-pause-resume" class="menu-btn"><span class="btn-glow"></span>繼續遊戲</button>
        <button id="btn-pause-weapons" class="menu-btn">查看技能</button>
        <button id="btn-pause-menu" class="menu-btn danger">返回主畫面</button>
      </div>
    `;

    return panel;
  }

  bindEvents() {
    const resumeBtn = this.domElement.querySelector('#btn-pause-resume');
    const weaponsBtn = this.domElement.querySelector('#btn-pause-weapons');
    const menuBtn = this.domElement.querySelector('#btn-pause-menu');

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        console.log('[PauseView] Resume clicked.');
        this.app.stateManager.transitionTo('PLAYING');
      });
    }

    if (weaponsBtn) {
      weaponsBtn.addEventListener('click', () => {
        console.log('[PauseView] Weapons clicked.');
        if (this.app.uiManager) {
          this.app.uiManager.transitionToView(WeaponsView);
        }
      });
    }

    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        console.log('[PauseView] Return to menu clicked.');
        if (this.app.uiManager) {
          this.app.uiManager.showConfirmModal('確定要返回主選單嗎？這將會重置目前的關卡。', () => {
            if (this.app.uiManager && this.app.uiManager.closeIrisExit) {
              this.app.uiManager.closeIrisExit().then(() => {
                this.app.stateManager.transitionTo('MENU');
              });
            } else {
              this.app.stateManager.transitionTo('MENU');
            }
          });
        }
      });
    }
  }
}
