/**
 * REST API Connector for ChurnGuard AI
 * Fetches data from REST APIs with pagination support
 */

import type { APIConfig, Dataset } from '@shared/types';
import { AppError, ErrorFactory, withRetry, logError } from '../error-handler';

/**
 * Extended API connector configuration
 */
export interface APIConnectorConfig extends APIConfig {
  timeout?: number;
  maxRetries?: number;
  maxRecords?: number;
  dataPath?: string; // JSONPath to data array in response
}

/**
 * API response wrapper
 */
interface APIResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number;
}

/**
 * Pagination state
 */
interface PaginationState {
  type: 'offset' | 'page' | 'cursor' | 'none';
  currentOffset: number;
  currentPage: number;
  cursor: string | null;
  hasMore: boolean;
}

/**
 * REST API Connector
 */
export class APIConnector {
  private config: APIConnectorConfig;

  constructor(config: APIConnectorConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      maxRecords: 100000,
      ...config,
    };
  }

  /**
   * Fetch data from the API
   */
  async fetchData(): Promise<Dataset> {
    const allData: Record<string, unknown>[] = [];
    let pagination: PaginationState = this.initPagination();

    do {
      const response = await this.fetchPage(pagination);
      const records = this.extractRecords(response.data);
      
      allData.push(...records);

      // Update pagination state
      pagination = this.updatePagination(pagination, response);

      // Check limits
      if (allData.length >= this.config.maxRecords!) {
        break;
      }

      // Safety limit
      if (allData.length > 100000) {
        console.warn('API connector reached 100,000 record limit');
        break;
      }

    } while (pagination.hasMore);

    if (allData.length === 0) {
      return { headers: [], rows: [] };
    }

    // Infer headers from all records
    const headerSet = new Set<string>();
    allData.forEach(record => {
      Object.keys(record).forEach(key => headerSet.add(key));
    });

    return {
      headers: Array.from(headerSet),
      rows: allData.slice(0, this.config.maxRecords) as Record<string, any>[],
    };
  }

  /**
   * Fetch a single page of data
   */
  private async fetchPage(pagination: PaginationState): Promise<APIResponse> {
    const url = this.buildUrl(pagination);
    const headers = this.buildHeaders();

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
          const response = await fetch(url, {
            method: this.config.method,
            headers,
            signal: controller.signal,
            body: this.config.method === 'POST' ? JSON.stringify({}) : undefined,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new AppError(
              `API request failed with status ${response.status}`,
              'API_ERROR',
              'network',
              response.status,
              {
                recoverable: response.status >= 500 || response.status === 429,
                details: { url, status: response.status },
              }
            );
          }

          const data = await response.json();
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          return { data, headers: responseHeaders, status: response.status };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof AppError) throw error;
          throw ErrorFactory.network(
            `API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error instanceof Error ? error : undefined
          );
        }
      },
      {
        maxRetries: this.config.maxRetries!,
        delayMs: 1000,
        shouldRetry: (error) => {
          if (error instanceof AppError) {
            return error.recoverable;
          }
          return true;
        },
      }
    );
  }

  /**
   * Build URL with pagination parameters
   */
  private buildUrl(pagination: PaginationState): string {
    const url = new URL(this.config.url);

    if (this.config.pagination) {
      const pg = this.config.pagination;

      switch (pg.type) {
        case 'offset':
          url.searchParams.set(pg.limitParam, '1000');
          if (pg.offsetParam) {
            url.searchParams.set(pg.offsetParam, String(pagination.currentOffset));
          }
          break;

        case 'page':
          url.searchParams.set(pg.limitParam, '1000');
          if (pg.pageParam) {
            url.searchParams.set(pg.pageParam, String(pagination.currentPage));
          }
          break;

        case 'cursor':
          url.searchParams.set(pg.limitParam, '1000');
          if (pagination.cursor && pg.cursorParam) {
            url.searchParams.set(pg.cursorParam, pagination.cursor);
          }
          break;
      }
    }

    return url.toString();
  }

  /**
   * Build request headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.config.headers,
    };

    switch (this.config.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${this.config.authToken}`;
        break;
      case 'api_key':
        headers['X-API-Key'] = this.config.authToken!;
        break;
    }

    return headers;
  }

  /**
   * Initialize pagination state
   */
  private initPagination(): PaginationState {
    if (!this.config.pagination) {
      return {
        type: 'none',
        currentOffset: 0,
        currentPage: 1,
        cursor: null,
        hasMore: false,
      };
    }

    return {
      type: this.config.pagination.type,
      currentOffset: 0,
      currentPage: 1,
      cursor: null,
      hasMore: true,
    };
  }

  /**
   * Update pagination state based on response
   */
  private updatePagination(state: PaginationState, response: APIResponse): PaginationState {
    if (!this.config.pagination) {
      return { ...state, hasMore: false };
    }

    const pg = this.config.pagination;
    const records = this.extractRecords(response.data);

    // Check if we got less than requested - indicates end
    if (records.length < 1000) {
      return { ...state, hasMore: false };
    }

    switch (state.type) {
      case 'offset':
        return {
          ...state,
          currentOffset: state.currentOffset + records.length,
          hasMore: records.length > 0,
        };

      case 'page':
        return {
          ...state,
          currentPage: state.currentPage + 1,
          hasMore: records.length > 0,
        };

      case 'cursor':
        // Extract cursor from response
        let nextCursor: string | null = null;
        if (pg.cursorPath) {
          const cursorValue = this.getNestedValue(response.data, pg.cursorPath);
          nextCursor = cursorValue ? String(cursorValue) : null;
        }
        return {
          ...state,
          cursor: nextCursor,
          hasMore: nextCursor !== null,
        };

      default:
        return { ...state, hasMore: false };
    }
  }

  /**
   * Extract records from API response
   */
  private extractRecords(data: unknown): Record<string, unknown>[] {
    if (!data) return [];

    // If dataPath is specified, use it
    if (this.config.dataPath) {
      const extracted = this.getNestedValue(data, this.config.dataPath);
      if (Array.isArray(extracted)) {
        return extracted.filter(item => typeof item === 'object' && item !== null);
      }
      return [];
    }

    // Auto-detect data array
    if (Array.isArray(data)) {
      return data.filter(item => typeof item === 'object' && item !== null);
    }

    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;

      // Common patterns
      const arrayKeys = ['data', 'items', 'records', 'results', 'rows'];
      for (const key of arrayKeys) {
        if (Array.isArray(obj[key])) {
          return (obj[key] as unknown[]).filter(
            item => typeof item === 'object' && item !== null
          ) as Record<string, unknown>[];
        }
      }
    }

    return [];
  }

  /**
   * Get nested value from object using dot notation path
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      
      // Handle array index notation
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)?.[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)?.[part];
      }
    }

    return current;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; recordCount?: number }> {
    try {
      const pagination = this.initPagination();
      pagination.hasMore = false; // Only fetch first page for test
      
      const response = await this.fetchPage(pagination);
      const records = this.extractRecords(response.data);

      return {
        success: true,
        message: `Successfully connected. Found ${records.length} records in first page.`,
        recordCount: records.length,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

/**
 * Validate API configuration
 */
export function validateAPIConfig(config: unknown): APIConnectorConfig {
  if (typeof config !== 'object' || config === null) {
    throw ErrorFactory.validation('API configuration is required');
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.url !== 'string' || cfg.url.trim() === '') {
    throw ErrorFactory.validation('API URL is required');
  }

  try {
    new URL(cfg.url);
  } catch {
    throw ErrorFactory.validation('Invalid API URL format');
  }

  if (cfg.method && !['GET', 'POST'].includes(cfg.method as string)) {
    throw ErrorFactory.validation('API method must be GET or POST');
  }

  return {
    url: cfg.url as string,
    method: (cfg.method as 'GET' | 'POST') ?? 'GET',
    headers: cfg.headers as Record<string, string> | undefined,
    authType: cfg.authType as 'none' | 'bearer' | 'basic' | 'api_key' | undefined,
    authToken: cfg.authToken as string | undefined,
    pagination: cfg.pagination as APIConfig['pagination'] | undefined,
    timeout: cfg.timeout as number | undefined,
    maxRetries: cfg.maxRetries as number | undefined,
    maxRecords: cfg.maxRecords as number | undefined,
    dataPath: cfg.dataPath as string | undefined,
  };
}

/**
 * Create an API connector
 */
export function createAPIConnector(config: APIConnectorConfig): APIConnector {
  return new APIConnector(config);
}
