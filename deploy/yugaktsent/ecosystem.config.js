/** PM2 ecosystem for yugaktsent.neeklo.ru — no TrendAgent feed worker. */
const fs = require('fs');
const path = require('path');

const deployRoot = process.env.DEPLOY_ROOT || '/var/www/yugaktsent-lg';

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fileEnv = parseDotEnv(path.join(deployRoot, '.env'));
const pick = (key, fallback = '') =>
  fileEnv[key] || process.env[key] || fallback;

const publicSiteUrl = pick('PUBLIC_SITE_URL', 'https://yugaktsent.neeklo.ru');
const apiPort = pick('API_PORT', '3025');

if (!pick('DATABASE_URL')) {
  console.warn(
    `[yugaktsent/ecosystem] WARN: DATABASE_URL missing in ${deployRoot}/.env`,
  );
}

// Учётка синхронизации задаётся только в .env: значений по умолчанию
// здесь быть не должно — раньше тут лежал рабочий пароль.
for (const key of ['LG_ADMIN_EMAIL', 'LG_ADMIN_PASSWORD']) {
  if (!pick(key)) {
    console.warn(
      `[yugaktsent/ecosystem] WARN: ${key} missing in ${deployRoot}/.env — синхронизация Profitbase не сможет авторизоваться`,
    );
  }
}

const sharedEnv = {
  PUBLIC_SITE_URL: publicSiteUrl,
  NODE_ENV: 'production',
  DATABASE_URL: pick('DATABASE_URL'),
  REDIS_URL: pick('REDIS_URL', 'redis://127.0.0.1:6379'),
  TRENDAGENT_BASE_URL: '',
  TRENDAGENT_DEFAULT_REGION: '',
  TRENDAGENT_REGIONS: '',
  FEED_IMPORT_DISABLE_REPEAT: 'true',
  FEED_IMPORT_PROCESSOR_ENABLED: 'false',
  FEED_HTTP_FETCH_ALLOWED: 'false',
  MEDIA_ROOT: pick('MEDIA_ROOT', '/srv/yugaktsent-lg/uploads'),
};

const pm2Common = {
  autorestart: true,
  max_restarts: 100,
  min_uptime: '10s',
  restart_delay: 4000,
  kill_timeout: 10000,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      name: 'yugaktsent-lg-api',
      cwd: `${deployRoot}/apps/api`,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...sharedEnv,
        API_PORT: apiPort,
        API_PREFIX: pick('API_PREFIX', '/api/v1'),
        JWT_ACCESS_SECRET: pick('JWT_ACCESS_SECRET'),
        JWT_REFRESH_SECRET: pick('JWT_REFRESH_SECRET'),
        TELEGRAM_NEWS_AUTO_SYNC_DISABLE: 'true',
        LISTINGS_EXPIRE_DISABLE: 'true',
        SITEMAP_OUTPUT_DIR: pick(
          'SITEMAP_OUTPUT_DIR',
          `${deployRoot}/apps/api/sitemaps`,
        ),
        CORS_ORIGINS: pick(
          'CORS_ORIGINS',
          'https://yugaktsent.neeklo.ru,http://localhost:5173',
        ),
        AI_SETTINGS_ENCRYPTION_KEY: pick('AI_SETTINGS_ENCRYPTION_KEY'),
      },
      max_memory_restart: '1G',
      error_file: '/var/log/yugaktsent-lg/api-error.log',
      out_file: '/var/log/yugaktsent-lg/api-out.log',
      ...pm2Common,
    },
    {
      name: 'yugaktsent-profitbase-sync',
      cwd: `${deployRoot}/deploy/yugaktsent/profitbase-sync`,
      script: 'src/index.js',
      args: '--watch-cron',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        LG_API_BASE: pick('LG_API_BASE', `http://127.0.0.1:${apiPort}/api/v1`),
        LG_ADMIN_EMAIL: pick('LG_ADMIN_EMAIL'),
        LG_ADMIN_PASSWORD: pick('LG_ADMIN_PASSWORD'),
        FEEDS_JSON: pick('FEEDS_JSON'),
        CRON_SCHEDULE: pick('PROFITBASE_CRON', '0 */6 * * *'),
        FEED_SKIP_MEDIA: pick('FEED_SKIP_MEDIA', 'false'),
        STATE_FILE: pick(
          'PROFITBASE_STATE_FILE',
          `${deployRoot}/deploy/yugaktsent/profitbase-sync/state.json`,
        ),
        // Та же папка, что раздаёт API: синхронизация проверяет, лежит ли уже
        // скачанная планировка на диске, и не качает её повторно
        MEDIA_ROOT: pick('MEDIA_ROOT', '/srv/yugaktsent-lg/uploads'),
      },
      max_memory_restart: '512M',
      error_file: '/var/log/yugaktsent-lg/profitbase-sync-error.log',
      out_file: '/var/log/yugaktsent-lg/profitbase-sync-out.log',
      ...pm2Common,
    },
  ],
};
