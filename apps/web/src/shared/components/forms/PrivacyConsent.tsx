import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PrivacyConsentProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  className?: string;
  /** Override auto-generated id when multiple blocks appear in one form. */
  id?: string;
};

const PrivacyConsent = ({
  checked,
  onCheckedChange,
  error,
  className,
  id: idProp,
}: PrivacyConsentProps) => {
  const autoId = useId();
  const id = idProp ?? `privacy-consent${autoId}`;
  const errorId = `${id}-error`;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          // Квадрат 16 px, а зона нажатия на телефоне — 40 px
          className="relative mt-0.5 after:absolute after:-inset-3 after:content-['']"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Label
          htmlFor={id}
          className="text-xs sm:text-sm text-neutral-500 font-normal leading-snug cursor-pointer"
        >
          Нажимая кнопку, вы соглашаетесь с{' '}
          <Link
            to="/privacy"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            политикой конфиденциальности
          </Link>
        </Label>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive pl-6" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default PrivacyConsent;
