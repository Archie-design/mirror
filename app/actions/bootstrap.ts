'use server';

import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const BOOTSTRAP_CACHE_TAG = 'bootstrap';

type SettingRow = { SettingName: string; Value: string };
type TempQuestRow = {
    id: string;
    title: string;
    sub: string;
    desc: string;
    reward: number;
    limit_count: number;
    active: boolean;
    created_at?: string;
};

interface BootstrapPayload {
    settings: SettingRow[];
    tempQuests: TempQuestRow[];
}

// 200 人開幕當下，未登入使用者每人都會打 SystemSettings + temporaryquests 各一次。
// 用 60 秒 cache 把 200 次 DB hit 折成 1 次；管理員寫入後以 revalidateTag 主動失效。
const fetchBootstrap = unstable_cache(
    async (): Promise<BootstrapPayload> => {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const [s, q] = await Promise.all([
            supabase.from('SystemSettings').select('SettingName, Value'),
            supabase.from('temporaryquests').select('*').order('created_at', { ascending: false }),
        ]);
        return {
            settings: (s.data ?? []) as SettingRow[],
            tempQuests: (q.data ?? []) as TempQuestRow[],
        };
    },
    ['bootstrap-public'],
    { revalidate: 60, tags: [BOOTSTRAP_CACHE_TAG] }
);

export async function getBootstrapData(): Promise<BootstrapPayload> {
    return fetchBootstrap();
}
