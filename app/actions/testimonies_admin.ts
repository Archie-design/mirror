'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { Testimony } from '@/types';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function getTestimonies(): Promise<Testimony[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
        .from('Testimonies')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
}
