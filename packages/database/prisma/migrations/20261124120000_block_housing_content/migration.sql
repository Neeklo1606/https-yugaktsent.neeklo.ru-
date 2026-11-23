-- Добавочная миграция (24.11.2026): тип жилья ЖК и редактируемое наполнение карточки
-- housing_type: flat — квартиры в ЖК, aparthotel — апартаменты / гостиничные комплексы, cottage — коттеджи и посёлки
ALTER TABLE "blocks" ADD COLUMN "housing_type" TEXT NOT NULL DEFAULT 'flat';
-- content: видео, генплан, доп. фото, частые вопросы — то, чего нет в фидах
ALTER TABLE "blocks" ADD COLUMN "content" JSONB;
CREATE INDEX "blocks_housing_type_idx" ON "blocks"("housing_type");
-- Гостиничные комплексы с «Hotel» в названии — апартаменты
UPDATE "blocks" SET "housing_type" = 'aparthotel' WHERE "name" ILIKE '%hotel%' OR "name" ILIKE '%апарт%';
