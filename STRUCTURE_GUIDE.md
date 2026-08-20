# Finger Gundown UI 重構架構與開發規範指南 (Refactoring & Architecture Guide)

本文件用作專案 UI 架構、手勢互動與排版標準的單一事實來源（Single Source of Truth）。在進行多輪對話、切換聊天室或後續功能擴展時，請嚴格遵守本指南定義的設計規範與開發標準。

---

## 1. 架構模組與職責劃分 (Architecture Modules)

專案採用**高凝聚、低耦合**的模組化架構，將遊戲邏輯、狀態管理、UI 容器及頁面視圖徹底分離：

```
src/
├── main.js                   # 應用程式入口點，綁定調試面板 (HUD)
├── core/
│   ├── App.js                # 全域啟動與調度器 (Orchestrator)
│   ├── StateManager.js       # 純狀態機 (Pure State Machine)
│   └── WeaponConfig.js       # 武器設定檔 (唯讀常數)
└── ui/
    ├── MenuManager.js        # UI 協調者 / 視圖路由器 (Router)
    ├── GameUIManager.js      # 2D 戰鬥 HUD 與技能冷卻管理器 [NEW]
    ├── style.css             # 統一賽博龐克樣式、排版與適配縮放
    ├── gameplay.css          # 戰鬥對稱式懸浮 HUD 樣式表 [NEW]
    └── views/
        ├── BaseView.js       # 抽象視圖基底類別 (Lifecycle Base)
        ├── MainMenuView.js   # 主選單頁面
        ├── WeaponsView.js    # 武器介紹與技能蜂巢圖頁面
        ├── GestureTestView.js# 手勢測試/診斷頁面樣板
        └── PauseView.js      # 暫停選單頁面
```

### 各模組職責詳細定義：
* **`StateManager` (純狀態機)**：只儲存目前系統狀態（`MENU`, `TEST_MODE`, `PLAYING`, `PAUSED`）並進行狀態守衛驗證，**絕不**直接操作 DOM、相機或 3D 場景。
* **`App` (全域調度器)**：協調各核心模組（UI、手勢引擎、3D 場景）。負責捕捉遊戲級輸入（如按 `Escape` 鍵暫停）並將信號轉送給狀態機，同時在狀態切換時調度 3D 模擬的啟動與暫停。
* **`MenuManager` (UI 視圖路由器)**：訂閱 `StateManager` 的狀態變更。
  1. 負責控制當前 View 的進退場流程（呼叫退出與載入函數）。
  2. 渲染手勢游標，並在每格更新中實作「手勢滑鼠指針模擬」。
* **`GameUIManager` (戰鬥 UI 協調器)**：管理 2D 空間十字準心、中央狀態面板（武器名稱與核心能量），以及左右雙側對稱獨立懸浮技能倒數格，實現物理位移與 DOM 渲染的徹底解耦。
* **`BaseView` 及子類別 (視圖層)**：負責特定頁面的 HTML 結構建立與本地事件綁定，透過統一生命週期與 `MenuManager` 互動。

---

## 2. 視圖生命週期標準 (View Lifecycle Standard)

所有頁面視圖必須繼承自 [src/ui/views/BaseView.js](file:///d:/06-程式/02_Html/02_FingerGundown/src/ui/views/BaseView.js)，並遵循以下非同步生命週期合約：

```javascript
class MyCustomView extends BaseView {
  // 1. 建立該頁面所需的 DOM 節點結構並返回
  createDOM() {
    const el = document.createElement('div');
    el.className = 'my-view-panel view-panel';
    el.innerHTML = `<!-- 頁面內容 -->`;
    return el;
  }

  // 2. 綁定該頁面內部的按鈕點擊或本機事件監聽器
  bindEvents() {
    this.domElement.querySelector('#btn-action').addEventListener('click', () => {
      this.onActionTriggered();
    });
  }

  // 3. (選填) 每影格動畫更新回呼
  update(timestamp) {
    // 處理頁面內部隨時間變化的動態渲染
  }

  // 4. (選填) 額外自訂資源清理（如相機串流、MediaPipe 監聽）
  destroy() {
    // 解除額外的事件監聽，釋放記憶體
  }
}
```

### 過場切換工作流（`MenuManager` 協調）：
1. 呼叫舊視圖的 `await currentView.exit()`：視圖被加入 `.view-exiting` 類別並播放退場動畫（如向上淡出），等待動畫結束後將 DOM 移出文件。
2. 實例化新視圖 `newView`。
3. 呼叫 `await newView.enter(container)`：將新視圖 of DOM 掛載至容器，執行重繪，加入 `.view-active` 類別並播放進場動畫（如自下方淡入）。

---

## 3. 手勢游標與事件模擬規範 (Pointer Emulation)

為了避免頻繁更新「可互動 Class 白名單」導致手勢滑鼠失效，游標交互改為**通用指針事件派發機制**：

1. **取得指針下方元素**：利用 `document.elementFromPoint(screenX, screenY)` 取得指針座標最底層的 DOM 節點。
2. **遍歷父層尋找互動節點**：自該節點向上遍歷父層，若遇到符合以下條件之一的節點，即視為可交互對象：
   * 標籤名稱為 `BUTTON` 或 `A`。
   * 類別清單中包含 `.clickable`、`.weapon-item` 或 `.hive-node`。
   * 該節點的 CSS 計算樣式中 `cursor` 屬性為 `pointer`。
3. **Hover 懸停模擬**：
   * 當移入互動節點時，為其加入 `.gesture-hover` 類別，並派發 `mouseenter` 事件。
   * 移出時，移除 `.gesture-hover` 類別，並派發 `mouseleave` 事件。
4. **Click 點擊模擬 (Pinch 捏合)**：
   * 當偵測到 Pinch 動態時，為可交互節點加上 `.virtual-clicked` 類別（觸發縮小回饋）。
   * 派發標準的冒泡 Native `MouseEvent('click', ...)` 事件，使所有標準 HTML `click` 監聽器皆可直接響應，**無需特別為手勢滑鼠另外實作點擊邏輯**。

---

## 4. 高度自適應與等比例縮放標準 (Responsive Sizing)

UI 排版必須能動態適配各種螢幕高度（縱向排版為主），且需在維持元素寬高比的同時防範高度溢出螢幕。

* **CSS 等比例單位 (`--scale-unit`)**：
  * 全域建立計算單位 `--scale-unit`：依據視窗寬高度較小者動態縮放。
  * 所有 UI 字型大小、內外距（padding/margin）、面板寬高度皆以 `--scale-unit` 為基準進行 calc 乘法計算，實現跨平台物理尺寸的一致性。
* **縱向高度防溢出防線**：
  * 面板必須設定高度上限：`max-height: 85vh;` 或 `max-height: calc(100vh - 120px);`。
  * 列表或主要內容區塊必須聲明 `overflow-y: auto;`，避免內容溢出。
  * 橫向滾動蜂巢技能圖等容器也必須支援 X/Y 軸裁剪與手勢拖曳，不破壞全螢幕賽博龐克玻璃框架。

---

## 5. 電影級視覺美學與賽博龐克風格規範 (Aesthetics & Theme)

為營造極致的沉浸感與電影質感，UI 介面必須嚴格符合以下視覺與動效標準：

* **配色系統**：以賽博龐克科幻霓虹為主色調。
  * 空間青色 (`#00f2fe` / `#4facfe`) 作為主要導航、高亮與手勢雷射邊框。
  * 警示粉紅 (`#ff0844` / `#ffb199`) 用作危險、生命值不足或武器過熱提示。
  * 虛擬金黃 (`#f6d365` / `#fda085`) 作為次要警示或能量充能完成。
* **高透光玻璃擬態 (Glassmorphism)**：
  * 所有主面板背景統一使用半透明極深色：`background: rgba(15, 16, 22, 0.75);`。
  * 疊加背景高斯模糊：`backdrop-filter: blur(12px) saturate(180%);` 確保高科技透明層次。
  * 四周描邊：使用細緻半透明青色單像素邊框，創造全像投影儀邊緣的發光效果。
* **動態網格遮罩 (Grid Pattern Scanline)**：
  * 玻璃背後必須疊加 `linear-gradient` 微型網格（Grid Pattern），並套用 `opacity: 0.1`，營造全像顯示幕的掃描線紋理。
* **滑動與微動畫 (Micro-interactions)**：
  * hover 時發光陰影（Box Shadow Glow）必須帶有 `transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);`。
  * 所有進場動畫皆需加上輕微的彈性偏移，使 UI 具有呼吸感。

---

## 6. 手勢視訊與骨架畫布完美重疊規範 (Video & Skeleton Canvas Overlays)

為避免玩家在操作手勢時產生眼手分離感，鏡頭影像與骨架點位必須在 DOM 與畫布層級進行高精準度的重疊對齊：

* **雙層畫布的整合與去 DOM 化**：
  * 取消使用兩個獨立 HTML Canvas 疊加的方案，改為**單一透明 Canvas (`#holistic-canvas`)** 覆蓋在 Webcam 視訊區之上。
* **在對接的繪製迴圈中**：
  1. 若開啟「顯示視訊」，使用 `ctx.drawImage(results.image, 0, 0, w, h)` 將水平鏡像翻轉的視訊幀畫在最底層。
  2. 若為「僅顯示骨架」（隱私模式），則用純暗色背景（`#08090d`）和網格遮罩刷掉底層。
  3. 關鍵點（Landmarks）與骨架骨線直接疊加在同一畫布上繪製。
* **原因**：確保骨架座標與實際指尖影像在視窗縮放或比例調整時**百分之百完美貼合**，避免雙層 DOM 元素定位偏移的缺陷。

---

## 7. 手勢識別與雙層過濾規範 (Gesture Recognition & Event Masking Standards)

為保證手勢操作的精準度與防誤觸性，手勢事件計算、平滑化與狀態過濾統一由 [GestureEngine.js](file:///d:/06-程式/02_Html/02_FingerGundown/src/core/GestureEngine.js) 處理：

### 1. 座標平滑化與 Pinch 鎖定防抖 (Stabilization & Lock-Assist)
* **游標平滑化**：手勢游標座標必須在引擎內部進行一階指數平滑濾波（Smoothing Factor 預設為 `0.35`），過濾手部生理微顫抖。
* **Pinch 點擊鎖定輔助**：為防止捏合（Pinch）觸發點擊時，指尖合攏造成的座標位移（滑標），引擎在檢測到 `ON_FIRE`（Pinch）狀態為 `true` 的期間，必須**自動將遊標位移阻尼係數極大化（或鎖定座標）**，確保點擊操作精準定位。

### 2. 靜態情境過濾 (Static Context Mask)
引擎依據當前的 `appMode` 與 `weaponMode` 在內部進行第一層靜態事件過濾，未通過過濾的手勢不廣播其 ON 事件：
* **`UI` 模式（選單頁面）**：僅允許輸出 `ON_AIM`（游標位置）與 `ON_FIRE`（捏合點擊），阻斷其他戰鬥動作。
* **`DEBUG` 模式（手勢測試頁）**：根據測試頁當前選中的 Mode Tab（如 `basic`, `ranged`, `melee`），決定對應卡片的手勢是否啟用，若啟用則輸出狀態變更事件，若未啟用則引擎靜態阻斷。
* **`GAME` 模式（戰鬥中）**：僅啟用目前玩家手持武器（定義於 `WeaponConfig.js` 中）支援的 `hiveActions` 手勢，其他手勢直接屏蔽。

### 3. 動態動畫鎖定 (Dynamic Animation Lockout)
* 當換彈或釋放技能手勢成功觸發並進入前搖/後搖動畫時，引擎自動設定鎖定計時器（時間長度依當前選用武器設定）。
* 在鎖定期間內，引擎會對外廣播 `ON_LOCKOUT` 狀態事件（攜帶 `action` 與 `duration` 等參數），並在內部**屏蔽一切衝突事件**（如禁止射擊與瞄準）。
* 該鎖定機制**在 `GAME` 與 `DEBUG` 模式下同步生效**，確保測試頁中能完美體驗真實關卡中的動作鎖定手感。

---

## 8. 手勢舒適操作定位校準規範 (Comfortable Bounds Calibration Standards)

為了實現手勢游標能自適應不同使用者的物理手臂活動極限，系統採用了**四角定位校準機制**：

### 1. 定位原理與資料儲存 (Calibration Rules & Persistence)
* **極值座標獲取**：校準時，必須採集大拇指捏合（Pinch）時的 **Webcam 原始座標（未經引擎映射縮放的 Landmarks[4] raw 數值）**。
* **舒適邊界計算**：依據採集的四個舒適極限角落，計算出平均的 `xMin`, `xMax`, `yMin`, `yMax` 作為映射矩形。
* **資料同步**：校準數值以小數點後三位（`toFixed(3)`）儲存於 `localStorage`，引擎初始化或更新時呼叫 `loadCalibrationData()` 讀取，確保全局游標與瞄準倍率計算完全同步。

### 2. 前端引導與視覺化反饋 (UI Guidance & Overlay Render)
* **動態指引步驟**：定位區分為五個步驟（1 = 左上、2 = 右上、3 = 左下、4 = 右下、5 = 完成計算）。
* **畫布區域提示**：
  * 定位分頁中，必須在視訊 Canvas 上疊加繪製目前使用邊界的**虛線矩形框**及**發光文字提示**。
  * 對應當前定位步驟的角落，繪製**閃爍的瞄準標靶圓圈**（如左上定位時在 `(xMin, yMin)` 繪製），引導使用者精準捏合。
* **操作去抖與觸發**：監聽 `ON_FIRE` 事件的**上升沿（Rising Edge，從 `false` 變為 `true` 的瞬間）**作為點擊觸發訊號，防範連續觸發或抖動造成的單點多記問題。

---

## 9. 視訊管線與 WebAssembly 資源回收迴避規範 (WebAssembly Leak Avoidance & Page Reload Bypass)

### 1. MediaPipe Wasm 記憶體洩漏與 re-initialization 衝突
* **現象與成因**：MediaPipe Holistic 引擎底層為龐大的 C++ 編譯 WebAssembly 模組，其在瀏覽器中會佔用大量 GPU 紋理 (WebGL Context) 與 Wasm 堆積記憶體。若在同一個網頁 Session 中頻繁 `close()` 並 `new Holistic()`，瀏覽器無法及時完成底層執行緒回收，將導致 Emscripten loader 拋出 `Cannot read properties of undefined` 錯誤並崩潰。
* **迴避架構**：
  * **單一實例複用**：在單次 Session 中，`holisticInstance` 僅加載一次且在記憶體中保持存活，不進行動態關閉。
  * **全域重新整理迴避 (Page Reload Bypass)**：當使用者點選 HUD 狀態欄的「全域手勢鏡頭」開關（啟動/關閉手勢追蹤）時，將設定值寫入 `localStorage`，隨後呼叫 **`location.reload()` 進行網頁硬重新整理**。
  * **效果**：藉由網頁重新整理，由瀏覽器直接強制銷毀 100% 的 WebGL Context、WebGL 紋理與 WebAssembly 記憶體堆積，從源頭杜絕內存洩漏；重新載入時依據 `localStorage` 自動進行全新的、無污染的相機與 Holistic 初始化。

---

## 10. 自訂確認彈窗與平行化無縫過場動畫規範 (Custom Dialogs & Parallel View Transitions)

為了提升整體 UI 的高科技質感並確保狀態轉換時的流暢體驗，系統制定了以下過場與確認彈窗規範：

### 1. 統一自訂確認彈窗 (Custom Dialogs)
* **禁用原生彈窗**：專案中禁止使用瀏覽器原生的 `confirm()` 阻斷式彈窗。
* **標準接口實作**：由 `MenuManager.js` 提供 `showConfirmModal(message, onConfirm, onCancel)` 標準接口，在 DOM 中動態維護一個高科技風格的 `#confirm-modal`（複用手勢引導遮罩樣式，確保 450px 寬度，高透光玻璃質感）。
* **事件清掃與綁定**：每次開啟確認彈窗時，必須使用 `cloneNode(true)` 完整複製並替換「確定」與「取消」按鈕，徹底清除舊的事件監聽器，防止 callback 堆積與內存洩漏。

### 2. 平行化無縫過場動畫 (Parallel Transitions)
* **重構串行流程**：放棄 `await oldView.exit() ➜ await newView.enter()` 的分段等待方式，改用 `Promise.all([oldView.exit(), newView.enter()])` **平行化執行進退場動畫**。
* **重疊交叉效果 (Cross-fade Overlay)**：
  * 當退場視圖漸隱並向上滑出時，進場視圖會同時在中央漸顯並滑入。
  * **層級限制 (Z-Index)**：在 `style.css` 中設定 `.view-panel.view-active` 的 `z-index` 為 `12`，而 `.view-panel.view-exiting` 的 `z-index` 為 `10`，確保進場視圖始終蓋在退場視圖上方，避免重疊時的穿幫問題。
* **互動安全鎖 (Interaction Lockout)**：退場視圖在 transition 執行時會被加入 `.view-exiting` 類別，CSS 會立刻設定 `pointer-events: none` 鎖定其所有點擊，防止過場期間因玩家逆點造成的狀態機混亂。

---

## 11. 重大 Bug 與避坑指南記錄 (Troubleshooting & Pitfalls)

在進行手勢游標與賽博龐克 UI 的整合調優過程中，團隊排除並記錄了以下容易再次發生的重大技術陷阱：

### 1. 瀏覽器首次渲染幀合併導致 Modal 動畫丟失 (DOM First-Mount Reflow Merge)
* **陷阱成因**：當動態創建 `#confirm-modal` 節點並透過 `appendChild` 加入 body 時，如果同步在同一個程式執行區塊（Sync Block）中立即執行 `classList.add('active')`，瀏覽器會將「節點渲染」與「啟動 active」合併在同一個 Layout 幀中計算。瀏覽器會認為該 Modal 從出生起就已經是 active 狀態，因此**完全跳過 CSS transition 的 `scale(0.7)` ➜ `scale(1)` 動效**，造成首次點擊時彈窗瞬間閃現的差勁體驗。
* **預防規範**：在向動態創建的 Modal 添加 active 類別之前，必須強制瀏覽器執行一次 layout reflow（最簡單的方法為讀取一次 `modal.offsetHeight` 或 `getBoundingClientRect()`），阻斷瀏覽器的合併渲染，確保 initial 樣式繪製完畢後再啟動過場。

### 2. 手勢 Hover 覆寫造成置中面板「向右下偏移/抖動」 (Translation Override Drift)
* **陷阱成因**：許多浮動面板（如 `.bottom-panel` 返回按鈕與 `.hive-node` 蜂巢節點）使用 `transform: translate3d(-50%, ...)` 或 `transform: translate(-50%, -50%)` 進行轉向置中對齊。若在通用 `.gesture-hover` 類別中定義了帶有 `!important` 的 `transform: translateY(-2px) scale(1.01) !important`，一旦游標懸停其上，全域的 `translateY` 會直接把置中所需的 `-50%` 置中偏移**徹底覆蓋拔除**。這會導致面板瞬間向右下偏移，進而滑出鼠標檢測範圍（觸發 mouseleave 並復原），陷入「Hover ➜ 偏移 ➜ 離開 hover ➜ 回位 ➜ 重新 hover」的無限死循環抖動。
* **預防規範**：
  * 通用的 `.gesture-hover` 類別中**絕對禁止**聲明 `transform` 與帶有 `!important` 的樣式，將其精簡為純顏色與發光陰影。
  * 任何需要 Hover 放大平移的特殊元素，應單獨或成對地在 CSS 中聲明專屬 Hover 規則（例如 `.menu-btn:hover, .menu-btn.gesture-hover`），並在平移時完整保留其原生的 X/Y 置中分量（例如寫為 `translate3d(-50%, -2px, 0)`）。

### 3. 指標 CSS 樣式繼承導致子文字與 SVG 邊界誤選 (Cursor Pointer Inheritance Over-targeting)
* **陷阱成因**：在模擬手勢滑鼠時，為了動態匹配互動目標，系統使用 `window.getComputedStyle(curr).cursor === 'pointer'` 為判定依據。然而，因為 `cursor: pointer` 會預設向下繼承至所有子節點，當游標浮在按鈕或列表項內的 `<h4>`、`<p>` 文字或 SVG 邊界時，這些子標籤的計算樣式也會是 `pointer`。這會導致 MenuManager 誤將 `.gesture-hover` 直接加在文字節點上，造成文字背後閃爍出矩形灰色背景的難看畫面。
* **預防規範**：在 `MenuManager.js` 的 `rawTarget` 向上遍歷父層的 while 迴圈中，新增繼承守衛：當前節點如果滿足 `cursor === 'pointer'`，需進一步檢查其父節點是否也帶有 `cursor === 'pointer'`。若是，說明當前節點僅是點擊區域內的文字/圖示子節點，應 `continue` 繼續向上遍歷至其真正的父級容器，保證 hover 類別加在最外層的互動大框上。

### 4. 視訊管線與 Wasm 堆積記憶體安全防護 (Wasm Leak Avoidance)
* **陷阱成因**：MediaPipe Holistic 底層載入的 C++ Wasm 模組會向瀏覽器索取大量 GPU 紋理與 WebAssembly 內存。若在同一個 Session 中動態 `close()` 相機並頻繁 `new Holistic()`，將直接導致 Emscripten loader 出現 Wasm 堆積溢出並使整個頁面凍結崩潰。
* **預防規範**：
  * **單一 Holistic 實例複用**：在單次 Session 中，`holisticInstance` 僅加載一次且在記憶體中保持存活。對於全域鏡頭的開啟/關閉切換，一律採用 localStorage保存狀態後，直接呼叫 `location.reload()` 進行頁面硬整理，由瀏覽器直接釋放 WebGL 與 Wasm Context 資源。
  * **退場重新整理機制 (Exit-Time Reload Bypass)**：在未開啟全域偵測時，重複進出測試頁（與未來遊戲頁）會反覆初始化與銷毀相機串流而造成效能卡頓。系統對此在 `MenuManager.js` 的 `transitionToView` 路由接口中實作了退場重新整理機制：當檢測到即將退出相機追蹤視圖且全域偵測為關閉時，首先執行原定的退出動作與動畫（側邊面板收縮與中央消失），等待安全計時器（約 950ms~1100ms）結束且 DOM 完全移出文件後，立即執行 `location.reload()` 重刷網頁。重新整理後會自動掛載主頁並流暢播起主選單的進場動效，在完全不影響視覺順暢度的情況下徹底杜絕記憶體洩漏。

### 5. 瞄準事件重複觸發導致偏移量與歷史隊列每影格重置 (Aim State Instantly Resetting Every Frame)
* **陷阱成因**：當玩家處於開鏡瞄準狀態時，手勢引擎 `GestureEngine` 在每影格都會發送帶有 `active: true` 的 `ON_SYNC_AIM` 事件。然而，原本的 `PlayerController` 監聽器缺乏狀態變更保護門檻，導致**每一影格都在無條件重新執行開鏡初始化代碼**。這會造成 `aimYawOffset` 與 `aimPitchOffset` 每一影格開頭都被強制歸零，使視角偏移量根本無法在影格間累積，畫面只能做出微小的單幀抖動，無法有效旋轉視角；此外，防抖滑動平均歷史隊列 `aimHandHistory` 與除噪計時器每影格都被重置清空，防抖濾波形同虛設，關鏡時由於 `aimYawOffset` 剛被歸零，相機所吸收的基底 yaw 也是錯誤的，導致視角無法正常歸位。
* **預防規範**：在 `PlayerController` 的事件監聽器中，必須加入**狀態變更攔截保護**（`if (this.isZoomed !== data.active)`）。只有在瞄準狀態「真正發生切換」的那一幀，才執行初始化（開鏡）或基底朝向吸收與清理（關鏡）邏輯，防止持續觸發引起的每幀重置歸零問題。

---

## 12. 3D 遊戲與電影級光圈過渡動畫銜接規範 (3D Game Modules & Cinematic Transitions Integration)

隨著遊戲世界與自訂快門式過渡動畫的實作，為確保 3D 邏輯與 2D UI 在跨系統銜接時沒有視覺缺陷，制定了以下銜接規範：

### 1. 3D 遊戲世界與手勢控制數據流 (3D World & Gesture Control Flow)
* **`GameWorld.js`**：整合 Three.js 場景、相機、光源、渲染器及動態 tick 迴圈（`requestAnimationFrame`）。
* **`PlayerController.js` (玩家控制與轉向響應)**：
  * **轉向死區與響應曲線**：監聽 `GestureEngine` 的 `ON_MOVE` 事件進行左右偏轉控制（`moveX`）。為防範手臂微顫造成視角晃動，套用 `0.15` 的死區門檻（Deadzone），對超出死區的數值採用三次方反應曲線（Cubic Response Curve），最後乘以基礎轉向速度 `1.2` 進行 Yaw 偏轉。
  * **瞄準座標與開鏡縮放解耦 (Aim vs Scoping Zoom)**：
    * 基礎準心定位（`aim` 手勢）在戰鬥中**對所有武器永遠保持開啟**，以滿足 homing (追蹤) 技能或拋投技能的指向需要。
    * 雙手同步開鏡變焦（`sync_aim` 手勢，OK 食指拇指捏合、中指開闔）則嚴格受限於 `WeaponConfig` 中的 `active` 與禁用表。
  * **三維發射物與動作輔助系統 (`ActionHelper.js` [RENAME])**：
    * **直線飛行 (Linear)**：使用 `Box3` 射線與包圍盒在每幀進行受擊碰撞檢測。
    * **追蹤飛行 (Homing)**：內建 `findNearestEnemy(pos)`，自動計算轉向阻尼向量逼近目標。
    * **固定位置 (Stationary)**：範圍法陣。支援角速度旋轉、正弦脈衝縮放（Pulsing Scale）與 tick-rate 傷害判定（如每 500ms 檢查並套用一次範圍重疊傷害）。

### 2. 電影級雙相光圈過渡動畫與防閃爍設計 (Cinematic Iris Transitions & Flicker Preventions)
為防止在主選單加載或退出暫停時，因視圖切換動畫的重疊導致玩家看到舊頁面在背景滑出的穿幫殘影，圓圈過場必須全面**異步 Promise 化**：
* **`closeIrisExit()` / `closeIrisEnter(x, y)` (關閉/膨脹遮罩)**：
  * 展開/收縮遮罩直到螢幕被 100% 蓋滿（Hollow 收縮至 `0px` 或 Solid 擴散覆蓋），此時 Promise 才 resolve。
  * 獲得 resolve 後，再執行 `stateManager.transitionTo`，讓新舊視圖的退出與進入動畫在黑色/灰色遮罩下默默播放完成。
* **`openIrisExit()` / `openIrisEnter()` (開啟/淡出遮罩)**：
  * 待 view 切換與進入動畫完全結束、新視圖完全掛載且就緒後，再觸發開圈或淡出，展現乾淨無瑕的 AAA 級切場。
* **動畫時間與平滑曲線**：過場圓圈的膨脹與收縮時間放慢至 `1.0s ~ 1.4s`，並使用 **Cubic Ease-in-out (三次貝氏雙向緩動曲線)**，使光圈起步與靠底均極為圓滑。

### 3. 過渡期透明度重疊與 Snapping 陷阱 (Transition Opacity & Class Snapping Pitfalls)
* **延遲移除類別防閃黑**：在暫停返回遊戲（`PAUSED` ➜ `PLAYING`）時，若在切換瞬間同步移除 overlay 的 `.paused-mode`，由於 overlay 還需進行 400ms 的淡出（Opacity 1 ➜ 0），背景會直接閃回黑色。應使用 `setTimeout` 延遲 500ms 待淡出結束後才移除 `.paused-mode`，確保全程以半透明質感退場。
* **全屏佈局容器透明度覆寫**：不要對 `.weapons-layout` 等全屏 UI 佈局容器使用 parent opacity 進入動畫，這會導致子面板在滑入時因為雙重透明度疊加而顯得「特別透明」。父容器應強制設為 `opacity: 1 !important` 且無 transition，將不透明度與平移動畫交由內部子面板（`.left-panel` 等）單獨控制，以確保卡片區塊擁有結實、高對比的視覺邊界。

### 4. 自適應雙側對稱式懸浮技能面板 (Symmetric Flanking HUD Layout)
* **中央狀態面板解耦 (`#gameplay-hud`)**：僅渲染武器名稱大標題與自定義的核心能量條（如雷射手手槍的核心溫度計、血巫術的血素值、紅魔族的魔力存量），並固定其高度為 `calc(14 * var(--scale-unit))` 以防換彈中顯示「裝填中...」時導致外框高度忽大忽小，實現視覺穩定。
* **獨立懸浮技能格 (`.hud-skill-badge`)**：移除舊的側邊外框底色與模糊。技能面板（左側與右側）完全容器化透明，每一個技能冷卻或功能狀態皆是一顆獨立浮空、具備 Cyberpunk 邊框發光特效的小卡片，顯著放大文字大小以提升資訊易讀性。
* **雙側水平平鋪**：左側輔助技能格（換彈、瞄準鏡、斬擊）與右側戰鬥格（普攻、技能、大招）均改為水平橫向排列 (`flex-direction: row`)，並透過 `left: calc(50% - 16 * var(--scale-unit)); transform: translateX(-100%);` 與 `left: calc(50% + 16 * var(--scale-unit));` 確保在大解析度螢幕下維持左右對稱之精巧間距。

### 5. 物件導向武器架構與實時暫停頁同步 (OO Weapons & Real-time Pause Sync)
* **BaseWeapon 與具體武器繼承**：武器統一繼承自 [BaseWeapon.js](file:///d:/06-程式/02_Html/02_FingerGundown/src/game/weapons/BaseWeapon.js), 實現冷卻時間計時、換彈計時、開鏡倍率與核心能量狀態在基類自動運作，避免子類代碼重複。各別武器子類只實現自定義的發射物或技能效果（例如 `PistolWeapon`, `RifleWeapon`, `SniperWeapon`, `KatanaWeapon`, `BloodMagicWeapon`, `CrimsonClanWeapon`）。
* **實時暫停同步**：在 `PlayerController.js` 的 `update(deltaTime)` 首影格檢測 `localStorage` 中儲存的 `gesture_selected_weapon` 指標。當玩家於暫停狀態下的武器頁切換選擇並點選 Resume 返回遊戲後，控制器會立刻捕獲差異並重置加載新武器實例，技能格與冷卻資訊在 1 幀內完成刷新，無縫銜接戰鬥。

### 6. 組件化飛射物生成架構 (Modular Projectile Composition System)
* **標準配置結構**：武器發射物（以三種槍的主射擊 `fire` 為主）改為配置驅動的組件化結構。在 `WeaponConfig.js` 中使用 `projectiles` 陣列儲存物件資訊，包含：
  * `shape`：形狀與尺寸幾何參數（如 `type: 'cylinder'`, `radius: 0.1`, `length: 60.0`, `pivot: 'start'`）。
  * `motion`：運動動畫控制（如 `type: 'linear', speed: 80.0` 或 `type: 'stationary'`）。
  * `collision`：碰撞與傷害模式（如 `type: 'impact'` 或 `type: 'once_per_target'`）。
  * `duration` (毫秒) 與 `delay` (毫秒)：表示飛射物的主動存活期與啟動前的等待時差。
  * `color` 與 `opacity`：控制飛射物的外觀材質渲染。
* **底層 ActionHelper 自動補全與延遲**：
  * **碰撞簡化繼承**：如果 `collision` 物件中省略了 `shape`、`length` 或 `radius`，底層 `ActionHelper.js` 會自動讀取最外層 `shape` 的同名屬性作為備用參數，防止配置冗餘。
  * **啟動延遲控制**：在延遲階段（`elapsed < delay`）時，Mesh 將保持 `visible = false` 且不執行任何運動或碰撞計算；脈衝縮放或 AOE tick 計時改以 `elapsed - delay` 相對時間計算，解決畫面出現殘影或提早判定傷害的問題。

### 7. 戰術開鏡瞄準防抖與動態錨點重置 (Tactical Zoom Scoping & Dynamic Center Anchoring)
* **滑動平均手勢濾波 (Sliding Window Moving Average Filter)**：絕對定位映射下，當手勢位於畫面邊緣或人體生理疲勞時，Webcam 所得的 MediaPipe 手部坐標會產生強烈的高頻雜訊。系統使用一個 5 影格的滑動歷史隊列（`aimHandHistory`）均攤手部座標，搭配恆定中速 `followSpeed = 8.0` 進行相機朝向插值。如此能使單影格的劇烈訊號跳變僅佔 1/5 的低比重，徹底消除高倍鏡微調時的生硬抖動與操作延遲。
* **動態中心錨點調整 (Dynamic Center Anchoring)**：由於開鏡瞄準時，相機水平與垂直的可偏轉上限（`effectiveMaxYaw` / `Pitch`）會隨著 FOV 縮放而按比例收縮。此時若右手偏離螢幕中心，尺規收縮會導致視角的目標角度發生突變，引發鏡頭無故平移（Drift）。系統在 `update` 的縮放插值期間，計算前後影格的邊界比率，按比例縮放當前 Yaw 偏移量的同時，**反向補償基底中心朝向**（$\text{aimCenterYaw}_{\text{new}} = (\text{aimCenterYaw}_{\text{old}} + \text{aimYawOffset}_{\text{old}}) - \text{aimYawOffset}_{\text{new}}$）。這可確保改變放大倍率時，鏡頭畫面所鎖定的 3D 空間目標絕對靜止。
* **無縫關鏡還原 (Zero-Snap Return Transition)**：為防止關鏡時相機因為動態錨點微調過後的偏差產生瞬間跳躍（Snap），關鏡瞬間首先將基底 `yaw` 設為出鏡時的實際中心 `aimCenterYaw` 以達到 0 突變過渡。隨後在非開鏡狀態下，使 `aimYawOffset` 與 `aimPitchOffset` 以 `restoreSpeed = 4.0` 緩緩歸零，並同步將基底 `this.yaw` 平滑插值回最一開始進鏡時的原始朝向 `aimStartYaw`。若玩家在回彈過程中輸入了手動 steering 控制，則立刻取消自動歸位程序以防操控對抗。
