-- 填入五運公版九宮格模板內容（依公版參考圖）
-- 格子順序：左上→右上 逐行（0-2 第一排, 3-5 第二排, 6-8 第三排）
-- 中心格（index 4）= 三道菜

UPDATE "NineGridTemplates" SET cells = '[
  {"label": "投其所好",   "description": ""},
  {"label": "父親故事書", "description": ""},
  {"label": "修適應力",   "description": ""},
  {"label": "工作八小時", "description": ""},
  {"label": "三道菜",     "description": ""},
  {"label": "修配合",     "description": ""},
  {"label": "孝親費",     "description": ""},
  {"label": "臣服上級",   "description": ""},
  {"label": "揚長補短",   "description": "上級"}
]' WHERE companion_type = '事業運';

UPDATE "NineGridTemplates" SET cells = '[
  {"label": "孝親費",     "description": ""},
  {"label": "投其所好",   "description": ""},
  {"label": "擁抱",       "description": ""},
  {"label": "斷捨離",     "description": ""},
  {"label": "三道菜",     "description": ""},
  {"label": "傾聽",       "description": ""},
  {"label": "欣賞",       "description": ""},
  {"label": "感恩信",     "description": ""},
  {"label": "母親故事書", "description": ""}
]' WHERE companion_type = '財富運';

UPDATE "NineGridTemplates" SET cells = '[
  {"label": "欣賞",         "description": ""},
  {"label": "擁抱",         "description": ""},
  {"label": "付出不求回報", "description": ""},
  {"label": "不帶結果溝通", "description": ""},
  {"label": "三道菜",       "description": ""},
  {"label": "投其所好",     "description": ""},
  {"label": "獨處",         "description": ""},
  {"label": "傾聽",         "description": ""},
  {"label": "陰柔功",       "description": "疼愛伴侶"}
]' WHERE companion_type = '情感運';

UPDATE "NineGridTemplates" SET cells = '[
  {"label": "孝親費",     "description": ""},
  {"label": "投其所好",   "description": ""},
  {"label": "擁抱",       "description": ""},
  {"label": "有品質陪伴", "description": ""},
  {"label": "三道菜",     "description": ""},
  {"label": "行事曆安排", "description": "針對父母／伴侶／自己"},
  {"label": "父母親故事書","description": ""},
  {"label": "感恩信",     "description": ""},
  {"label": "不帶結果溝通","description": ""}
]' WHERE companion_type = '家庭運';

UPDATE "NineGridTemplates" SET cells = '[
  {"label": "曬太陽15分鐘", "description": "一週至少3次以上"},
  {"label": "丹氣慢跑15分鐘","description": "一週至少3次以上"},
  {"label": "打拳",          "description": "一週至少3次以上"},
  {"label": "破曉",          "description": "一週至少3次以上"},
  {"label": "三道菜",        "description": ""},
  {"label": "子時入睡",      "description": "一週至少3次以上"},
  {"label": "主動吃苦",      "description": ""},
  {"label": "赤腳爬山",      "description": ""},
  {"label": "接觸大自然",    "description": "ex.山上／河邊／海邊"}
]' WHERE companion_type = '體能運';
