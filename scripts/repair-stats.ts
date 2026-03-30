import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const ROLE_GROWTH_RATES = {
    '動作巨星': { Physique: 3, Potential: 2, Charisma: 1, Luck: 1, Savvy: 1, Spirit: 0 },
    '喜劇泰斗': { Luck: 4, Charisma: 1, Potential: 1, Spirit: 1, Savvy: 1, Physique: 0 },
    '特效大師': { Spirit: 2, Physique: 2, Charisma: 1, Potential: 2, Luck: 1, Savvy: 0 },
    '偶像明星': { Charisma: 3, Luck: 3, Savvy: 1, Spirit: 1, Potential: 0, Physique: 0 },
    '文藝名導': { Spirit: 4, Potential: 3, Savvy: 1, Charisma: 0, Luck: 0, Physique: 0 }
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function repairStats() {
    console.log("Starting Dual-Track Stat Calibration...");

    const { data: users, error } = await supabase.from('CharacterStats').select('*');
    if (error) {
        console.error("Failed to fetch users:", error);
        return;
    }

    let updatedCount = 0;

    for (const user of users) {
        const pastLevels = user.Level - 1;

        if (pastLevels > 0) {
            const growthRates = ROLE_GROWTH_RATES[user.Role as keyof typeof ROLE_GROWTH_RATES] || {};
            const updatePayload: any = {};

            // To ensure safe calibration, we calculate the absolute expected bonus from level up
            // Assuming base start value is 10 for all stats (newly registered users)
            // Plus any manual bonuses they got from Daily Fixes (which we can't fully reconstruct here)
            // A safer approach is to simply ADD the multiplier to everyone as a one-time retroactive patch:
            // e.g. If Level 5, then +4 levels worth of modifiers.

            let hasChanges = false;
            for (const [stat, rate] of Object.entries(growthRates)) {
                if (rate > 0) {
                    updatePayload[stat] = user[stat] + (rate * pastLevels);
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                const { error: updateErr } = await supabase
                    .from('CharacterStats')
                    .update(updatePayload)
                    .eq('UserID', user.UserID);

                if (updateErr) {
                    console.error(`Failed to update ${user.Name}:`, updateErr);
                } else {
                    console.log(`Successfully calibrated ${user.Name} (Role: ${user.Role}, Level retro-patch: +${pastLevels})`);
                    updatedCount++;
                }
            }
        }
    }

    console.log(`Calibration complete. ${updatedCount} users updated.`);
}

repairStats();
