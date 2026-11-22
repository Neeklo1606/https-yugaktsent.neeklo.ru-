import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { RefreshDto } from './tokens.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const meta = { type: 'body' as const, metatype: RefreshDto, data: '' };

describe('RefreshDto under global ValidationPipe', () => {
  it('accepts refreshToken (раньше — 400 и выход из админки)', async () => {
    const out = (await pipe.transform({ refreshToken: 'a.b.c' }, meta)) as RefreshDto;
    expect(out.refreshToken).toBe('a.b.c');
  });
  it('rejects empty token', async () => {
    await expect(pipe.transform({ refreshToken: '' }, meta)).rejects.toBeTruthy();
  });
});
