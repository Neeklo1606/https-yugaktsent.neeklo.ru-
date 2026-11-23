import { describe, expect, it } from 'vitest';
import { quizSummary, recommendCity } from './CityQuizLogic';

describe('recommendCity', () => {
  it('море: Анапа, при бюджете от 8 млн — Новороссийск', () => {
    expect(recommendCity({ priority: 'sea', budget: 'lt5' }).city).toBe('Анапа');
    expect(recommendCity({ priority: 'sea', budget: '5-8' }).city).toBe('Анапа');
    expect(recommendCity({ priority: 'sea', budget: '8-12' }).city).toBe('Новороссийск');
    expect(recommendCity({ priority: 'sea', budget: 'gt12' }).city).toBe('Новороссийск');
  });

  it('город — Краснодар, природа — Майкоп', () => {
    expect(recommendCity({ priority: 'city', budget: 'gt12' }).city).toBe('Краснодар');
    expect(recommendCity({ priority: 'nature', budget: 'lt5' }).city).toBe('Майкоп');
  });

  it('инвестиции зависят от бюджета', () => {
    expect(recommendCity({ priority: 'invest', budget: '5-8' }).city).toBe('Краснодар');
    expect(recommendCity({ priority: 'invest', budget: '8-12' }).city).toBe('Анапа');
  });

  it('без ответа — Анапа, и всегда есть пояснение', () => {
    const rec = recommendCity({});
    expect(rec.city).toBe('Анапа');
    expect(rec.reason.length).toBeGreaterThan(10);
  });
});

describe('quizSummary', () => {
  it('собирает ответы для комментария к заявке', () => {
    const answers = { family: '3-4', budget: '5-8', priority: 'sea', timing: '3months' };
    expect(quizSummary(answers, recommendCity(answers))).toBe(
      '3–4 чел.; 5–8 млн; Море; В течение 3 месяцев; → Анапа',
    );
  });
});
