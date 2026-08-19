import { BaseView } from './BaseView.js';
import { WeaponsView } from './WeaponsView.js';

/**
 * MainMenuView - Renders the main entry menu layout.
 */
export class MainMenuView extends BaseView {
  createDOM() {
    const panel = document.createElement('div');
    panel.id = 'menu-panel';
    panel.className = 'menu-panel view-panel';

    panel.innerHTML = `
      <h2>FINGER GUNDOWN</h2>
      <div class="menu-btn-list">
        <button id="btn-play" class="menu-btn"><span class="btn-glow"></span>開始遊戲</button>
        <button id="btn-weapons" class="menu-btn">武器選擇與技能介紹</button>
        <button id="btn-test" class="menu-btn">操作測試與手勢教學</button>
        <button id="btn-exit" class="menu-btn danger">退出遊戲</button>
      </div>
    `;

    return panel;
  }

  bindEvents() {
    const playBtn = this.domElement.querySelector('#btn-play');
    const weaponsBtn = this.domElement.querySelector('#btn-weapons');
    const testBtn = this.domElement.querySelector('#btn-test');
    const exitBtn = this.domElement.querySelector('#btn-exit');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        console.log('[MainMenuView] Play clicked.');
        const rect = playBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (this.app.uiManager && this.app.uiManager.closeIrisEnter) {
          this.app.uiManager.closeIrisEnter(x, y).then(() => {
            this.app.stateManager.transitionTo('PLAYING');
          });
        } else {
          this.app.stateManager.transitionTo('PLAYING');
        }
      });
    }

    if (weaponsBtn) {
      weaponsBtn.addEventListener('click', () => {
        console.log('[MainMenuView] Weapons clicked.');
        if (this.app.uiManager) {
          this.app.uiManager.transitionToView(WeaponsView);
        }
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', () => {
        console.log('[MainMenuView] Gesture Test clicked.');
        this.app.stateManager.transitionTo('TEST_MODE');
      });
    }

    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        console.log('[MainMenuView] Exit clicked.');
        if (this.app.uiManager) {
          this.app.uiManager.showConfirmModal('確定要關閉遊戲嗎？', () => {
            window.close();
          });
        }
      });
    }
  }
}
