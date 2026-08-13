# Finger Gundown ── 網頁 3D 手勢控制遊戲引擎 🎮👾

![Vite](https://img.shields.io/badge/Vite-5.4.0-646CFF?style=flat-square&logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Holistic-00C7B7?style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=flat-square&logo=three.js)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=flat-square&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/ES6-Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

這是一個基於 **Three.js** 3D 渲染與 **MediaPipe Holistic** 機器視覺手勢識別的未來感網頁 3D 體感遊戲引擎。玩家無需使用鍵盤、滑鼠或手把，僅需透過視訊鏡頭（Webcam）與雙手手勢，即可在網頁或桌面客戶端中進行移動、瞄準、射擊、裝彈，乃至揮砍與釋放終極氣功技能！

---

## 🌟 核心特色 (Key Features)

### 1. 雙手獨立與聯動識別系統 (Dual-Hand Control System)
*   **左手控制（移動與輔助）**：
    *   **移動搖桿**：利用左手手掌相對於初始點的傾斜方向，模擬 3D 空間的前後左右移動，手勢握拳則向後退。
    *   **輔助瞄準**：左手比出 `OK` 手勢進入精準瞄準模式，並可透過中指的開合調節 `1.0x` 至 `4.0x` 的瞄準鏡倍率。
    *   **遊戲暫停**：左手掌面朝前（五指張開並攏）維持 1 秒以觸發暫停。
*   **右手控制（武器與攻擊）**：
    *   **槍械模式（遠程）**：比讚手勢定位瞄準點，快速屈伸食指扣動扳機（Fire）；翻轉右手（手背朝前食指伸直）維持 0.5 秒進行裝彈。
    *   **近戰格鬥（近身）**：快速揮動右手食指尖劃出高能光刃（速度 > 1.5 units/s）進行揮砍；右手握拳向上（昇龍拳姿勢）可為特殊技能蓄力。
*   **雙手聯動**：
    *   **終極大招**：雙手食指與大拇指閉合成三角形（氣功砲姿勢）維持 1.5 秒，即可釋放全螢幕終極大招（Ultimate）。

### 2. 3D 戰鬥競技場與流暢轉場 (3D Arena & Transitions)
*   **亮白灰 3D 競技場**：基於 Three.js 的明亮白灰色調場景與線性霧化效果，搭配反射性金屬地板與格線系統，視覺乾淨大氣，具備極佳的戰鬥拉扯空間。
*   **鍵盤備用控制**：支援 `WASD` / `方向鍵` 進行平滑移動，鍵盤 `ESC` 鍵一鍵暫停/繼續，對沒有鏡頭的環境極其友善。
*   **電影級體感轉場**：
    *   **主選單 ➜ 遊戲**：白色過門波紋由按鈕中心緩緩向外擴大（1.4s），待覆蓋全螢幕後自然無縫地揭示 3D 戰鬥畫面。
    *   **暫停 ➜ 繼續**：卡片與模糊遮罩同步以 0.4s 淡出，還原遊戲。
    *   **暫停 ➜ 主選單**：小確認彈窗先原地淡出，暫停卡片在空中進行 **Q彈膨脹（scale 1.08）** 懸停 50ms 後，再由慢至快（EaseInExpo）收縮抽離；主頁選單隨後以 **1.5s 慢速淡入**，極具呼吸感與空間區隔。
    *   **主選單 ➜ 測試診斷**：主頁背景與模糊度完全靜止（不進行任何淡出疊加，杜絕暗色閃爍），前台卡片以 0.5s 進行雙向交叉淡入淡出（對齊武器選單體感）。

### 3. 專業級雙手診斷與測試工作室 (Diagnostic Studio)
*   提供了全功能的診斷控制面板（`TEST_MODE`），方便開發者調校手勢靈敏度：
    *   **即時視訊與骨架繪製**：支援 Webcam 視訊亮度與對比度即時濾鏡調整，並以網頁 Canvas 渲染手部 21 個 Landmarks 骨架與連線。
    *   **狀態儀表板**：顯示左右手各手勢（移動坐標、瞄準倍率、冷卻時間、動作蓄力進度條）的即時數據。
    *   **測試數據回放**：預載多組錄製的手勢動作資料（如 `test_data/` 中的 JSON 檔），在沒有相機的環境下亦可模擬手勢數據流。

### 4. 模組化狀態機與武器系統配置 (Unified Config & State Machine)
*   **核心狀態機**：統一管理 `MENU`（選單）、`TEST_MODE`（測試診斷）、`PLAYING`（遊戲中）、`PAUSED`（暫停）四大狀態的無縫切換。
*   **虛擬手勢游標**：在主選單介面，右手食指尖可映射為虛擬滑鼠游標，透過大拇指與食指的捏合（Pinch）觸發按鈕點擊。
*   **武器庫設定**：定義了雷射手槍（Pistol）、突擊步槍（Rifle）、電磁狙擊槍（Sniper）、等離子大太刀（Katana）、深紅血魔術（Blood Magic）等不同武器的冷卻時間、傷害與動作時序限制。

---

## 📂 專案目錄結構 (Project Directory Layout)

```text
├── index.html                  # 網頁進入點與狀態主面板 (State Controller HUD)
├── package.json                # Vite 開發、打包與 Electron 封裝配置
├── vite.config.js              # Vite 伺服器配置 (Port 3000 / 自動瀏覽器開啟)
│
├── electron/
│   ├── main.cjs                # Electron 桌面客戶端主進程入口 (視窗創建、鏡頭權限管理)
│   └── icon.ico                # 應用程式桌面圖示
│
├── src/
│   ├── main.js                 # 應用程式啟動入口，綁定全域調試器與 HUD 事件
│   │
│   ├── core/
│   │   ├── App.js              # 核心協調器 (Subsystem Bootstrap & Lifecycle)
│   │   ├── StateManager.js     # 遊戲狀態機管理器 (單一資料源，發布-訂閱機制)
│   │   └── WeaponConfig.js     # 統一武器屬性與手勢動作觸發閾值設定檔
│   │
│   ├── game/
│   │   ├── BaseWeapon.js       # 武器邏輯基礎類別與冷卻計算
│   │   └── GameWorld.js        # [NEW] Three.js 3D 空間建置、競技場地表與玩家移動渲染引擎
│   │
│   ├── gestures/
│   │   ├── BaseGesture.js      # 單手/雙手特徵運算基底類別
│   │   └── GestureEngine.js    # 手勢決策引擎，處理 landmarks 平滑、死區與動作觸發
│   │
│   └── ui/
│       ├── style.css           # 扁平化深色科技感介面樣式表
│       ├── MenuManager.js      # 主選單、暫停選單、虛擬游標與自定義 UI style 確認彈窗
│       └── GestureTestWindow.js# Premium 浮動五區塊手勢診斷調試面板 (核心除錯模組)
│
└── test_data/                  # 用於偵錯的預錄手勢特徵 JSON 檔案庫
```

---

## 📦 Release 下載與獨立運行指南 (Release Distribution Guide)

為了獲得最佳的手勢體驗，我們強烈推薦直接下載專案預先編譯打包的 **Windows 獨立綠色可執行版**：

### 1. 從 Git Releases 下載運行 (推薦)
1. 前往本專案的 **Git Releases** 發行頁面。
2. 下載最新版本的 `FingerGundown-X.Y.Z.exe` 便攜式主程式（通常位於發行附件列表中）。
3. 下載後直接點擊 `FingerGundown-X.Y.Z.exe` 即可啟動遊戲。
4. **鏡頭授權**：第一次啟動時，程序會彈出系統視訊鏡頭授權許可，點擊「允許」後即可全螢幕暢玩（支援完全離線使用）。

### 2. 本地手動封裝編譯
如果您想要在本地環境自行封裝為 Windows 獨立應用程式：
1. 確保已安裝所有依賴，並完成前端編譯：
   ```bash
   npm install
   ```
2. 執行 Electron 打包命令：
   ```bash
   npm run electron:build
   ```
3. 編譯完成後，免安裝的可執行檔案將自動生成於 **`dist_electron/FingerGundown-0.2.0.exe`**，可將其拷貝至任意位置執行。

---

## 🛠️ 開發環境安裝與啟動 (Getting Started)

本專案使用現代 ES6 模組化架構，以 Vite 提供開發伺服器，並內嵌 Electron 桌面入口。

### 1. 安裝依賴項目
在專案根目錄下執行：
```bash
npm install
```

### 2. 啟動網頁版本地開發伺服器
運行以下命令啟動 Vite 伺服器，將自動開啟瀏覽器並運行在 `http://localhost:3000`：
```bash
npm run dev
```

### 3. 啟動桌面版 (Electron) 本地開發環境
若要在 Electron 視窗中直接進行調試，可執行：
```bash
npm run electron:dev
```

---

## 🎮 操作指南 (Control Guide)

### 1. 手勢控制 (Webcam Mode)
| 動作/功能 | 所屬手勢類型 | 手勢操作說明 | 觸發閾值與冷卻 |
| :--- | :--- | :--- | :--- |
| **前後左右移動** | 左手 (動態) | 手掌相對初始中心點傾斜；**握拳**向後退 | Deadzone: `0.15` |
| **遊戲暫停** | 左手 (狀態蓄力) | 手掌面朝相機（五指張開並攏）維持 1 秒 | 蓄力: `1.0s` |
| **選單游標/點擊** | 右手 (UI 模式) | 食指尖指向螢幕定位游標；食指與大拇指**捏合(Pinch)**點擊 | 點擊冷卻控制 |
| **精準瞄準 (Zoom)** | 左手 (聯動) | 比出 `OK` 手勢進入瞄準；中指張開/閉合控制 `1x-4x` 倍率 | 狀態切換: `0.5s` |
| **手槍射擊 (Fire)** | 右手 (槍械) | 比讚手勢定位瞄準點，快速下彎食指扣動扳機 | 射擊冷卻: `300ms` |
| **武器換彈 (Reload)**| 右手 (槍械) | 手背朝前且食指伸直（翻面），維持 0.5 秒 | 裝彈動畫鎖定: `2.0s` |
| **近戰揮砍 (Slash)** | 右手 (近戰) | 食指尖快速在空中畫線，揮舞速度大於閾值 | 判定速度: `1.5` / 冷卻 `350ms` |
| **特殊技能 (Skill)** | 右手 (近戰) | 右手握拳背朝外且拳朝上（昇龍拳姿勢），維持 1 秒 | 蓄力: `1.0s` / 動畫 `3.0s` |
| **終極大招 (Ult)** | 雙手 (同步蓄力) | 雙手食指與大拇指對齊閉合成三角形（氣功砲姿勢），維持 1.5 秒 | 蓄力: `1.5s` / 動畫 `5.0s` |

### 2. 鍵盤備用控制 (Keyboard Fallback)
*   **WASD** 或 **方向鍵**：平滑操縱玩家向前後左右方向移動。
*   **ESC 鍵**：當在 `PLAYING` 與 `PAUSED` 之間快速暫停/解除暫停（解除時享有與按鈕一致的 unpause 漸變淡出動畫）。

---

## 📈 開發進度與路徑圖 (Roadmap)

*   [x] **Phase 1: 架構同步 (Architecture Sync)** - 設計模組通訊、註冊全域 `App` 實例、完成單一資料源 `StateManager` 狀態轉移機制。
*   [x] **Phase 2: 診斷與測試工作室 (Gesture Test Window)** - 完成 Webcam 串流接入、自定義影像對比/亮度處理、 Landmarks 骨架即時渲染，以及錄製 JSON 手勢重播測試。
*   [x] **Phase 3: UI 狀態機整合 (UI State Machine)** - 動態武器配置清單、各狀態選單的顯示/隱藏動畫、虛擬手勢游標與點擊實作。
*   [x] **Phase 4: 手勢決策引擎 (Gesture Engine)** - 實作靈敏度平滑濾波、盲區判定、揮砍速度緩衝、蓄力計時鎖定，並與 `WeaponConfig` 數值完全對接。
*   [x] **Phase 5-1: 3D 基礎空間、相機與左手移動系統** - 建置灰白色調戰鬥競技場、霧化與網格線效果、Three.js 移動與阻尼渲染、鍵盤/手勢雙輸入移動、Q彈收縮與慢速漸入轉場、客製化確認彈窗與實體 ESC 鍵暫停。
*   [ ] **Phase 5-2: 敵人/標靶系統與標準受擊介面 (Hitbox / Hurtbox) 🚀 *Next Step*** - 生成動態敵人標靶、設計物體受擊反饋（Hit Flash/紅光提示）、計算標準受擊包圍盒（Hurtbox）與判定區（Hitbox）。
*   [ ] **Phase 5-3: 槍械射擊與彈道碰撞 (Ranged Attack System)**
*   [ ] **Phase 5-4: 技能/武器碰撞箱標準化紀錄 (Skill Hitbox Data Engine)**
*   [ ] **Phase 5-5: 技能視覺動畫表現與粒子特效 (Visual & FX Engine)**
