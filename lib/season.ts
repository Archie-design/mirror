import 'server-only';
import { createClient } from '@supabase/supabase-js';

// 賽季結束總開關（SystemSettings.SeasonEnded）
//
// 這個檔案**不是** 'use server'：與 checkin-core.ts 同樣屬於內部 helper，
// 供各 server action 於入帳前呼叫，client 無法直接觸發。
//
// 開關由管理後台寫入（updateGlobalSetting 以字串儲存），因此這裡統一以
// parseSeasonEnded() 解析，避免 "false" 字串被當成 truthy。

export const SEASON_ENDED_SETTING = 'SeasonEnded';
export const SEASON_ENDED_ERROR = '賽季已結束，打卡功能已關閉。';

/** SystemSettings 的值一律以字串儲存，"true" 才視為開啟。 */
export function parseSeasonEnded(raw: unknown): boolean {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
    return false;
}

/**
 * 讀取賽季結束開關。查詢失敗時回傳 false（不因設定讀取異常而擋掉正常打卡）。
 */
export async function isSeasonEnded(): Promise<boolean> {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
        .from('SystemSettings')
        .select('Value')
        .eq('SettingName', SEASON_ENDED_SETTING)
        .maybeSingle();

    if (error || !data) return false;
    return parseSeasonEnded((data as { Value: string | null }).Value);
}
