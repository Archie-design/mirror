import { createClient } from '@supabase/supabase-js';
import { TestimonyData } from '@/lib/line/parser';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function saveTestimony(params: {
    lineUserId: string;
    groupId: string | null;
    displayName: string | null;
    rawMessage: string;
    testimony: TestimonyData;
}) {
    const supabase = getServiceClient();
    const { lineUserId, groupId, displayName, rawMessage, testimony } = params;

    const { error } = await supabase.from('Testimonies').insert({
        line_user_id: lineUserId,
        line_group_id: groupId,
        display_name: displayName,
        parsed_name: testimony.parsedName,
        parsed_date: testimony.parsedDate,
        parsed_category: testimony.parsedCategory,
        content: testimony.content,
        raw_message: rawMessage,
    });

    if (error) throw new Error(error.message);
}

export async function upsertLineGroup(params: {
    groupId: string;
    groupName: string | null;
}) {
    const supabase = getServiceClient();
    await supabase.from('LineGroups').upsert(
        { group_id: params.groupId, group_name: params.groupName },
        { onConflict: 'group_id', ignoreDuplicates: true }
    );
}
