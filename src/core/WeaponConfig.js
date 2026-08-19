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
    description: '控制角色前後左右移動與倒退步。',
    chargeTime: 0,
    animationTime: 0
  },
  'left-pause': {
    id: 'left-pause',
    name: '暫停遊戲',
    category: 'basic',
    description: '開啟或關閉系統暫停選單。',
    chargeTime: 1500,
    animationTime: 0
  },
  'right-cursor': {
    id: 'right-cursor',
    name: '選單游標座標',
    category: 'basic',
    description: '映射虛擬游標以選擇 UI 按鈕。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-pinch': {
    id: 'right-pinch',
    name: 'Pinch 點擊',
    category: 'basic',
    description: '點選所對準的 UI 選項。',
    chargeTime: 0,
    animationTime: 0
  },

  // --- 測試用槍械 (ranged) ---
  'left-aim': {
    id: 'left-aim',
    name: '精準瞄準',
    category: 'ranged',
    description: '進入瞄準鏡視野，可無級調整放大倍率。',
    chargeTime: 500,
    animationTime: 0
  },
  'right-gun': {
    id: 'right-gun',
    name: '手槍射擊',
    category: 'ranged',
    description: '舉槍瞄準並扣動扳機進行單點或連發開火。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-reload': {
    id: 'right-reload',
    name: '換彈動作',
    category: 'ranged',
    description: '更換武器核心能源或物理彈匣。',
    chargeTime: 500,
    animationTime: 2000
  },
  'right-sync-aim-fire': {
    id: 'right-sync-aim-fire',
    name: '聯動發射',
    category: 'ranged',
    description: '輔助左手精確準星並調節倍率射擊。',
    chargeTime: 0,
    animationTime: 0
  },

  // --- 測試用近戰技能 (melee) ---
  'right-slash': {
    id: 'right-slash',
    name: '揮舞攻擊',
    category: 'melee',
    description: '進行近身光刃弧光斬擊或法力血爪撕裂。',
    chargeTime: 0,
    animationTime: 0
  },
  'right-skill': {
    id: 'right-skill',
    name: '蓄力技能',
    category: 'melee',
    description: '釋放中範圍戰術型副武器或法術招式。',
    chargeTime: 1000,
    animationTime: 3000
  },
  'left-ult': {
    id: 'left-ult',
    name: '蓄力大招',
    category: 'melee',
    description: '釋放終極毀滅性全屏招式或時空力場。',
    chargeTime: 1500,
    animationTime: 5000
  },
  'right-sync-ult': {
    id: 'right-sync-ult',
    name: '蓄力大招',
    category: 'melee',
    description: '釋放終極毀滅性全屏招式或時空力場。',
    chargeTime: 1500,
    animationTime: 5000
  }
};

export const WeaponConfig = {
  // --- 測試用武器 (不會在選單顯示) ---
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

  // --- 正式玩家武器 (顯示於武器庫選單) ---
  'pistol': {
    id: 'pistol',
    name: '雷射手槍',
    category: 'ranged',
    isPlayable: true,
    description: '配備高集束光子發射器，為本競技場之基本配備。適合遠程狙擊或定點清理，射擊精準度極高，但每次發射需要一定的散熱冷卻時間。',
    passive: {
      name: '爐心溶解',
      description: '配備無限能源電池，不需擔心備彈，但每次發射皆會累積熱能。連續快速射擊會導致武器過熱，需手動執行過載冷卻以加速排熱，否則過熱時會自動強制換彈，且換彈時間會加倍為 {reloadOverheatTime} 秒。',
      reloadOverheatTime: 4.0
    },
    hiveActions: {
      'fire': {
        name: '熱能光束',
        active: true,
        desc: '單點發射高能熱磁雷射，具備穿透路徑上所有敵人的電磁效能，每次發射會累積 {heatPerShot}% 熱能，冷卻 {cooldown} 秒。',
        cooldown: 450,
        damage: 25,
        type: 'stationary_beam',
        beamLength: 60.0,
        beamRadius: 0.1,
        duration: 300,
        tickInterval: 5000,  // 5s interval: guarantees exactly one hit during 0.3s beam lifetime
        color: 0xff0000,
        heatPerShot: 20.0
      },
      'reload': {
        name: '過載冷卻',
        active: true,
        desc: '主動開啟散熱閥，在 {duration} 秒裝填時間內快速排出核心熱能並重置過載。',
        duration: 2000,
        chargeTime: 500,
        animationTime: 2000
      },
      'aim': {
        name: '紅點瞄準鏡',
        active: true,
        desc: '啟動戰術紅點反射鏡，提供 {minZoom}x 至 {maxZoom}x 微幅輔助瞄準。',
        minZoom: 1.0,
        maxZoom: 1.2,
        defaultZoom: 1.1
      },
      'slash': {
        name: '揮舞',
        active: false,
        desc: '此槍械武器不支援近戰揮舞。'
      },
      'skill': {
        name: '手榴彈',
        active: true,
        desc: '軍人必備！蓄力 {chargeTime} 秒拋出電磁脈衝手榴彈，對範圍內敵人造成 {damage} 點巨大衝擊傷害並以中心點強力擊退目標，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 35,
        type: 'stationary',
        radius: 5.0,
        duration: 3000,
        rotateSpeed: 1.5,
        pulseSpeed: 4.0,
        tickInterval: 500,
        color: 0x00ffcc,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: 'Fracture Ray',
        active: true,
        desc: '某方塊頭的雷射炮。蓄力 {chargeTime} 秒將所有聚能核心加載至手槍，在 {animationTime} 秒內向前方發射毀滅性的巨大脈衝，造成 {damage} 點傷害，冷卻 {cooldown} 秒。',
        cooldown: 12000,
        damage: 50,
        type: 'stationary',
        radius: 9.0,
        duration: 5000,
        rotateSpeed: 5.0,
        pulseSpeed: 8.0,
        tickInterval: 250,
        color: 0x00ffff,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  },
  'rifle': {
    id: 'rifle',
    name: '突擊步槍',
    category: 'ranged',
    isPlayable: true,
    description: '中距離全自動突擊步槍，射速快且射擊穩定度適中，適合在移動中進行持續壓制火力輸出。',
    passive: {
      name: '準心校正',
      description: '射擊模式下自動啟動輔助射擊陀螺儀，射擊時獲得微幅自動追蹤或準心跟隨效果，提升掃射準確度。'
    },
    hiveActions: {
      'fire': {
        name: '戰術射擊',
        active: true,
        desc: '以極高射速進行全自動連續射擊，每發子彈造成 {damage} 點傷害，射擊冷卻為 {cooldown} 秒。',
        cooldown: 100,
        damage: 13,
        type: 'linear',
        speed: 55.0,
        color: 0xffd700,
        size: 0.1
      },
      'reload': {
        name: '快速擴容彈夾',
        active: true,
        desc: '更換特製的高容量擴容彈匣，裝填耗時 {duration} 秒，大幅增加彈藥續航力。',
        duration: 2000,
        chargeTime: 500,
        animationTime: 2000
      },
      'aim': {
        name: '伸縮倍鏡',
        active: true,
        desc: '切換為戰術瞄準視鏡，提供 {minZoom}x 至 {maxZoom}x 自由無級調節倍率，適應各距離戰場。',
        minZoom: 1.0,
        maxZoom: 4.0,
        defaultZoom: 2.0
      },
      'slash': {
        name: '揮舞',
        active: false,
        desc: '此槍械武器不支援近戰揮舞。'
      },
      'skill': {
        name: '燃燒瓶',
        active: true,
        desc: '便宜好做，平民神器！蓄力 {chargeTime} 秒拋出簡易燃燒瓶，在區域內造成持續燃燒傷害，並減速敵人 50%，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 15,
        type: 'stationary',
        radius: 5.0,
        duration: 3000,
        rotateSpeed: 1.5,
        pulseSpeed: 4.0,
        tickInterval: 500,
        color: 0xff7700,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: 'MG3讓遊戲變簡單',
        active: true,
        desc: '從不知道哪裡掏出來的 MG3。蓄力 {chargeTime} 秒後進入重裝火力壓制狀態。期間無法移動，子彈無限，射速加倍，且大招持續 {duration} 秒，冷卻 {cooldown} 秒。',
        cooldown: 35000,
        damage: 20,
        type: 'stationary',
        radius: 12.0,
        duration: 30000,
        rotateSpeed: 1.0,
        pulseSpeed: 2.0,
        tickInterval: 150,
        color: 0xffaa00,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  },
  'sniper': {
    id: 'sniper',
    name: 'AMR反坦克步槍',
    category: 'ranged',
    isPlayable: true,
    description: '高能反物資穿甲步槍，具備超遠射程與毀滅性單發傷害，但射擊間隔極長且需要更長的裝填冷卻。',
    passive: {
      name: '無限續杯',
      description: '在瞄準模式下，每擊殺一名敵人會立即返還一枚子彈，並自動填入彈夾。'
    },
    hiveActions: {
      'fire': {
        name: '精準射擊',
        active: true,
        desc: '單發發射超高動能穿甲彈，具備毀滅性的 {damage} 點單發傷害，冷卻間隔 {cooldown} 秒。',
        cooldown: 2000,
        damage: 100,
        type: 'linear',
        speed: 80.0,
        color: 0xffd700,
        size: 0.35
      },
      'reload': {
        name: '狙擊槍擴容彈夾',
        active: true,
        desc: '手動裝填重型穿甲彈藥，裝填需耗時 {duration} 秒。單發威力巨大但攜彈量極度有限。',
        duration: 2000,
        chargeTime: 500,
        animationTime: 2000
      },
      'aim': {
        name: '伸縮高倍鏡',
        active: true,
        desc: '切換為超遠距高倍瞄準視鏡，提供 {minZoom}x 至 {maxZoom}x 放大倍率切換，精準鎖定敵方要害。',
        minZoom: 2.0,
        maxZoom: 6.0,
        defaultZoom: 4.0
      },
      'slash': {
        name: '揮舞',
        active: false,
        desc: '此槍械武器不支援近戰揮舞。'
      },
      'skill': {
        name: '地刺陷阱',
        active: true,
        desc: '向前方中距離拋出地刺陷阱，對範圍內敵人造成單次 {damage} 點小額傷害，並使敵人停滯，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 5,
        type: 'stationary',
        radius: 6.0,
        duration: 4000,
        rotateSpeed: 0.5,
        pulseSpeed: 2.0,
        tickInterval: 1000,
        color: 0xbd00ff,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: 'ZAWARUDO',
        active: true,
        desc: '「ZA WARUDO！」使時間流速變慢。雙手蓄力 {chargeTime} 秒後啟動時空暫停力場，減緩場上所有敵人的動作，持續 {duration} 秒，冷卻 {cooldown} 秒。',
        cooldown: 25000,
        damage: 0,
        type: 'stationary',
        radius: 18.0,
        duration: 15000,
        rotateSpeed: 5.0,
        pulseSpeed: 8.0,
        tickInterval: 250,
        color: 0x00ffff,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  },
  'katana': {
    id: 'katana',
    name: '魘魔刀',
    category: 'melee',
    isPlayable: true,
    description: '約束暗能量與血刃的詛咒太刀。能自動在受擊時激發暗影格擋，且可在斬出追蹤刀氣的同時在戰場中閃現穿梭，是極度考驗操作的近身殺器。',
    passive: {
      name: '最需要操作之人',
      description: '受擊時自動觸發彈刀格擋，使所受傷害直接降低 30%。'
    },
    hiveActions: {
      'fire': {
        name: '亂丟劍氣的好日子',
        active: true,
        desc: '單發向前方釋放兩道交叉的自動追蹤劍氣，每發造成 {damage} 點傷害，冷卻間隔 {cooldown} 秒。',
        cooldown: 350,
        damage: 20,
        type: 'homing',
        speed: 20.0,
        color: 0x9400d3,
        size: 0.4
      },
      'reload': {
        name: '換彈',
        active: false,
        desc: '魘魔刀以血祭暗影核心驅動，不需裝填實體彈夾。'
      },
      'aim': {
        name: '精準瞄準',
        active: false,
        desc: '近戰刀法姿態不具備瞄準鏡功能。'
      },
      'slash': {
        name: '斬滅諸惡',
        active: true,
        desc: '揮舞大太刀向前方揮砍，對近距離敵人造成 {damage} 點扇形範圍的快速斬擊傷害，冷卻 {cooldown} 秒。',
        cooldown: 350,
        damage: 35
      },
      'skill': {
        name: '虛無刀界',
        active: true,
        desc: '舉刀擺出居合收刀架勢，蓄力 {chargeTime} 秒向前方大範圍扇形揮砍，留下緩慢前進且能持續撕裂敵人造成 {damage} 點傷害的圓弧劍氣，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 45,
        type: 'stationary',
        radius: 4.0,
        duration: 3000,
        rotateSpeed: 10.0,
        pulseSpeed: 0.0,
        tickInterval: 100,
        color: 0xff007f,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: '科目一',
        active: true,
        desc: '蓄力 {chargeTime} 秒後向左前方極速衝出留下殘影刀光，對大範圍內敵人造成持續多段撕裂斬擊，收刀入鞘時引爆 {damage} 點巨額傷害，冷卻 {cooldown} 秒。',
        cooldown: 12000,
        damage: 100,
        type: 'stationary',
        radius: 12.0,
        duration: 5000,
        rotateSpeed: 8.0,
        pulseSpeed: 12.0,
        tickInterval: 500,
        color: 0xff0000,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  },
  'blood-magic': {
    id: 'blood-magic',
    name: '血肉重鑄',
    category: 'melee',
    isPlayable: true,
    description: '使用遠古血巫術重構血肉的禁忌觸媒。能在「常態」與「渴望」兩種型態間輪轉。常態消耗血素換取精準法彈，渴望型態則開啟吞噬一切生命力的血之領域。',
    passive: {
      name: '我的經費在你之上',
      description: '擁有兩套完全不同的技能組。施展大招時在【常態】與【渴望】型態間切換。攻擊命中可恢復血素；常態下施法將消耗血素，渴望型態下施法不消耗血素。'
    },
    hiveActions: {
      'fire': {
        name: '鮮血長矛 / 血箭血泊',
        active: true,
        desc: '【常態-鮮血長矛】：消耗血素發射遠程追蹤長槍，造成 {damage} 傷害，冷卻 {cooldown} 秒。 / 【渴望-血箭血泊】：免消耗，召喚密集血箭覆蓋目標區域，造成持續傷害。',
        cooldown: 350,
        damage: 20,
        type: 'homing',
        speed: 22.0,
        color: 0xff0044,
        size: 0.4
      },
      'reload': {
        name: '換彈',
        active: false,
        desc: '血肉重鑄使用體內血素運作，不支持常規換彈。'
      },
      'aim': {
        name: '精準瞄準',
        active: false,
        desc: '血巫觸媒不支援加裝光學瞄準鏡。'
      },
      'slash': {
        name: '血鞭 / 血刃',
        active: true,
        desc: '【常態-血鞭】：以血素凝聚的血鞭，向前方揮舞造成近距離 {damage} 點扇形傷害，冷卻 {cooldown} 秒。 / 【渴望-血刃】：免消耗，從領域生成大範圍血霧之刃造成切割傷害。',
        cooldown: 350,
        damage: 30
      },
      'skill': {
        name: '血肉崩解 / 無淵之刺',
        active: true,
        desc: '【常態-血肉崩解】：消耗血素在敵方腳下凝聚法陣，噴發上升紅色光炮，造成 {damage} 傷害。 / 【渴望-無淵之刺】：免消耗，從領域召喚多根血矛刺穿中範圍敵人。蓄力 {chargeTime} 秒，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 40,
        type: 'stationary',
        radius: 4.5,
        duration: 3000,
        rotateSpeed: 2.0,
        pulseSpeed: 6.0,
        tickInterval: 300,
        color: 0xff002b,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: '冥河 / 惡之血',
        active: true,
        desc: '【常態-冥河】：血素滿額時展開「血之領域」並切為渴望形態。 / 【渴望-惡之血，最後的綻放】：血素滿額時收束領域並引爆彼岸花造成 {damage} 點高額傷害。蓄力 {chargeTime} 秒，冷卻 {cooldown} 秒。',
        cooldown: 12000,
        damage: 90,
        type: 'stationary',
        radius: 10.0,
        duration: 5000,
        rotateSpeed: 4.0,
        pulseSpeed: 10.0,
        tickInterval: 500,
        color: 0x990000,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  },
  'crimson-clan': {
    id: 'crimson-clan',
    name: '紅魔族',
    category: 'melee',
    isPlayable: true,
    description: '信仰爆裂魔法至高教義的魔導戰士。能發射小火球或召喚元素光劍，亦能拋投風神魔導具牽引敵人。然而因將全部技能點數投入爆裂魔法，施展終極魔法「Explosion!」後會耗盡全部魔力進入長達兩分鐘的虛弱期。',
    passive: {
      name: '為美好的爆裂獻上祝福',
      description: '將畢生所學獻給爆裂魔法。施展大招「Explosion!」後會耗盡所有魔力進入【缺魔狀態】，持續 120 秒。期間所有法術完全衰竭為微量傷害的物理打擊。'
    },
    hiveActions: {
      'fire': {
        name: '小火球 / 丟石頭',
        active: true,
        desc: '【常態-小火球】：發射一發遠程追蹤的小火球，造成 {damage} 傷害，冷卻 {cooldown} 秒。 / 【缺魔-丟石頭】：拿起路邊的石頭奮力丟出造成微量傷害。',
        cooldown: 350,
        damage: 20,
        type: 'homing',
        speed: 18.0,
        color: 0xff4500,
        size: 0.35
      },
      'reload': {
        name: '換彈',
        active: false,
        desc: '法術元素藉由魔力凝聚，不支援物理裝彈。'
      },
      'aim': {
        name: '精準瞄準',
        active: false,
        desc: '魔法導能系統不支持光學瞄準準星。'
      },
      'slash': {
        name: '光之聖劍 / 物理聖劍',
        active: true,
        desc: '【常態-光之聖劍】：以雷光匯聚元素之劍橫掃，造成 {damage} 點中距離傷害，冷卻 {cooldown} 秒。 / 【缺魔】：用法杖敲擊近身敵人造成微量傷害。',
        cooldown: 350,
        damage: 30
      },
      'skill': {
        name: '風神之詩',
        active: true,
        desc: '【常態-風神之詩】：拋出風神魔導具引導風暴，對大範圍內敵人造成持續傷害並強力聚怪。蓄力 {chargeTime} 秒，冷卻 {cooldown} 秒。',
        cooldown: 5000,
        damage: 10,
        type: 'stationary',
        radius: 7.0,
        duration: 3000,
        rotateSpeed: -3.0,
        pulseSpeed: 5.0,
        tickInterval: 200,
        color: 0x00ff88,
        chargeTime: 1000,
        animationTime: 3000
      },
      'ult': {
        name: 'Explosion!',
        active: true,
        desc: '【常態-Explosion!】：吟唱不必要的爆裂咒文，蓄力 {chargeTime} 秒引爆巨額爆裂魔法，造成 {damage} 點大範圍毀滅傷害，隨後進入 120 秒缺魔狀態，冷卻 {cooldown} 秒。',
        cooldown: 20000,
        damage: 150,
        type: 'stationary',
        radius: 15.0,
        duration: 5000,
        rotateSpeed: 10.0,
        pulseSpeed: 15.0,
        tickInterval: 250,
        color: 0xff0000,
        chargeTime: 1500,
        animationTime: 5000
      }
    }
  }
};
