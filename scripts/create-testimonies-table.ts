import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        await client.query('BEGIN');

        console.log('Creating Testimonies table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS public."Testimonies" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                line_group_id TEXT,
                line_user_id TEXT NOT NULL,
                display_name TEXT,
                parsed_name TEXT,
                parsed_date TEXT,
                parsed_category TEXT,
                content TEXT NOT NULL,
                raw_message TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `);

        await client.query(`ALTER TABLE public."Testimonies" ENABLE ROW LEVEL SECURITY;`);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on Testimonies') THEN
                    CREATE POLICY "Allow public read on Testimonies" ON public."Testimonies" FOR SELECT USING (true);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert on Testimonies') THEN
                    CREATE POLICY "Allow public insert on Testimonies" ON public."Testimonies" FOR INSERT WITH CHECK (true);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update on Testimonies') THEN
                    CREATE POLICY "Allow public update on Testimonies" ON public."Testimonies" FOR UPDATE USING (true);
                END IF;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
