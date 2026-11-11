import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyConsent from '@/shared/components/forms/PrivacyConsent';

import type { PrivacyConsentProps } from '@/shared/components/forms/PrivacyConsent';

function renderConsent(props: Partial<PrivacyConsentProps> = {}) {
  const onCheckedChange = vi.fn();
  render(
    <MemoryRouter>
      <PrivacyConsent
        checked={false}
        onCheckedChange={onCheckedChange}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onCheckedChange };
}

describe('PrivacyConsent', () => {
  it('links to the separate consent text and to the policy', () => {
    renderConsent();
    const consent = screen.getByRole('link', { name: /согласие на обработку персональных данных/i });
    expect(consent).toHaveAttribute('href', '/personal-data-consent');
    expect(consent).toHaveAttribute('target', '_blank');
    const policy = screen.getByRole('link', { name: /политикой обработки персональных данных/i });
    expect(policy).toHaveAttribute('href', '/privacy');
    expect(policy).toHaveAttribute('rel', 'noreferrer');
  });

  it('is not pre-checked', () => {
    renderConsent();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('shows validation error when provided', () => {
    renderConsent({ error: 'Подтвердите согласие' });
    expect(screen.getByRole('alert')).toHaveTextContent('Подтвердите согласие');
  });

  it('calls onCheckedChange when checkbox toggled', () => {
    const { onCheckedChange } = renderConsent();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
