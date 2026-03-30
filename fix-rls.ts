import { connectDb } from './lib/db';

async function run() {
    const client = await connectDb();
    try {
        console.log('Applying RLS policies for temporaryquests...');
        await client.query('ALTER TABLE "temporaryquests" ENABLE ROW LEVEL SECURITY;');
        await client.query('DROP POLICY IF EXISTS "Allow any for temp quests" ON "temporaryquests";');
        await client.query('CREATE POLICY "Allow any for temp quests" ON "temporaryquests" FOR ALL USING (true) WITH CHECK (true);');
        console.log('Success!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.end();
    }
}

run();
