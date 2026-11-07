# ЮгАкцент — деплой

Полный план переезда на новый сервер: [`docs/MIGRATION_PLAN_2026-11.md`](../../docs/MIGRATION_PLAN_2026-11.md).

## Стек на сервере

| Что | Где |
|---|---|
| Код | `/var/www/yugaktsent-lg` (git clone, ветка `main`) |
| Фронт (статика + пререндер) | `apps/web/dist`, раздаёт nginx |
| API (NestJS) | systemd `yugaktsent-api`, `127.0.0.1:3025` |
| Синхронизация Profitbase | systemd `yugaktsent-profitbase-sync` (cron внутри, раз в 6 ч + опрос админки раз в 2 мин) |
| БД | PostgreSQL 16 + PostGIS, база и пользователь `yugaktsent_lg` |
| Кэш | Redis `127.0.0.1:6379` |
| Медиа | `/srv/yugaktsent-lg/uploads` |
| Окружение | `.env` в корне проекта → `/etc/yugaktsent/*.env` (собирает `scripts/write-systemd-env.mjs`) |
| nginx | `nginx/site.conf.template` + `nginx/yugaktsent-http.conf`, ставит `scripts/install-nginx.sh` |
| Логи | `/var/log/yugaktsent-lg/` |
| Бэкап БД | cron 03:30 → `/root/db-backups` + копия вне сервера (`/etc/yugaktsent/backup.env`) |

## Новый сервер с нуля (Ubuntu 22.04/24.04, root)

DNS A-запись домена уже должна указывать на сервер — нужна для сертификата.

**1. Deploy-ключ** (репозиторий приватный, серверу нужен доступ только на чтение):

```bash
ssh-keygen -t ed25519 -N '' -C "yugaktsent-deploy@$(hostname)" -f /root/.ssh/id_ed25519
ssh-keyscan github.com >> /root/.ssh/known_hosts
cat /root/.ssh/id_ed25519.pub
```

Публичный ключ → GitHub, репозиторий → Settings → Deploy keys → Add deploy key, **без** «Allow write access». Проверка: `ssh -T git@github.com` → «successfully authenticated».

**2. Установка:**

```bash
export SITE_DOMAIN=yugaktsent.neeklo.ru CERTBOT_EMAIL=you@example.com
git clone git@github.com:letoceiling-coder/https-yugaktsent.neeklo.ru-.git /var/www/yugaktsent-lg
bash /var/www/yugaktsent-lg/deploy/yugaktsent/provision-server.sh
```

`provision-server.sh` → пакеты, Postgres, Node 22, swap, ufw, cron бэкапа → `bootstrap-server.sh` (БД, `.env` с новыми секретами и паролем админа) → `deploy-full.sh`.

## Обновление

```bash
cd /var/www/yugaktsent-lg && git pull --ff-only origin main && bash deploy/yugaktsent/deploy-full.sh
```

`deploy-full.sh` сам выставляет флаги прод-сборки (`VITE_IMAGE_PROXY=1`, `VITE_IMAGE_PROXY_LOCAL=1`, `VITE_ADMIN_DEMO_EDITING=1`, бренд, регион) и ставит nginx из шаблона под домен из `PUBLIC_SITE_URL`.

## Смена домена

Поменять домен в `.env` (`PUBLIC_SITE_URL`, `CORS_ORIGINS`), выпустить сертификат (`install-nginx.sh` сделает это сам при `CERTBOT_EMAIL`), запустить `deploy-full.sh`. Домен в `index.html`, `robots.txt`, `sitemap.xml` переписывается в сборке автоматически.
