import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import LeadForm from '@/shared/components/LeadForm';
import { apiPost } from '@/lib/api';
import { PD_CONSENT_VERSION } from '@/shared/lib/privacy-consent';

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/shared/components/ResponsivenessHint', () => ({
  default: () => null,
}));

function renderLeadForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LeadForm embedded title="" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LeadForm privacy consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submit until consent is accepted', () => {
    renderLeadForm();
    const submit = screen.getByRole('button', { name: /отправить заявку/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).not.toBeDisabled();
  });

  it('shows consent error when submit attempted without checkbox', async () => {
    renderLeadForm();
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), {
      target: { value: '+7 (900) 123-45-67' },
    });

    const form = screen.getByRole('button', { name: /отправить заявку/i }).closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/согласие на обработку персональных данных/i);
    });
  });

  it('sends consent version, no query string in sourceUrl, no honeypot value', async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: 1 });
    window.history.pushState({}, '', '/catalog?phone=79001234567');
    renderLeadForm();
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), {
      target: { value: '+7 (900) 123-45-67' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: /отправить заявку/i }).closest('form')!);
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const body = vi.mocked(apiPost).mock.calls[0][1] as Record<string, unknown>;
    expect(body.consent).toBe(true);
    expect(body.consentVersion).toBe(PD_CONSENT_VERSION);
    expect(String(body.sourceUrl)).not.toContain('?');
    expect(body.website).toBeUndefined();
  });
});
