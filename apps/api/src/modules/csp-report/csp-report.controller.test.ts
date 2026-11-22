import { describe, expect, it } from 'vitest';
import { parseCspReport } from './csp-report.controller';

describe('parseCspReport', () => {
  it('parses legacy report-uri format and drops query', () => {
    const raw = JSON.stringify({ 'csp-report': { 'document-uri': 'https://x.ru/catalog?phone=1', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/a.js' } });
    expect(parseCspReport(raw)).toEqual([{ directive: 'script-src-elem', blocked: 'https://evil.example/a.js', page: 'https://x.ru/catalog' }]);
  });
  it('parses Reporting API array', () => {
    const raw = JSON.stringify([{ body: { documentURL: 'https://x.ru/', effectiveDirective: 'img-src', blockedURL: 'http://a/b.png' } }]);
    expect(parseCspReport(raw)[0].directive).toBe('img-src');
  });
  it('ignores garbage', () => {
    expect(parseCspReport('not json')).toEqual([]);
  });
});
