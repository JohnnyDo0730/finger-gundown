/**
 * WeaponConfig.js - Unified Action & Weapon Configuration.
 * Stores name, category, descriptions, and gesture parameters (charge times, animation times).
 */
export const ActionConfig = {
  // --- 基礎操作-其他 (basic) ---
  'left-joystick': {
    id: 'left-joystick',
    name: '移動搖桿',
    category: 'basic',
    description: '左手水平傾斜控制前後左右移動，手勢握拳向後退。',
    chargeTime: 0,
    animationTime: 0
  },
  'left-pause': {
    id: 'left-pause',
    name: '暫停遊戲',
    category: 'basic',
    description: '左手掌面朝前（五指張開並攏）維持 1.0 秒。',
    chargeTime: 1000,
    animationTime: 0
  },
  'right-cursor': {
    id: 'right-cursor',
    name: '選單游標座標',
    category: 'basic',
    description: '食指尖指向螢幕，映射游標位置。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-pinch': {
    id: 'right-pinch',
    name: 'Pinch 捏合點擊',
    category: 'basic',
    description: '食指與大拇指捏合以點擊按鈕。',
    chargeTime: 0,
    animationTime: 0
  },

  // --- 測試槍械-槍械 (ranged) ---
  'left-aim': {
    id: 'left-aim',
    name: '精準瞄準',
    category: 'ranged',
    description: '左手比 OK 手勢進入瞄準，貼近/張開中指調節 1.0x~4.0x 倍率。',
    chargeTime: 500, // 0.5s entering/exiting transitions
    animationTime: 0
  },
  'right-gun': {
    id: 'right-gun',
    name: '手槍射擊',
    category: 'ranged',
    description: '比讚舉手定位(Aim) / 食指快速扣動射擊(Fire)（技能模式中可用作連發招式）。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-reload': {
    id: 'right-reload',
    name: '換彈手勢 (Reload)',
    category: 'ranged',
    description: '翻轉右手呈手背朝前且食指伸直，維持 0.5 秒。',
    chargeTime: 500,
    animationTime: 2000
  },
  'right-sync-aim-fire': {
    id: 'right-sync-aim-fire',
    name: '雙手聯動瞄準發射',
    category: 'ranged',
    description: '左手精準瞄準開啟時，右手移動操控視角方向與射線。',
    chargeTime: 0,
    animationTime: 0
  },

  // --- 測試技能組-技能組 (melee) ---
  'right-slash': {
    id: 'right-slash',
    name: '揮舞攻擊 (近戰普攻)',
    category: 'melee',
    description: '右手食指尖快速揮動，劃出光刃斬擊（速度高於 1.5 units/s）。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-skill': {
    id: 'right-skill',
    name: '蓄力技能 (單手)',
    category: 'melee',
    description: '右手握拳背朝外拳朝上（昇龍拳姿勢），維持 1.0 秒。',
    chargeTime: 1000,
    animationTime: 3000
  },
  'left-ult': {
    id: 'left-ult',
    name: '蓄力大招 (雙手同步)',
    category: 'melee',
    description: '雙手食指與大拇指閉合成三角形（氣功砲姿勢），維持 1.5 秒。',
    chargeTime: 1500,
    animationTime: 5000
  },
  'right-sync-ult': {
    id: 'right-sync-ult',
    name: '蓄力大招 (雙手同步)',
    category: 'melee',
    description: '雙手食指與大拇指閉合成三角形（氣功砲姿勢），維持 1.5 秒。',
    chargeTime: 1500,
    animationTime: 5000
  }
};

export const WeaponConfig = {
  // --- 測試用武器 (不會在選單顯示，但用來提供測試頁面基礎數值對應) ---
  'test-other': {
    id: 'test-other',
    name: '測試基礎操作',
    category: 'other',
    isPlayable: false,
    actions: ['left-joystick', 'left-pause', 'right-cursor', 'right-pinch']
  },
  'test-gun': {
    id: 'test-gun',
    name: '測試槍械',
    category: 'ranged',
    isPlayable: false,
    actions: ['left-aim', 'right-gun', 'right-reload', 'right-sync-aim-fire'],
    shootCooldown: 300,
    reloadTime: 2000,
    damage: 10
  },
  'test-melee': {
    id: 'test-melee',
    name: '測試技能組',
    category: 'melee',
    isPlayable: false,
    actions: ['right-slash', 'right-skill', 'left-ult', 'right-sync-ult'],
    slashCooldown: 350,
    skillCooldown: 5000,
    ultCooldown: 12000,
    damage: 15
  },

  // --- 正式玩家武器 (會在武器庫中顯示並供選擇) ---
  'pistol': {
    id: 'pistol',
    name: '雷射手槍',
    category: 'ranged',
    isPlayable: true,
    description: '配備高集束光子發射器，為本競技場之基本配備。適合遠程狙擊或定點清理，射擊精準度極高，但每次發射需要一定的散熱冷卻時間。',
    shootCooldown: 300,
    reloadTime: 2000,
    damage: 10
  },
  'rifle': {
    id: 'rifle',
    name: '突擊步槍',
    category: 'ranged',
    isPlayable: true,
    description: '中距離全自動突擊步槍，射速快且射擊穩定度適中，適合在移動中進行持續壓制火力輸出。',
    shootCooldown: 300,
    reloadTime: 2000,
    damage: 10
  },
  'sniper': {
    id: 'sniper',
    name: '電磁狙擊槍',
    category: 'ranged',
    isPlayable: true,
    description: '高能電磁狙擊步槍，具備超遠射程與毀滅性單發傷害，但射擊間隔極長且需要更長的裝填冷卻。',
    shootCooldown: 300,
    reloadTime: 2000,
    damage: 10
  },
  'katana': {
    id: 'katana',
    name: '等離子大太刀',
    category: 'melee',
    isPlayable: true,
    description: '高週波等離子約束光刃，可斬斷一切實體護甲。適合作戰距離極近的遭遇戰，揮砍範圍廣、傷害高，並具有短暫的格擋能力。',
    slashCooldown: 350,
    skillCooldown: 5000,
    ultCooldown: 12000,
    damage: 15
  },
  'blood-magic': {
    id: 'blood-magic',
    name: '深紅血魔術',
    category: 'melee',
    isPlayable: true,
    description: '操控深紅沸血的秘術觸媒，可凝聚鮮血長矛與爆炸法球，能在近身格鬥與中距離法術轟炸間自由切換。',
    slashCooldown: 350,
    skillCooldown: 5000,
    ultCooldown: 12000,
    damage: 15
  }
};
