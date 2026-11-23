/**
 * Квиз «подбор города»: вопросы и рекомендация считаются на месте, без запросов.
 * Города — те, что есть в каталоге: Анапа, Новороссийск, Краснодар, Майкоп.
 */

export type QuizCity = 'Анапа' | 'Новороссийск' | 'Краснодар' | 'Майкоп';

export type QuizOption = { value: string; label: string };
export type QuizQuestion = { id: 'family' | 'budget' | 'priority' | 'timing'; title: string; options: QuizOption[] };

export const CITY_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'family',
    title: 'Сколько вас?',
    options: [
      { value: '1-2', label: '1–2 чел.' },
      { value: '3-4', label: '3–4 чел.' },
      { value: '5+', label: '5 и больше' },
    ],
  },
  {
    id: 'budget',
    title: 'Бюджет на покупку',
    options: [
      { value: 'lt5', label: 'до 5 млн' },
      { value: '5-8', label: '5–8 млн' },
      { value: '8-12', label: '8–12 млн' },
      { value: 'gt12', label: 'от 12 млн' },
    ],
  },
  {
    id: 'priority',
    title: 'Что важнее?',
    options: [
      { value: 'sea', label: 'Море' },
      { value: 'city', label: 'Город и работа' },
      { value: 'nature', label: 'Природа и горы' },
      { value: 'invest', label: 'Инвестиции' },
    ],
  },
  {
    id: 'timing',
    title: 'Когда планируете покупку?',
    options: [
      { value: 'month', label: 'В ближайший месяц' },
      { value: '3months', label: 'В течение 3 месяцев' },
      { value: 'looking', label: 'Пока присматриваюсь' },
    ],
  },
];

export type QuizAnswers = Partial<Record<QuizQuestion['id'], string>>;

export type CityRecommendation = { city: QuizCity; reason: string };

const BIG_BUDGET = new Set(['8-12', 'gt12']);

export function recommendCity(answers: QuizAnswers): CityRecommendation {
  const big = BIG_BUDGET.has(answers.budget ?? '');
  const family = answers.family === '3-4' || answers.family === '5+';
  switch (answers.priority) {
    case 'sea':
      return big
        ? { city: 'Новороссийск', reason: 'Море рядом и большой город: работа, школы и жизнь круглый год.' }
        : {
            city: 'Анапа',
            reason: family
              ? 'Песчаные пляжи и мелкое море — удобно с детьми, новостройки в доступном бюджете.'
              : 'Курорт у моря с песчаными пляжами и новостройками в доступном бюджете.',
          };
    case 'city':
      return { city: 'Краснодар', reason: 'Крупнейший город юга: работа, вузы, клиники, большой выбор новостроек.' };
    case 'nature':
      return { city: 'Майкоп', reason: 'Спокойный зелёный город у гор Адыгеи с доступными ценами на жильё.' };
    case 'invest':
      return big
        ? { city: 'Анапа', reason: 'Спрос на курортную аренду и на квартиры у моря.' }
        : { city: 'Краснодар', reason: 'Растущий город с высоким спросом на аренду при умеренном входе.' };
    default:
      return { city: 'Анапа', reason: 'Самый популярный город у моря среди наших покупателей.' };
  }
}

/** Ответы одной строкой для комментария к заявке: «3–4 чел.; 5–8 млн; Море; 3 месяца; → Анапа» */
export function quizSummary(answers: QuizAnswers, rec: CityRecommendation): string {
  const parts = CITY_QUIZ_QUESTIONS.map((q) => q.options.find((o) => o.value === answers[q.id])?.label).filter(Boolean);
  return [...parts, `→ ${rec.city}`].join('; ');
}
