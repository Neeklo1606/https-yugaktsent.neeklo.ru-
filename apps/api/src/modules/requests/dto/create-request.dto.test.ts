import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateRequestDto } from './create-request.dto';

const ok = { name: 'Иван', phone: '+7 (900) 123-45-67', consent: true, consentVersion: '2026-11-11' };

function errors(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateRequestDto, body);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

describe('CreateRequestDto (публичная форма заявки)', () => {
  it('принимает корректную заявку с согласием', () => {
    expect(errors(ok)).toEqual([]);
    expect(errors({ ...ok, phone: '89001234567', utmSource: 'yandex' })).toEqual([]);
  });
  it('отклоняет пустую заявку', () => {
    expect(errors({})).toEqual(expect.arrayContaining(['name', 'phone', 'consent', 'consentVersion']));
  });
  it('без согласия заявка не принимается', () => {
    expect(errors({ ...ok, consent: false })).toContain('consent');
    const { consent: _c, ...noConsent } = ok;
    expect(errors(noConsent)).toContain('consent');
  });
  it('нероссийский или короткий номер не проходит', () => {
    expect(errors({ ...ok, phone: '+1 555 123 4567' })).toContain('phone');
    expect(errors({ ...ok, phone: '+7 900 12' })).toContain('phone');
    expect(errors({ ...ok, phone: '<script>' })).toContain('phone');
  });
  it('ограничивает длину полей', () => {
    expect(errors({ ...ok, name: 'a'.repeat(101) })).toContain('name');
    expect(errors({ ...ok, comment: 'x'.repeat(4001) })).toContain('comment');
    expect(errors({ ...ok, name: ' ' })).toContain('name');
  });
  it('не принимает лишние поля (status, assignedTo)', () => {
    expect(errors({ ...ok, status: 'WON' })).toContain('status');
    expect(errors({ ...ok, assignedTo: 'x' })).toContain('assignedTo');
  });
});
