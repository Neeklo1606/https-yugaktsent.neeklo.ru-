import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

const FEED_USER_AGENT = 'YugAktsent-FeedImporter/1.0 (backend; server-side-only)';

export interface AboutEntry {
  name: string;
  description: string;
  url: string;
  scope: string;
  exported_at: string;
}

@Injectable()
export class FeedFetcherService {
  private readonly logger = new Logger(FeedFetcherService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchAbout(regionCode: string): Promise<AboutEntry[]> {
    const localPath = this.getLocalPath(regionCode, 'about.json');
    if (localPath) {
      this.logger.log(`Loading about from local: ${localPath}`);
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }

    const baseUrl = this.config.get<string>(
      'TRENDAGENT_BASE_URL',
      'https://dataout.trendagent.ru',
    );
    const url = `${baseUrl}/${regionCode}/about.json`;
    this.logger.log(`Fetching about: ${url}`);
    return this.fetchJson(url);
  }

  /** @returns массив объектов из JSON-фида TrendAgent */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- динамическая структура фидов
  async fetchFeedFile<T = any[]>(url: string): Promise<T> {
    const localPath = this.urlToLocalPath(url);
    if (localPath) {
      this.logger.log(`Loading from local: ${localPath}`);
      return JSON.parse(fs.readFileSync(localPath, 'utf8')) as T;
    }

    this.assertHttpFetchAllowed();
    this.logger.log(`Fetching feed: ${url}`);
    return this.fetchJson(url);
  }

  /** Только подсчёт записей в JSON-массиве фида (для forensic-отчёта). */
  async countFeedArrayEntries(url: string): Promise<{ count: number; source: 'local' | 'remote' }> {
    const data = await this.fetchFeedFile<unknown[]>(url);
    return {
      count: Array.isArray(data) ? data.length : 0,
      source: this.urlToLocalPath(url) ? 'local' : 'remote',
    };
  }

  /**
   * HTTP-запросы к TrendAgent разрешены только на backend-сервере с whitelist IP.
   * FEED_HTTP_FETCH_ALLOWED=true обязателен для production HTTP (локально — FEED_LOCAL_DIR).
   */
  private assertHttpFetchAllowed(): void {
    if (this.config.get('FEED_LOCAL_DIR')) return;
    const allowed = this.config.get<string>('FEED_HTTP_FETCH_ALLOWED');
    if (allowed === 'true' || allowed === '1') return;
    throw new ForbiddenException(
      'HTTP fetch to TrendAgent disabled. Set FEED_HTTP_FETCH_ALLOWED=true on backend server or use FEED_LOCAL_DIR.',
    );
  }

  private getLocalPath(regionCode: string, filename: string): string | null {
    const feedDir = this.config.get<string>('FEED_LOCAL_DIR');
    if (!feedDir) return null;
    const filePath = path.join(feedDir, regionCode, filename);
    return fs.existsSync(filePath) ? filePath : null;
  }

  private urlToLocalPath(url: string): string | null {
    const feedDir = this.config.get<string>('FEED_LOCAL_DIR');
    if (!feedDir) return null;

    // Extract region/filename from URL like https://dataout.trendagent.ru/msk/blocks.json
    const match = url.match(/\/([a-z]+)\/([a-z]+\.json)$/i);
    if (!match) return null;

    const filePath = path.join(feedDir, match[1], match[2]);
    return fs.existsSync(filePath) ? filePath : null;
  }

  private async fetchJson<T>(url: string, retries = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(300_000),
          headers: { 'User-Agent': FEED_USER_AGENT, Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as T;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Attempt ${attempt}/${retries} failed for ${url}: ${msg}`);
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    throw new Error('Unreachable');
  }
}
