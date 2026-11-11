import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Privacy from '@/pages/Privacy';

vi.mock('@/redesign/components/RedesignHeader', () => ({ default: () => null }));
vi.mock('@/components/FooterSection', () => ({ default: () => null }));

// Страница берёт бренд и контакты оператора из настроек сайта — нужен QueryClient
function renderPrivacy() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Privacy page', () => {
  it('renders policy heading', () => {
    renderPrivacy();
    expect(
      screen.getByRole('heading', { level: 1, name: /политика обработки персональных данных/i }),
    ).toBeInTheDocument();
  });

  it('does not mention the reference brand', () => {
    renderPrivacy();
    expect(document.body.textContent).not.toMatch(/livegrid|лайвгрид/i);
  });
});
