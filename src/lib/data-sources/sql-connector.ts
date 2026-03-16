/**
 * SQL Database Connector for ChurnGuard AI
 * Supports PostgreSQL, MySQL, and MSSQL connections
 */

import type { DatabaseConfig, Dataset } from '@shared/types';
import { AppError, ErrorFactory, withRetry } from '../error-handler';

/**
 * Connection pool interface
 */
interface ConnectionPool {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  close(): Promise<void>;
  isConnected(): boolean;
}

/**
 * Query result interface
 */
interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: { name: string; dataTypeID: number }[];
}

/**
 * SQL connector configuration
 */
export interface SQLConnectorConfig extends DatabaseConfig {
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

/**
 * Base SQL connector class
 */
export abstract class SQLConnector {
  protected config: SQLConnectorConfig;
  protected pool: ConnectionPool | null = null;

  constructor(config: SQLConnectorConfig) {
    this.config = {
      maxConnections: 10,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      ...config,
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): Promise<boolean>;

  /**
   * Execute a query with retry logic
   */
  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    if (!this.pool) {
      throw ErrorFactory.network('Database not connected');
    }

    return withRetry(
      () => this.pool!.query(sql, params),
      {
        maxRetries: 2,
        delayMs: 500,
        shouldRetry: (error) => {
          const msg = error.message.toLowerCase();
          return msg.includes('connection') || msg.includes('timeout') || msg.includes('network');
        },
      }
    );
  }

  /**
   * Fetch data from a table with pagination
   */
  async fetchTable(
    tableName: string,
    options: {
      columns?: string[];
      where?: string;
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Dataset> {
    const columns = options.columns?.join(', ') ?? '*';
    let sql = `SELECT ${columns} FROM ${this.escapeIdentifier(tableName)}`;
    const params: unknown[] = [];

    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    const limit = Math.min(options.limit ?? 100000, 100000);
    sql += ` LIMIT ${limit}`;

    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await this.query(sql, params);
    
    if (result.rows.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = Object.keys(result.rows[0]);
    return { headers, rows: result.rows as Record<string, any>[] };
  }

  /**
   * Execute a custom query and return as Dataset
   */
  async fetchQuery(sql: string, params: unknown[] = []): Promise<Dataset> {
    // Validate that it's a SELECT query
    const normalizedSql = sql.trim().toLowerCase();
    if (!normalizedSql.startsWith('select')) {
      throw new AppError(
        'Only SELECT queries are allowed for data fetching',
        'INVALID_QUERY',
        'validation',
        400
      );
    }

    const result = await this.query(sql, params);
    
    if (result.rows.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = Object.keys(result.rows[0]);
    return { headers, rows: result.rows as Record<string, any>[] };
  }

  /**
   * Get list of tables in the database
   */
  abstract getTables(): Promise<string[]>;

  /**
   * Get schema information for a table
   */
  abstract getTableSchema(tableName: string): Promise<TableSchema>;

  /**
   * Escape identifier for safe SQL
   */
  protected abstract escapeIdentifier(identifier: string): string;
}

/**
 * Table schema information
 */
export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: unknown;
  isPrimaryKey: boolean;
}

/**
 * PostgreSQL Connector
 */
export class PostgreSQLConnector extends SQLConnector {
  private pgClient: any = null;

  async connect(): Promise<void> {
    try {
      // Dynamic import for Node.js environment
      const { Pool } = await import('pg');
      
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.maxConnections,
        idleTimeoutMillis: this.config.idleTimeoutMs,
        connectionTimeoutMillis: this.config.connectionTimeoutMs,
      }) as unknown as ConnectionPool;

      // Test the connection
      await this.pool.query('SELECT 1');
    } catch (error) {
      throw ErrorFactory.network(
        `Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        await this.connect();
      }
      await this.pool!.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    const sql = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const result = await this.query(sql);
    return result.rows.map(row => row.table_name as string);
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const sql = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 
        AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `;
    
    const result = await this.query(sql, [tableName]);
    
    return {
      tableName,
      columns: result.rows.map(row => ({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        isPrimaryKey: row.is_primary_key as boolean,
      })),
    };
  }

  protected escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

/**
 * MySQL Connector
 */
export class MySQLConnector extends SQLConnector {
  private mysqlPool: any = null;

  async connect(): Promise<void> {
    try {
      const mysql = await import('mysql2/promise');
      
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? {} : undefined,
        connectionLimit: this.config.maxConnections,
        waitForConnections: true,
        queueLimit: 0,
      }) as unknown as ConnectionPool;

      // Test connection
      await this.pool.query('SELECT 1');
    } catch (error) {
      throw ErrorFactory.network(
        `Failed to connect to MySQL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        await this.connect();
      }
      await this.pool!.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    const sql = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const result = await this.query(sql, [this.config.database]);
    return result.rows.map(row => row.table_name as string);
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const sql = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        column_key = 'PRI' as is_primary_key
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position
    `;
    
    const result = await this.query(sql, [this.config.database, tableName]);
    
    return {
      tableName,
      columns: result.rows.map(row => ({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        isPrimaryKey: row.is_primary_key as boolean,
      })),
    };
  }

  protected escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
}

/**
 * MSSQL Connector (for server-side use with mssql package)
 */
export class MSSQLConnector extends SQLConnector {
  private mssqlPool: any = null;

  async connect(): Promise<void> {
    try {
      const sql = await import('mssql');
      
      this.pool = await sql.connect({
        user: this.config.user,
        password: this.config.password,
        server: this.config.host,
        port: this.config.port,
        database: this.config.database,
        options: {
          encrypt: this.config.ssl,
          trustServerCertificate: true,
        },
        pool: {
          max: this.config.maxConnections,
          idleTimeoutMillis: this.config.idleTimeoutMs,
        },
      }) as unknown as ConnectionPool;
    } catch (error) {
      throw ErrorFactory.network(
        `Failed to connect to MSSQL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        await this.connect();
      }
      await this.pool!.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<string[]> {
    const sql = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;
    const result = await this.query(sql);
    return result.rows.map(row => row.TABLE_NAME as string);
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const sql = `
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as IS_PRIMARY_KEY
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku 
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = @tableName 
        AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = @tableName
      ORDER BY c.ORDINAL_POSITION
    `;
    
    const result = await this.query(sql, { tableName });
    
    return {
      tableName,
      columns: result.rows.map(row => ({
        name: row.COLUMN_NAME as string,
        type: row.DATA_TYPE as string,
        nullable: row.IS_NULLABLE === 'YES',
        defaultValue: row.COLUMN_DEFAULT,
        isPrimaryKey: row.IS_PRIMARY_KEY === 1,
      })),
    };
  }

  protected escapeIdentifier(identifier: string): string {
    return `[${identifier.replace(/]/g, ']]')]`;
  }
}

/**
 * Factory function to create the appropriate SQL connector
 */
export function createSQLConnector(config: SQLConnectorConfig): SQLConnector {
  switch (config.type) {
    case 'postgresql':
      return new PostgreSQLConnector(config);
    case 'mysql':
      return new MySQLConnector(config);
    case 'mssql':
      return new MSSQLConnector(config);
    default:
      throw new AppError(
        `Unsupported database type: ${(config as any).type}`,
        'UNSUPPORTED_DATABASE',
        'validation',
        400
      );
  }
}

/**
 * Validate SQL connection configuration
 */
export function validateSQLConfig(config: unknown): SQLConnectorConfig {
  if (typeof config !== 'object' || config === null) {
    throw ErrorFactory.validation('Database configuration is required');
  }

  const cfg = config as Record<string, unknown>;

  if (!['postgresql', 'mysql', 'mssql'].includes(cfg.type as string)) {
    throw ErrorFactory.validation('Database type must be postgresql, mysql, or mssql');
  }

  if (typeof cfg.host !== 'string' || cfg.host.trim() === '') {
    throw ErrorFactory.validation('Database host is required');
  }

  if (typeof cfg.database !== 'string' || cfg.database.trim() === '') {
    throw ErrorFactory.validation('Database name is required');
  }

  if (typeof cfg.user !== 'string' || cfg.user.trim() === '') {
    throw ErrorFactory.validation('Database user is required');
  }

  return {
    type: cfg.type as 'postgresql' | 'mysql' | 'mssql',
    host: cfg.host as string,
    port: typeof cfg.port === 'number' ? cfg.port : cfg.type === 'postgresql' ? 5432 : cfg.type === 'mysql' ? 3306 : 1433,
    database: cfg.database as string,
    user: cfg.user as string,
    password: (cfg.password as string) ?? '',
    ssl: cfg.ssl as boolean | undefined,
    maxConnections: cfg.maxConnections as number | undefined,
    idleTimeoutMs: cfg.idleTimeoutMs as number | undefined,
    connectionTimeoutMs: cfg.connectionTimeoutMs as number | undefined,
  };
}
