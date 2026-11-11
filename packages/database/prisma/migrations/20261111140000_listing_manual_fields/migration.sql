-- Добавочная миграция: поля, закреплённые менеджером вручную
ALTER TABLE "listings" ADD COLUMN "manual_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
