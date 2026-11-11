-- Добавочная миграция: доказательство согласия на обработку ПД и метки источника заявки
ALTER TABLE "requests" ADD COLUMN "consent_version" TEXT;
ALTER TABLE "requests" ADD COLUMN "consent_at" TIMESTAMP(3);
ALTER TABLE "requests" ADD COLUMN "utm" JSONB;
