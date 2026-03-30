'use server';

import { createClient } from '@supabase/supabase-js';
import { W4Application } from '@/types';
import { processCheckInTransaction } from '@/app/actions/quest';
import { logAdminAction } from '@/app/actions/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ── 隊員：提交電影推廣申請 ─────────────────────────────────────
export async function submitW4Application(
    userId: string,
    userName: string,
    squadName: string | null,
    battalionName: string | null,
    interviewTarget: string,
    interviewDate: string,      // YYYY-MM-DD
    description: string = ''
) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // questId includes target so each person's interview is a distinct check-in record
    const questId = `w4|${interviewDate}|${interviewTarget.trim().slice(0, 50)}`;

    // 防止對同一對象在同一天重複提交（同一天可以電影推廣多人，但同一對象不能重複）
    const { data: existing } = await supabase
        .from('W4Applications')
        .select('id, status')
        .eq('user_id', userId)
        .eq('interview_date', interviewDate)
        .eq('interview_target', interviewTarget.trim())
        .neq('status', 'rejected')
        .maybeSingle();

    if (existing) {
        return { success: false, error: `已有「${interviewTarget.trim()}」的同日申請（待審或已核准），無法重複提交` };
    }

    const { data, error } = await supabase
        .from('W4Applications')
        .insert({
            user_id: userId,
            user_name: userName,
            squad_name: squadName,
            battalion_name: battalionName,
            interview_target: interviewTarget,
            interview_date: interviewDate,
            description,
            quest_id: questId,
            status: 'pending',
        })
        .select()
        .single();

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true, application: data as W4Application };
}

// ── 劇組長：初審 ─────────────────────────────────────────
export async function reviewW4BySquadLeader(
    appId: string,
    reviewerId: string,
    approve: boolean,
    notes: string = ''
) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 驗證審核者為劇組長，且與申請人同劇組
    const { data: reviewer } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName, Name')
        .eq('UserID', reviewerId)
        .single();

    if (!reviewer?.IsCaptain) return { success: false, error: '僅限劇組長進行初審' };

    const { data: app } = await supabase
        .from('W4Applications')
        .select('squad_name, status')
        .eq('id', appId)
        .single();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請已被審核，無法重複操作' };
    if (app.squad_name !== reviewer.TeamName) return { success: false, error: '只能審核本劇組的申請' };

    const { error } = await supabase
        .from('W4Applications')
        .update({
            status: approve ? 'squad_approved' : 'rejected',
            squad_review_by: reviewerId,
            squad_review_at: new Date().toISOString(),
            squad_review_notes: notes,
        })
        .eq('id', appId);

    if (error) return { success: false, error: '審核更新失敗：' + error.message };
    return { success: true, newStatus: approve ? 'squad_approved' : 'rejected' };
}

// ── b3–b7 獎勵對照表 ─────────────────────────────────────
const BONUS_QUEST_CONFIG: Record<string, { reward: number; title: string }> = {
    b3: { reward: 5000, title: '續報高階/五運班加分' },
    b4: { reward: 5000, title: '成為小天使加分' },
    b5: { reward: 3000, title: '報名聯誼會（1年）加分' },
    b6: { reward: 5000, title: '報名聯誼會（2年）加分' },
    b7: { reward: 1000, title: '參加實體課程加分' },
};

// ── 管理員：終審 ──────────────────────────────────────────
export async function reviewW4ByAdmin(
    appId: string,
    action: 'approve' | 'reject',
    notes: string = '',
    reviewerName: string = 'admin'
) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: app } = await supabase
        .from('W4Applications')
        .select('*')
        .eq('id', appId)
        .single();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'squad_approved') return { success: false, error: '此申請尚未通過劇組長初審' };

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error: updateErr } = await supabase
        .from('W4Applications')
        .update({
            status: newStatus,
            final_review_by: reviewerName,
            final_review_at: new Date().toISOString(),
            final_review_notes: notes,
        })
        .eq('id', appId);

    if (updateErr) return { success: false, error: '終審更新失敗：' + updateErr.message };

    if (action === 'approve') {
        // 依 quest_id 前綴判斷獎勵（b3–b7 有各自金額；w4 傳愛系統預設 1000）
        const questIdBase = app.quest_id.split('|')[0];
        const bonusInfo = BONUS_QUEST_CONFIG[questIdBase];
        const reward = bonusInfo ? bonusInfo.reward : 1000;
        const rewardTitle = bonusInfo ? bonusInfo.title : '星光電影推廣獎勵';
        const dice = bonusInfo ? 0 : 1;

        const checkInRes = await processCheckInTransaction(
            app.user_id,
            app.quest_id,
            rewardTitle,
            reward
        );
        if (!checkInRes.success) {
            await logAdminAction('w4_final_approve', reviewerName, appId, app.user_name, {
                interviewTarget: app.interview_target,
                questId: app.quest_id,
                checkInError: checkInRes.error,
            }, 'error');
            return { success: true, warning: '審核已核准，但入帳失敗：' + checkInRes.error };
        }
        await logAdminAction('w4_final_approve', reviewerName, appId, app.user_name, {
            interviewTarget: app.interview_target,
            questId: app.quest_id,
            reward,
        });
    } else {
        await logAdminAction('w4_final_reject', reviewerName, appId, app.user_name, {
            interviewTarget: app.interview_target,
            notes,
        });
    }

    return { success: true, newStatus };
}

// ── 學員：提交 b3–b7 加分申請 ──────────────────────────────
export async function submitBonusApplication(
    userId: string,
    userName: string,
    squadName: string | null,
    battalionName: string | null,
    bonusType: 'b3' | 'b4' | 'b5' | 'b6' | 'b7',
    target: string,      // 申請描述（課程名稱 / 聯誼會 / 課程日期…）
    date: string,        // YYYY-MM-DD
    description: string = ''
) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // b3、b4、b5、b6 每人只能申請一次（未被駁回的情況下）
    if (['b3', 'b4', 'b5', 'b6'].includes(bonusType)) {
        const { data: existing } = await supabase
            .from('W4Applications')
            .select('id, status')
            .eq('user_id', userId)
            .eq('quest_id', bonusType)
            .neq('status', 'rejected')
            .maybeSingle();

        if (existing) {
            return { success: false, error: `${BONUS_QUEST_CONFIG[bonusType].title} 已有申請記錄，無法重複提交` };
        }
    }

    // b7 每次課程日期不同，quest_id 帶日期以允許多次申請
    const questId = bonusType === 'b7' ? `b7|${date}` : bonusType;

    const { data, error } = await supabase
        .from('W4Applications')
        .insert({
            user_id: userId,
            user_name: userName,
            squad_name: squadName,
            battalion_name: battalionName,
            interview_target: target,
            interview_date: date,
            description,
            quest_id: questId,
            status: 'squad_approved',   // 直接進入管理員終審，略過小隊長初審
        })
        .select()
        .single();

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true, application: data as W4Application };
}

// ── 查詢申請列表 ──────────────────────────────────────────
export async function getW4Applications(filter: {
    userId?: string;
    squadName?: string;
    status?: string;
} = {}) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let query = supabase.from('W4Applications').select('*').order('created_at', { ascending: false });

    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.squadName) query = query.eq('squad_name', filter.squadName);
    if (filter.status) query = query.eq('status', filter.status);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, applications: [] };
    return { success: true, applications: (data || []) as W4Application[] };
}

// ── 查詢管理操作日誌 ──────────────────────────────────────
export async function getAdminActivityLog(limit = 50) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('AdminActivityLog')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) return { success: false, error: error.message, logs: [] };
    return { success: true, logs: data || [] };
}
