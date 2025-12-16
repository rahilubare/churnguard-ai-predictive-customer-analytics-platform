import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME,
    options: {
        encrypt: true, // For Azure
        trustServerCertificate: true // Change to false for production
    }
};

let pool: sql.ConnectionPool | null = null;

export async function getPool() {
    if (pool) return pool;
    try {
        pool = await sql.connect(config);
        console.log('Connected to MSSQL');
        return pool;
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err;
    }
}

export async function query(command: string, params: Record<string, any> = {}) {
    const pool = await getPool();
    const request = pool.request();
    for (const key in params) {
        request.input(key, params[key]);
    }
    return request.query(command);
}
