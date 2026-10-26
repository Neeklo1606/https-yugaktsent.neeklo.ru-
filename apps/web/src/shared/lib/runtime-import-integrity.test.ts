import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAZY_ROUTE_REGISTRY, RUNTIME_HOOK_REGISTRY } from '@/shared/lib/route-registry';

/** Card-visual symbols that must never be used as implicit globals (Iter 84). */
const CARD_VISUAL_EXPORTS = ['cardVisual', 'cardBadgeClass', 'metaDotLine'] as const;

describe('runtime import integrity', () => {
  it('ListingCard imports card-visual helpers it uses', () => {
    const src = readFileSync(resolve(__dirname, '../../redesign/components/ListingCard.tsx'), 'utf8');
    expect(src).toMatch(/from\s+['"]@\/redesign\/lib\/card-visual['"]/);
    // Карточка на токенах дизайн-системы может не использовать эти хелперы вовсе;
    // но если символ встречается в коде, он обязан быть импортирован, а не взят «из воздуха»
    const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s+['"]@\/redesign\/lib\/card-visual['"]/)?.[1] ?? '';
    for (const sym of CARD_VISUAL_EXPORTS) {
      const used = new RegExp(`\\b${sym}\\b`).test(src.replace(importLine, ''));
      if (used) expect(importLine).toMatch(new RegExp(`\\b${sym}\\b`));
    }
  });

  it('card-visual module exports runtime symbols', async () => {
    const mod = await import('@/redesign/lib/card-visual');
    for (const sym of CARD_VISUAL_EXPORTS) {
      expect(mod[sym], sym).toBeDefined();
    }
  });
  it('App.tsx imports auth symbols from canonical hook module', () => {
    const appSrc = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(appSrc).toMatch(/import\s*\{[^}]*useAuthState[^}]*\}\s*from\s*['"]@\/shared\/hooks\/useAuth['"]/);
    expect(appSrc).toMatch(/import\s*\{[^}]*AuthProvider[^}]*\}\s*from\s*['"]@\/shared\/hooks\/useAuth['"]/);
    expect(appSrc).toMatch(/import\s*\{[^}]*useAuth[^}]*\}\s*from\s*['"]@\/shared\/hooks\/useAuth['"]/);
  });

  for (const hook of RUNTIME_HOOK_REGISTRY) {
    describe(hook.path, () => {
      for (const exportName of hook.exports) {
        it(`exports ${exportName}`, async () => {
          const mod = await import(hook.path);
          expect(mod[exportName], `${exportName} must be defined`).toBeDefined();
          expect(typeof mod[exportName]).not.toBe('undefined');
        });
      }
    });
  }

  for (const route of LAZY_ROUTE_REGISTRY) {
    it(
      `lazy module ${route.id} has default export`,
      async () => {
        const mod = await import(route.path);
        expect(mod.default, `${route.path} default export`).toBeDefined();
      },
      30_000,
    );
  }
});
