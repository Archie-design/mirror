import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- 1. Create Rosters Table
CREATE TABLE IF NOT EXISTS public."Rosters" (
    phone TEXT PRIMARY KEY,
    name TEXT,
    birthday TEXT,
    squad_name TEXT,
    team_name TEXT,
    is_captain BOOLEAN DEFAULT false,
    is_commandant BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public."Rosters" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow admin full access on Rosters') THEN
        CREATE POLICY "Allow admin full access on Rosters" ON public."Rosters" FOR ALL USING (true);
    END IF;
END $$;

-- 2. Create TeamSettings Table
CREATE TABLE IF NOT EXISTS public."TeamSettings" (
    team_name TEXT PRIMARY KEY,
    mandatory_quest_id TEXT,
    inventory JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public."TeamSettings" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on TeamSettings') THEN
        CREATE POLICY "Allow public read on TeamSettings" ON public."TeamSettings" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow captain updates on TeamSettings') THEN
        CREATE POLICY "Allow captain updates on TeamSettings" ON public."TeamSettings" FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow inserts on TeamSettings') THEN
        CREATE POLICY "Allow inserts on TeamSettings" ON public."TeamSettings" FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- 3. Alter CharacterStats Table
ALTER TABLE public."CharacterStats" ADD COLUMN IF NOT EXISTS "Email" TEXT;
ALTER TABLE public."CharacterStats" ADD COLUMN IF NOT EXISTS "SquadName" TEXT;
ALTER TABLE public."CharacterStats" ADD COLUMN IF NOT EXISTS "TeamName" TEXT;
ALTER TABLE public."CharacterStats" ADD COLUMN IF NOT EXISTS "IsCaptain" BOOLEAN DEFAULT false;
`;

async function run() {
    try {
        console.log("Migrating database for Roster and Team System...");
        await pool.query(sql);
        console.log("Success!");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
