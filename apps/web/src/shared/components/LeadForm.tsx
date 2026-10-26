import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import PrivacyConsent from '@/shared/components/forms/PrivacyConsent';
import { validatePrivacyConsent } from '@/shared/lib/privacy-consent';
import {
  conversionObsFormError,
  conversionObsFormSubmit,
  conversionObsFormSuccess,
} from '@/redesign/lib/conversion-observability';
import ResponsivenessHint from '@/shared/components/ResponsivenessHint';

type PublicRequestType =
  | 'CONSULTATION'
  | 'MORTGAGE'
  | 'CALLBACK'
  | 'SELECTION'
  | 'CONTACT';

interface Props {
  title?: string;
  /** Короткая метка для комментария (страница / сценарий). */
  source?: string;
  /** Доп. строки в комментарий к заявке (например параметры калькулятора). */
  contextFooter?: string;
  className?: string;
  requestType?: PublicRequestType;
  blockId?: number;
  listingId?: number;
  /** Без карточки и заголовка — для вложения в модалку с собственным `DialogTitle`. */
  embedded?: boolean;
  /** Подпись кнопки отправки; по умолчанию «Отправить заявку». */
  submitLabel?: string;
  /** Called after successful API submission (real backend success only). */
  onSuccess?: () => void;
}

function formatPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let core = digits;
  if (core.startsWith('8')) core = `7${core.slice(1)}`;
  if (!core.startsWith('7')) core = `7${core}`;
  core = core.slice(0, 11);

  const p1 = core.slice(1, 4);
  const p2 = core.slice(4, 7);
  const p3 = core.slice(7, 9);
  const p4 = core.slice(9, 11);

  let out = '+7';
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ')';
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function normalizePhoneForApi(masked: string): string {
  const digits = masked.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  return masked.trim();
}

const BUYER_TOKEN_KEY = 'lg_inquiry_threads';

type StoredInquiry = { requestId?: number; buyerToken: string; createdAt: string };

function persistBuyerToken(buyerToken: string, requestId?: number) {
  try {
    const raw = localStorage.getItem(BUYER_TOKEN_KEY);
    const list: StoredInquiry[] = raw ? (JSON.parse(raw) as StoredInquiry[]) : [];
    list.unshift({ buyerToken, requestId, createdAt: new Date().toISOString() });
    localStorage.setItem(BUYER_TOKEN_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore storage errors */
  }
}

function inferRequestType(source?: string): PublicRequestType {
  if (source === 'mortgage') return 'MORTGAGE';
  if (source === 'contacts') return 'CONTACT';
  return 'CONSULTATION';
}

const LeadForm = ({
  title = 'Получить консультацию',
  source = 'lead_form',
  contextFooter,
  className = '',
  requestType: requestTypeProp,
  blockId,
  listingId,
  embedded = false,
  submitLabel,
  onSuccess,
}: Props) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateNote, setDuplicateNote] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const consentErr = validatePrivacyConsent(consentAccepted);
    if (consentErr) {
      setConsentError(consentErr);
      return;
    }
    setConsentError(null);
    const normalizedPhone = normalizePhoneForApi(phone);
    const digits = normalizedPhone.replace(/\D/g, '');
    if (!name.trim() || digits.length < 11) return;
    setLoading(true);
    setError('');
    conversionObsFormSubmit();
    const type = requestTypeProp ?? inferRequestType(source);
    const commentPayload =
      [
        comment.trim(),
        source && source !== 'lead_form' ? `Источник формы: ${source}` : '',
        contextFooter?.trim(),
      ]
        .filter(Boolean)
        .join('\n\n') || undefined;
    try {
      const res = await apiPost<{
        id?: number;
        buyerToken?: string;
        duplicateWarning?: { recentRequestId: number; messageRu: string };
      }>('/requests', {
        name: name.trim(),
        phone: normalizedPhone,
        type,
        comment: commentPayload,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        ...(blockId != null ? { blockId } : {}),
        ...(listingId != null ? { listingId } : {}),
      });
      if (res?.buyerToken) {
        persistBuyerToken(res.buyerToken, res.id);
      }
      void queryClient.invalidateQueries({ queryKey: ['requests', 'me'] });
      conversionObsFormSuccess();
      setDuplicateNote(res?.duplicateWarning?.messageRu ?? null);
      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      let msg = 'Не удалось отправить заявку. Попробуйте позже.';
      if (err instanceof ApiError) {
        try {
          const j = JSON.parse(err.message) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          if (err.message) msg = err.message;
        }
      }
      setError(msg);
      conversionObsFormError();
    } finally {
      setLoading(false);
    }
  };

  const shell = (inner: ReactNode) =>
    embedded ? (
      <div className={className}>{inner}</div>
    ) : (
      <div className={`bg-card border border-border rounded-xl p-6 sm:p-8 ${className}`}>{inner}</div>
    );

  if (submitted) {
    return shell(
      <div className="text-center py-2">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="font-bold text-lg mb-1">Спасибо!</h3>
        <p className="text-sm text-muted-foreground">Менеджер свяжется с вами в рабочее время</p>
        {duplicateNote ? (
          <p className="text-xs text-warning mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2">
            {duplicateNote}
          </p>
        ) : null}
      </div>,
    );
  }

  return shell(
    <>
      {title ? <h3 className="font-bold text-lg mb-4">{title}</h3> : null}
      <ResponsivenessHint className="mb-4" />
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          placeholder="Имя"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="h-11"
        />
        <Input
          type="tel"
          placeholder="Телефон"
          value={phone}
          onChange={e => setPhone(formatPhoneMask(e.target.value))}
          required
          className="h-11"
        />
        <Textarea
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
        />
        <PrivacyConsent
          checked={consentAccepted}
          onCheckedChange={(next) => {
            setConsentAccepted(next);
            if (next) setConsentError(null);
          }}
          error={consentError}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full h-11" disabled={loading || !consentAccepted}>
          {loading ? 'Отправка…' : submitLabel ?? 'Отправить заявку'}
        </Button>
      </form>
    </>,
  );
};

export default LeadForm;
