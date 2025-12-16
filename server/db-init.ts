import { getPool } from './db';
import fs from 'fs';
import path from 'path';

async function initDB() {
    try {
        const pool = await getPool();
        const schemaPath = path.resolve(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split by GO if necessary, but here we just have simple statements. 
        // MSSQL driver might handle multiple statements if separated by semicolon? 
        // Tedious/mssql often prefers single statements or batch.
        // We'll split by double newline as a heuristic or run as one batch if supported.
        // Actually, mssql driver supports multiple statements in one query usuall.

        await pool.request().query(schema);
        console.log('Database initialized successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

initDB();
