import { describe, expect, it } from 'vitest';
import { validateWebhookUrl } from './lead-webhook.service';

describe('validateWebhookUrl', () => {
  it('принимает внешний https', () => {
    expect(validateWebhookUrl('https://example.amocrm.ru/api/v4/leads/hook?token=x').ok).toBe(true);
    expect(validateWebhookUrl('https://hook.eu1.make.com/abc').ok).toBe(true);
  });
  it('отклоняет http, мусор и внутренние адреса', () => {
    for (const u of ['http://example.com', 'nope', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/', 'https://192.168.1.1/', 'https://172.20.0.1/', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://db.internal/']) {
      expect(validateWebhookUrl(u).ok, u).toBe(false);
    }
  });
});
