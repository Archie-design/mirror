import { Pool } from 'pg';

let globalPool: Pool;

export function getPool() {
    if (!globalPool) {
        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL is not set. Please set it to a PostgreSQL connection string in .env.local");
        }
        globalPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            // Supabase requires SSL for remote connections
            ssl: { rejectUnauthorized: false }
        });
    }
    return globalPool;
}
