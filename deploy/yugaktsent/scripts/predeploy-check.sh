#!/usr/bin/env bash
# Проверки перед выкладкой ЮгАкцента — одной командой, локально (не на сервере).
#   bash deploy/yugaktsent/scripts/predeploy-check.sh          # тесты и типы
#   QA=1 bash deploy/yugaktsent/scripts/predeploy-check.sh     # + браузерная проверка прода на 5 ширинах
# Выход ≠ 0, если что-то упало. Типы сайта: не больше базового числа ошибок (старые типы ymaps).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB_TSC_BASELINE="${WEB_TSC_BASELINE:-440}"
fail=0
step() { printf '\n▶ %s\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1"; fail=1; }

step "Сайт: типы"
n=$(cd "$ROOT/apps/web" && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS")
if [ "$n" -le "$WEB_TSC_BASELINE" ]; then ok "ошибок $n (база $WEB_TSC_BASELINE)"; else bad "ошибок $n > базы $WEB_TSC_BASELINE — новые ошибки типов"; fi

step "Сайт: тесты"
out=$(cd "$ROOT/apps/web" && npx vitest run 2>&1)
if [ $? -eq 0 ]; then ok "$(echo "$out" | grep -E '^ +Tests' | xargs)"; else echo "$out" | tail -30; bad "тесты сайта"; fi

step "API: тесты"
out=$(cd "$ROOT/apps/api" && "$ROOT/node_modules/.pnpm/node_modules/.bin/vitest" run 2>&1)
if [ $? -eq 0 ]; then ok "$(echo "$out" | grep -E '^ +Tests' | xargs)"; else echo "$out" | tail -30; bad "тесты API"; fi

step "Синхронизация фидов: тесты"
out=$(cd "$ROOT/deploy/yugaktsent/profitbase-sync" && node --test src/*.test.mjs 2>&1)
if [ $? -eq 0 ]; then ok "$(echo "$out" | grep -E '^# (pass|fail) ' | tr '\n' ' ')"; else echo "$out" | tail -30; bad "тесты синхронизации"; fi

if [ "${QA:-0}" = "1" ]; then
  step "Браузерная проверка (${QA_BASE:-прод})"
  if (cd "$ROOT" && QA_CHROME="${QA_CHROME:-chrome}" QA_WIDTHS="${QA_WIDTHS:-320,375,768,1280,1920}" node deploy/yugaktsent/qa/browser-qa.mjs); then ok "вёрстка"; else bad "браузерная проверка"; fi
fi

echo
if [ "$fail" -eq 0 ]; then echo "Готово к выкладке."; else echo "Есть ошибки — не выкладывать."; fi
exit "$fail"
