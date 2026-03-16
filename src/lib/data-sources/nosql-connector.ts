/**
 * NoSQL Database Connector for ChurnGuard AI
 * Supports MongoDB connections
 */

import type { NoSQLConfig, Dataset } from '@shared/types';
import { AppError, ErrorFactory, withRetry } from '../error-handler';

/**
 * MongoDB document interface
 */
interface MongoDocument {
  _id?: unknown;
  [key: string]: unknown;
}

/**
 * MongoDB connector configuration
 */
export interface MongoConnectorConfig extends NoSQLConfig {
  maxPoolSize?: number;
  connectTimeoutMs?: number;
  queryTimeoutMs?: number;
}

/**
 * MongoDB Connector
 */
export class MongoDBConnector {
  private config: MongoConnectorConfig;
  private client: any = null;
  private db: any = null;

  constructor(config: MongoConnectorConfig) {
    this.config = {
      maxPoolSize: 10,
      connectTimeoutMs: 10000,
      queryTimeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      
      this.client = new MongoClient(this.config.uri, {
        maxPoolSize: this.config.maxPoolSize,
        connectTimeoutMS: this.config.connectTimeoutMs,
        socketTimeoutMS: this.config.queryTimeoutMs,
      });

      await this.client.connect();
      this.db = this.client.db(this.config.database);

      // Test the connection
      await this.db.command({ ping: 1 });
    } catch (error) {
      throw ErrorFactory.network(
        `Failed to connect to MongoDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  /**
   * Test the connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        await this.connect();
      }
      await this.db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of collections
   */
  async getCollections(): Promise<string[]> {
    if (!this.db) {
      throw ErrorFactory.network('Database not connected');
    }

    const collections = await this.db.listCollections().toArray();
    return collections.map((c: any) => c.name);
  }

  /**
   * Fetch documents from a collection
   */
  async fetchCollection(
    collectionName?: string,
    options: {
      filter?: Record<string, unknown>;
      projection?: Record<string, 0 | 1>;
      sort?: Record<string, 1 | -1>;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<Dataset> {
    const collection = this.db.collection(collectionName ?? this.config.collection);
    
    const limit = Math.min(options.limit ?? 100000, 100000);
    
    let cursor = collection.find(options.filter ?? {}, {
      projection: options.projection,
      limit,
      skip: options.skip,
    });

    if (options.sort) {
      cursor = cursor.sort(options.sort);
    }

    const docs = await withRetry(
      () => cursor.toArray(),
      { maxRetries: 2, delayMs: 500 }
    );

    if (docs.length === 0) {
      return { headers: [], rows: [] };
    }

    // Convert MongoDB documents to flat tabular format
    return this.documentsToDataset(docs);
  }

  /**
   * Execute an aggregation pipeline
   */
  async aggregate(
    pipeline: Record<string, unknown>[],
    collectionName?: string
  ): Promise<Dataset> {
    const collection = this.db.collection(collectionName ?? this.config.collection);
    
    const docs = await withRetry(
      () => collection.aggregate(pipeline).toArray(),
      { maxRetries: 2, delayMs: 500 }
    );

    if (docs.length === 0) {
      return { headers: [], rows: [] };
    }

    return this.documentsToDataset(docs);
  }

  /**
   * Get schema information by sampling documents
   */
  async inferSchema(
    collectionName?: string,
    sampleSize: number = 100
  ): Promise<MongoSchema> {
    const collection = this.db.collection(collectionName ?? this.config.collection);
    
    const docs = await collection.aggregate([
      { $sample: { size: sampleSize } }
    ]).toArray();

    const schema: MongoSchema = {
      collectionName: collectionName ?? this.config.collection,
      fields: {},
      documentCount: await collection.countDocuments(),
    };

    // Infer field types from sampled documents
    for (const doc of docs) {
      this.inferFields(schema.fields, doc, '');
    }

    return schema;
  }

  /**
   * Recursively infer field types
   */
  private inferFields(
    fields: Record<string, MongoFieldType>,
    doc: Record<string, unknown>,
    prefix: string
  ): void {
    for (const [key, value] of Object.entries(doc)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        if (!fields[fullKey]) {
          fields[fullKey] = { types: new Set(['null']), count: 0 };
        }
        fields[fullKey].types.add('null');
      } else if (Array.isArray(value)) {
        if (!fields[fullKey]) {
          fields[fullKey] = { types: new Set(), count: 0 };
        }
        fields[fullKey].types.add('array');
        // Sample first element if array is not empty
        if (value.length > 0 && typeof value[0] === 'object') {
          this.inferFields(fields, value[0], `${fullKey}[]`);
        }
      } else if (typeof value === 'object' && value.constructor === Object) {
        if (!fields[fullKey]) {
          fields[fullKey] = { types: new Set(), count: 0 };
        }
        fields[fullKey].types.add('object');
        this.inferFields(fields, value as Record<string, unknown>, fullKey);
      } else {
        if (!fields[fullKey]) {
          fields[fullKey] = { types: new Set(), count: 0 };
        }
        fields[fullKey].types.add(typeof value);
      }
      fields[fullKey].count++;
    }
  }

  /**
   * Convert MongoDB documents to a flat tabular dataset
   */
  private documentsToDataset(docs: MongoDocument[]): Dataset {
    // Collect all unique keys
    const allKeys = new Set<string>();
    const flattenedDocs: Record<string, unknown>[] = [];

    for (const doc of docs) {
      const flattened = this.flattenDocument(doc);
      flattenedDocs.push(flattened);
      Object.keys(flattened).forEach(key => allKeys.add(key));
    }

    const headers = Array.from(allKeys).filter(h => h !== '_id');

    // Ensure all rows have all columns
    const rows = flattenedDocs.map(doc => {
      const row: Record<string, any> = {};
      for (const header of headers) {
        row[header] = doc[header] ?? null;
      }
      return row;
    });

    return { headers, rows };
  }

  /**
   * Flatten a nested document
   */
  private flattenDocument(
    doc: MongoDocument,
    prefix: string = '',
    result: Record<string, unknown> = {}
  ): Record<string, unknown> {
    for (const [key, value] of Object.entries(doc)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        result[newKey] = null;
      } else if (Array.isArray(value)) {
        // For arrays, store as JSON string or first element
        if (value.length === 0) {
          result[newKey] = null;
        } else if (typeof value[0] !== 'object') {
          // Simple array - join as string
          result[newKey] = value.join(',');
        } else {
          // Array of objects - store as JSON string
          result[newKey] = JSON.stringify(value);
        }
      } else if (typeof value === 'object' && value.constructor === Object) {
        // Recursively flatten nested objects
        this.flattenDocument(value as MongoDocument, newKey, result);
      } else if (value instanceof Date) {
        result[newKey] = value.toISOString();
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }
}

/**
 * MongoDB schema information
 */
export interface MongoSchema {
  collectionName: string;
  fields: Record<string, MongoFieldType>;
  documentCount: number;
}

export interface MongoFieldType {
  types: Set<string>;
  count: number;
}

/**
 * Validate MongoDB configuration
 */
export function validateMongoConfig(config: unknown): MongoConnectorConfig {
  if (typeof config !== 'object' || config === null) {
    throw ErrorFactory.validation('MongoDB configuration is required');
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.uri !== 'string' || cfg.uri.trim() === '') {
    throw ErrorFactory.validation('MongoDB URI is required');
  }

  if (typeof cfg.database !== 'string' || cfg.database.trim() === '') {
    throw ErrorFactory.validation('MongoDB database name is required');
  }

  return {
    type: 'mongodb',
    uri: cfg.uri as string,
    database: cfg.database as string,
    collection: (cfg.collection as string) ?? '',
    maxPoolSize: cfg.maxPoolSize as number | undefined,
    connectTimeoutMs: cfg.connectTimeoutMs as number | undefined,
    queryTimeoutMs: cfg.queryTimeoutMs as number | undefined,
  };
}

/**
 * Create a MongoDB connector
 */
export function createMongoConnector(config: MongoConnectorConfig): MongoDBConnector {
  return new MongoDBConnector(config);
}
