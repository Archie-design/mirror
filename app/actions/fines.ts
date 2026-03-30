'use server';

import { connectDb } from '@/lib/db';
import { logAdminAction } from './admin';
import { getCurrentThemePeriod } from '@/lib/utils/time';

// ── 1. 查詢劇組所有成員罰款狀態 ─────────────────────────────────
// 回傳每位成員：累計罰款、已繳、餘額
export async function getSquadFineStatus(captainUserId: string) {
    const client = await connectDb();
    try {
        // 先確認是劇組長，取得 TeamName（劇組）
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) {
            return { success: false, error: '僅限劇組長使用此功能' };
        }
        const squadName = captainRes.rows[0].TeamName;

        const membersRes = await client.query<{
            UserID: string;
            Name: string;
            TotalFines: number;
            FinePaid: number;
        }>(
            `SELECT "UserID", "Name", "TotalFines", COALESCE("FinePaid", 0) AS "FinePaid"
             FROM "CharacterStats"
             WHERE "TeamName" = $1
             ORDER BY "Name"`,
            [squadName]
        );

        const members = membersRes.rows.map(m => ({
            userId: m.UserID,
            name: m.Name,
            totalFines: m.TotalFines,
            finePaid: m.FinePaid,
            balance: Math.max(0, m.TotalFines - m.FinePaid),
        }));

        return { success: true, squadName, members };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 2. 記錄隊員繳款 ──────────────────────────────────────────────
// amount: 此次繳款金額（NT$）
// periodLabel: 結算週期標籤，例如 "2026-W19~W20"
// paidToCaptainAt: 隊員交款給劇組長的日期（選填，YYYY-MM-DD）
export async function recordFinePayment(
    captainUserId: string,
    targetUserId: string,
    amount: number,
    periodLabel: string,
    paidToCaptainAt?: string,
) {
    if (amount <= 0) return { success: false, error: '金額必須大於 0' };

    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // 權限確認：captainUserId 是同劇組長
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) {
            await client.query('ROLLBACK');
            return { success: false, error: '僅限劇組長使用此功能' };
        }
        const squadName = captainRes.rows[0].TeamName;

        // 確認目標隊員在同劇組
        const targetRes = await client.query<{ Name: string; TotalFines: number; FinePaid: number; TeamName: string }>(
            `SELECT "Name", "TotalFines", COALESCE("FinePaid", 0) AS "FinePaid", "TeamName"
             FROM "CharacterStats" WHERE "UserID" = $1`,
            [targetUserId]
        );
        const target = targetRes.rows[0];
        if (!target || target.TeamName !== squadName) {
            await client.query('ROLLBACK');
            return { success: false, error: '目標隊員不在同一劇組' };
        }

        // 不能超過餘額
        const balance = Math.max(0, target.TotalFines - target.FinePaid);
        if (amount > balance) {
            await client.query('ROLLBACK');
            return { success: false, error: `繳款金額 NT$${amount} 超過餘額 NT$${balance}` };
        }

        // 更新 FinePaid
        await client.query(
            `UPDATE "CharacterStats" SET "FinePaid" = COALESCE("FinePaid", 0) + $1 WHERE "UserID" = $2`,
            [amount, targetUserId]
        );

        // 寫入 FinePayments 紀錄
        const insertRes = await client.query<{ id: string }>(
            `INSERT INTO "FinePayments"
               (user_id, user_name, squad_name, amount, period_label, paid_to_captain_at, recorded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                targetUserId,
                target.Name,
                squadName,
                amount,
                periodLabel,
                paidToCaptainAt || null,
                captainUserId,
            ]
        );

        await client.query('COMMIT');
        await logAdminAction('fine_payment', captainUserId, targetUserId, target.Name, {
            amount, periodLabel, paidToCaptainAt,
        });

        return { success: true, paymentId: insertRes.rows[0].id };
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 3. 更新「隊員交款給劇組長」日期 ──────────────────────────────
export async function setPaidToCaptainDate(
    captainUserId: string,
    paymentId: string,
    date: string,  // YYYY-MM-DD
) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: '日期格式錯誤，請使用 YYYY-MM-DD' };

    const client = await connectDb();
    try {
        // 確認是劇組長且此筆 payment 屬於同劇組
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) return { success: false, error: '僅限劇組長使用' };

        const { rowCount } = await client.query(
            `UPDATE "FinePayments"
             SET paid_to_captain_at = $1
             WHERE id = $2 AND squad_name = $3`,
            [date, paymentId, captainRes.rows[0].TeamName]
        );
        if (!rowCount) return { success: false, error: '找不到該繳款紀錄或不屬於本劇組' };

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 4. 查詢本週違規結算是否已執行 ────────────────────────────────
// 用於頁面載入時預填結算狀態，避免劇組長重複操作
export async function getLastComplianceRun(captainUserId: string) {
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
    const day = nowTW.getUTCDay() || 7;
    const thisMonday = new Date(nowTW);
    thisMonday.setUTCDate(nowTW.getUTCDate() - (day - 1));
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(thisMonday.getUTCDate() - 7);
    const periodLabel = weekStart.toISOString().slice(0, 10);

    const client = await connectDb();
    try {
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) return { success: false };
        const teamName = captainRes.rows[0].TeamName;

        const res = await client.query(
            `SELECT id FROM "AdminActivityLog"
             WHERE action = 'fine_compliance' AND target_name = $1
             LIMIT 1`,
            [`${periodLabel}|${teamName}`]
        );
        return { success: true, alreadyRun: (res.rowCount ?? 0) > 0, periodLabel };
    } catch {
        return { success: false };
    } finally {
        await client.end();
    }
}

// ── 5. 劇組長觸發本週/上週違規結算 ────────────────────────────────
// mondayISO: 指定週的週一日期（YYYY-MM-DD），省略時預設為上週週一
export async function checkSquadFineCompliance(
    captainUserId: string,
    mondayISO?: string,
) {
    const client = await connectDb();
    try {
        // 驗證劇組長身份
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) {
            return { success: false, error: '僅限劇組長使用此功能' };
        }
        const teamName = captainRes.rows[0].TeamName;

        // 計算目標週範圍（台灣時間，週一00:00 ~ 週一00:00）
        let weekStart: Date;
        if (mondayISO) {
            weekStart = new Date(mondayISO + 'T00:00:00+08:00');
        } else {
            const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
            const day = nowTW.getUTCDay() || 7;
            const thisMonday = new Date(nowTW);
            thisMonday.setUTCDate(nowTW.getUTCDate() - (day - 1));
            thisMonday.setUTCHours(0, 0, 0, 0);
            weekStart = new Date(thisMonday);
            weekStart.setUTCDate(thisMonday.getUTCDate() - 7);
        }
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
        const periodLabel = weekStart.toISOString().slice(0, 10);

        // 讀取後台設定
        const settingsRes = await client.query('SELECT "Value" FROM "SystemSettings" WHERE "SettingName" = \'FineSettings\'');
        let enabled = false;
        let amount = 200;
        let items: string[] = ['w3'];
        let periodStart = '';
        let periodEnd = '';

        if (settingsRes.rows.length > 0 && settingsRes.rows[0].Value) {
            try {
                const fs = JSON.parse(settingsRes.rows[0].Value);
                if (fs.enabled !== undefined) enabled = fs.enabled;
                if (fs.amount !== undefined) amount = fs.amount;
                if (fs.items) items = fs.items;
                if (fs.periodStart) periodStart = fs.periodStart;
                if (fs.periodEnd) periodEnd = fs.periodEnd;
            } catch (e) {}
        }

        if (!enabled) return { success: false, error: '後台罰款設定目前尚未啟用' };
        if (items.length === 0) return { success: false, error: '後台尚未設定罰款目標項目' };

        if (periodStart && periodLabel < periodStart) {
            return { success: false, error: '該結算週期早於系統設定的罰款開始日' };
        }
        if (periodEnd && periodLabel >= periodEnd) {
            return { success: false, error: '該結算週期晚於系統設定的罰款結束日' };
        }

        // 冪等保護：同一劇組同一週期只能結算一次
        const existingLog = await client.query(
            `SELECT id FROM "AdminActivityLog"
             WHERE action = 'fine_compliance' AND target_name = $1
             LIMIT 1`,
            [`${periodLabel}|${teamName}`]
        );
        if (existingLog.rowCount && existingLog.rowCount > 0) {
            return { success: true, alreadyRun: true, periodLabel };
        }

        // 查劇組所有成員
        const membersRes = await client.query<{ UserID: string; Name: string }>(
            `SELECT "UserID", "Name" FROM "CharacterStats" WHERE "TeamName" = $1`,
            [teamName]
        );
        const memberIds = membersRes.rows.map(m => m.UserID);
        if (memberIds.length === 0) return { success: false, error: '該劇組無任何成員' };

        // 取得該週所屬的電影主題，用來對應 t3 任務
        const themeAtWeek = getCurrentThemePeriod(weekStart);
        const t3Prefix = themeAtWeek.t3QuestBase;

        // 查該週內本劇組成員指定項目的打卡紀錄，依 UserID, 基底QuestID 分組計算完成次數
        // 使用 split_part 取得 ID 前端部分 (如 q1, w1, t3_forrest)
        const logsRes = await client.query<{ UserID: string, baseId: string, count: number }>(
            `SELECT "UserID", split_part("QuestID", '|', 1) as "baseId", count(*)::int as count FROM "DailyLogs"
             WHERE "Timestamp" >= $1 AND "Timestamp" < $2
               AND "UserID" = ANY($3)
             GROUP BY "UserID", "baseId"`,
            [weekStart.toISOString(), weekEnd.toISOString(), memberIds]
        );

        const completions = new Map<string, Map<string, number>>();
        for (const row of logsRes.rows) {
            if (!completions.has(row.UserID)) completions.set(row.UserID, new Map<string, number>());
            completions.get(row.UserID)!.set(row.baseId, row.count);
        }

        const violators: { userId: string; name: string; missingSum: number; fineAdded: number }[] = [];
        await client.query('BEGIN');
        
        for (const m of membersRes.rows) {
            let missingSum = 0;
            const userCounts = completions.get(m.UserID) || new Map<string, number>();

            for (const item of items) {
                // 特殊邏輯：如果是 t3，對應當週 prefix
                const checkId = (item === 't3') ? t3Prefix : item;
                if (!checkId) continue;

                // 如果是每日任務 (q 開頭，或關係定課 r1)，這週預期 7 次，若是週任務 w/a/t3/sq 預期 1 次
                const reqCount = (item.toLowerCase().startsWith('q') || item === 'r1') ? 7 : 1;
                const gotCount = userCounts.get(checkId) || 0;
                if (gotCount < reqCount) {
                    missingSum += (reqCount - gotCount);
                }
            }

            if (missingSum > 0) {
                const fineAdded = missingSum * amount;
                violators.push({ userId: m.UserID, name: m.Name, missingSum, fineAdded });
                await client.query(
                    `UPDATE "CharacterStats" SET "TotalFines" = "TotalFines" + $1 WHERE "UserID" = $2`,
                    [fineAdded, m.UserID]
                );
            }
        }
        await client.query('COMMIT');

        await logAdminAction('fine_compliance', captainUserId, undefined, `${periodLabel}|${teamName}`, {
            teamName,
            periodLabel,
            totalMembers: membersRes.rowCount || 0,
            violatorCount: violators.length,
            violators: violators.map(v => `${v.name}(缺${v.missingSum}次)`),
            itemsChecked: items,
            fineAmountConfig: amount,
        });

        return { success: true, alreadyRun: false, periodLabel, violators };
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 6. 記錄劇組長批次上繳大會 ─────────────────────────────────────
export async function recordOrgSubmission(
    captainUserId: string,
    amount: number,
    submittedAt: string,  // YYYY-MM-DD
    notes?: string,
) {
    if (amount <= 0) return { success: false, error: '金額必須大於 0' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedAt)) return { success: false, error: '日期格式錯誤，請使用 YYYY-MM-DD' };

    const client = await connectDb();
    try {
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) return { success: false, error: '僅限劇組長使用' };
        const squadName = captainRes.rows[0].TeamName;

        const insertRes = await client.query<{ id: string }>(
            `INSERT INTO "SquadFineSubmissions" (squad_name, amount, submitted_at, recorded_by, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [squadName, amount, submittedAt, captainUserId, notes || null]
        );
        await logAdminAction('fine_org_submission', captainUserId, undefined, squadName, { amount, submittedAt, notes });
        return { success: true, id: insertRes.rows[0].id };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 7. 查詢劇組上繳大會紀錄 ──────────────────────────────────────
export async function getSquadOrgSubmissions(captainUserId: string) {
    const client = await connectDb();
    try {
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) return { success: false, error: '僅限劇組長使用' };
        const squadName = captainRes.rows[0].TeamName;

        const res = await client.query(
            `SELECT id, squad_name, amount, submitted_at::text, recorded_by, notes,
                    to_char(created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD') AS created_at
             FROM "SquadFineSubmissions"
             WHERE squad_name = $1
             ORDER BY submitted_at DESC`,
            [squadName]
        );
        return { success: true, records: res.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 8. 查詢劇組歷史繳款紀錄 ──────────────────────────────────────
export async function getSquadFinePaymentHistory(captainUserId: string) {
    const client = await connectDb();
    try {
        const captainRes = await client.query<{ TeamName: string; IsCaptain: boolean }>(
            `SELECT "TeamName", "IsCaptain" FROM "CharacterStats" WHERE "UserID" = $1`,
            [captainUserId]
        );
        if (!captainRes.rows[0]?.IsCaptain) return { success: false, error: '僅限劇組長使用' };

        const squadName = captainRes.rows[0].TeamName;
        const histRes = await client.query(
            `SELECT id, user_id, user_name, amount, period_label,
                    paid_to_captain_at::text, submitted_to_org_at::text,
                    recorded_by, to_char(created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD') AS created_at
             FROM "FinePayments"
             WHERE squad_name = $1
             ORDER BY created_at DESC
             LIMIT 100`,
            [squadName]
        );

        return { success: true, squadName, records: histRes.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}
