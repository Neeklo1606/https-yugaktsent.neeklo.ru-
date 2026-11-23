import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildNewsCoverImagePrompt, stripHtmlForImagePrompt } from './news-image-prompt';

describe('news-image-prompt', () => {
  it('strips HTML', () => {
    assert.equal(stripHtmlForImagePrompt('<p>Текст <b>жирный</b></p>'), 'Текст жирный');
  });

  it('includes title and body in prompt', () => {
    const p = buildNewsCoverImagePrompt({
      title: 'Старт продаж ЖК',
      body: 'В Москве открылся новый корпус',
    });
    assert.ok(p.includes('Старт продаж'));
    assert.ok(p.includes('Москве'));
    assert.ok(p.includes('Без текста'));
  });

  it('uses fallback when empty', () => {
    const p = buildNewsCoverImagePrompt({});
    assert.ok(p.includes('новостройки'));
  });
});
