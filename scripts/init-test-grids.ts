/**
 * 為 20 筆測試帳號初始化九宮格（從 NineGridTemplates 複製）
 * 分配：每運 4 人，平均分散
 *
 * 執行：npx ts-node scripts/init-test-grids.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ASSIGNMENTS: { userId: string; name: string; companionType: string }[] = [
    { userId: 'test_u01', name: '測試一號', companionType: '事業運' },
    { userId: 'test_u02', name: '測試二號', companionType: '事業運' },
    { userId: 'test_u03', name: '測試三號', companionType: '事業運' },
    { userId: 'test_u04', name: '測試四號', companionType: '事業運' },
    { userId: 'test_u05', name: '測試五號', companionType: '財富運' },
    { userId: 'test_u06', name: '測試六號', companionType: '財富運' },
    { userId: 'test_u07', name: '測試七號', companionType: '財富運' },
    { userId: 'test_u08', name: '測試八號', companionType: '財富運' },
    { userId: 'test_u09', name: '測試九號', companionType: '情感運' },
    { userId: 'test_u10', name: '測試十號', companionType: '情感運' },
    { userId: 'test_u11', name: '測試十一', companionType: '情感運' },
    { userId: 'test_u12', name: '測試十二', companionType: '情感運' },
    { userId: 'test_u13', name: '測試十三', companionType: '家庭運' },
    { userId: 'test_u14', name: '測試十四', companionType: '家庭運' },
    { userId: 'test_u15', name: '測試十五', companionType: '家庭運' },
    { userId: 'test_u16', name: '測試十六', companionType: '家庭運' },
    { userId: 'test_u17', name: '測試十七', companionType: '體能運' },
    { userId: 'test_u18', name: '測試十八', companionType: '體能運' },
    { userId: 'test_u19', name: '測試十九', companionType: '體能運' },
    { userId: 'test_u20', name: '測試二十', companionType: '體能運' },
];

async function main() {
    // 一次取得所有模板
    const { data: templates, error: tErr } = await supabase
        .from('NineGridTemplates')
        .select('companion_type, cells, cell_score');

    if (tErr || !templates?.length) {
        console.error('無法讀取 NineGridTemplates：', tErr?.message);
        process.exit(1);
    }

    const templateMap = Object.fromEntries(templates.map(t => [t.companion_type, t]));

    let ok = 0;
    let fail = 0;

    for (const { userId, name, companionType } of ASSIGNMENTS) {
        const tmpl = templateMap[companionType];
        if (!tmpl) {
            console.error(`✗ 找不到模板：${companionType}（${name}）`);
            fail++;
            continue;
        }

        const cells = (tmpl.cells as { label: string; description: string }[]).map(c => ({
            ...c,
            completed: false,
            completed_at: null,
        }));

        const { error } = await supabase
            .from('UserNineGrid')
            .upsert({
                member_id: userId,
                companion_type: companionType,
                cells,
                cell_score: tmpl.cell_score,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'member_id' });

        if (error) {
            console.error(`✗ ${name}（${userId}）初始化失敗：${error.message}`);
            fail++;
        } else {
            console.log(`✓ ${name} → ${companionType}`);
            ok++;
        }
    }

    console.log(`\n完成：${ok} 筆成功，${fail} 筆失敗`);
}

main();
