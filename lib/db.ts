import { Client } from 'pg';

/**
 * Creates a new PostgreSQL client per request.
 * Use `client.end()` in the finally block to release the connection.
 *
 * pg.Pool holds idle connections open, which exhausts Supabase's connection
 * limit on Vercel serverless where each invocation may create its own pool.
 * Per-request Client avoids this entirely.
 */
export async function connectDb(): Promise<Client> {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set in environment variables.');
    }
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    return client;
}
