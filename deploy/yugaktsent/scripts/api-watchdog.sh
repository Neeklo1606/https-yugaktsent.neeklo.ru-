#!/bin/bash
# Сторож API ЮгАкцент. Запускается таймером yugaktsent-api-watchdog.timer раз в минуту.
#
# systemd перезапускает API, только если процесс упал. 19.11 API завис (зациклился расчёт шахматки):
# процесс жив, но не отвечает — systemd этого не видит. Сторож:
#   1. проверяет /api/v1/health и лёгкий запрос к базе (ЖК) напрямую на 127.0.0.1;
#   2. после FAIL_LIMIT неудач подряд перезапускает yugaktsent-api (не чаще MAX_RESTARTS за 30 мин);
#   3. проверяет сайт снаружи через nginx (https) — только сообщает, не перезапускает;
#   4. предупреждает, если диск заполнен больше DISK_LIMIT %;
#   5. пишет в Telegram, если задан /etc/yugaktsent/monitor.env (TG_BOT_TOKEN, TG_CHAT_ID),
#      и в лог /var/log/yugaktsent-lg/watchdog.log в любом случае.
#
# Переменные для проверки без вреда: WATCHDOG_HEALTH_URL, WATCHDOG_DRY_RESTART=1, WATCHDOG_STATE_DIR.
set -uo pipefail

[ -f /etc/yugaktsent/monitor.env ] && . /etc/yugaktsent/monitor.env

API="${WATCHDOG_API_BASE:-http://127.0.0.1:3025/api/v1}"
HEALTH_URL="${WATCHDOG_HEALTH_URL:-$API/health}"
DB_URL="${WATCHDOG_DB_URL:-$API/blocks?per_page=1&page=1}"
PUBLIC_URL="${WATCHDOG_PUBLIC_URL:-https://yugaktsent.neeklo.ru/api/v1/health}"
SERVICE="${WATCHDOG_SERVICE:-yugaktsent-api}"
FAIL_LIMIT="${WATCHDOG_FAIL_LIMIT:-2}"
MAX_RESTARTS="${WATCHDOG_MAX_RESTARTS:-3}"
DISK_LIMIT="${WATCHDOG_DISK_LIMIT:-90}"
STATE_DIR="${WATCHDOG_STATE_DIR:-/var/lib/yugaktsent-watchdog}"
HOST_LABEL="${WATCHDOG_LABEL:-yugaktsent.neeklo.ru}"

mkdir -p "$STATE_DIR"
FAILS_FILE="$STATE_DIR/fails"
RESTARTS_FILE="$STATE_DIR/restarts"      # unix-время перезапусков, по строке
ALERTED_FILE="$STATE_DIR/alerted"        # есть — мы сообщали о проблеме, ждём восстановления
PUBLIC_ALERTED_FILE="$STATE_DIR/public_alerted"
DISK_ALERTED_FILE="$STATE_DIR/disk_alerted"

now() { date +%s; }
log() { echo "$(date '+%F %T') $*"; }

notify() {
  local text="[$HOST_LABEL] $1"
  log "TG: $1"
  [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] || return 0
  curl -sS -m 10 -o /dev/null "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" || log "TG: не отправлено"
}

# check URL TIMEOUT NEEDLE → 0 если ответ 200 и содержит NEEDLE; в REPLY — краткое описание
check() {
  local url="$1" timeout="$2" needle="$3" out code t
  out=$(curl -s -m "$timeout" -w '\n%{http_code} %{time_total}' "$url" 2>/dev/null)
  code=$(tail -n1 <<<"$out" | cut -d' ' -f1)
  t=$(tail -n1 <<<"$out" | cut -d' ' -f2)
  if [ "$code" = "200" ] && grep -q "$needle" <<<"$out"; then
    REPLY="200 за ${t}с"
    return 0
  fi
  [ -z "$code" ] || [ "$code" = "000" ] && REPLY="нет ответа за ${timeout}с" || REPLY="код $code за ${t}с"
  return 1
}

recent_restarts() {
  local since=$(( $(now) - 1800 ))
  [ -f "$RESTARTS_FILE" ] || { echo 0; return; }
  awk -v s="$since" '$1 >= s' "$RESTARTS_FILE" > "$RESTARTS_FILE.tmp" && mv "$RESTARTS_FILE.tmp" "$RESTARTS_FILE"
  wc -l < "$RESTARTS_FILE" | tr -d ' '
}

diagnostics() {
  local pid
  pid=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    log "диагностика: $(ps -o pid=,pcpu=,rss=,etime= -p "$pid" 2>/dev/null | awk '{printf "pid %s, CPU %s%%, память %d МБ, работает %s", $1, $2, $3/1024, $4}')"
  fi
  tail -n 5 /var/log/yugaktsent-lg/api-error.log 2>/dev/null | sed 's/^/  api-error: /'
}

# ── 1. API напрямую ──
problem=""
if ! check "$HEALTH_URL" 10 '"status":"ok"'; then
  problem="health: $REPLY"
elif ! check "$DB_URL" 15 '"data"'; then
  problem="запрос к базе (ЖК): $REPLY"
fi

if [ -z "$problem" ]; then
  if [ -f "$ALERTED_FILE" ]; then
    notify "✅ API снова отвечает ($REPLY)."
    rm -f "$ALERTED_FILE"
  fi
  echo 0 > "$FAILS_FILE"
else
  fails=$(( $(cat "$FAILS_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$fails" > "$FAILS_FILE"
  log "сбой $fails/$FAIL_LIMIT — $problem"
  if [ "$fails" -ge "$FAIL_LIMIT" ]; then
    diagnostics
    n=$(recent_restarts)
    if [ "$n" -ge "$MAX_RESTARTS" ]; then
      if [ ! -f "$ALERTED_FILE" ] || [ "$(cat "$ALERTED_FILE")" != "gave-up" ]; then
        notify "🔴 API не отвечает ($problem). Уже $n перезапуска за 30 мин — больше не перезапускаю, нужен человек."
        echo gave-up > "$ALERTED_FILE"
      fi
    else
      echo "$(now)" >> "$RESTARTS_FILE"
      if [ "${WATCHDOG_DRY_RESTART:-0}" = "1" ]; then
        log "DRY: systemctl restart $SERVICE"
      else
        systemctl restart "$SERVICE"
      fi
      ok=""
      for _ in 1 2 3 4 5 6; do
        sleep 5
        if check "$HEALTH_URL" 10 '"status":"ok"'; then ok=1; break; fi
      done
      if [ -n "$ok" ]; then
        notify "🟠 API не отвечал ($problem) — перезапустил, работает ($REPLY)."
        rm -f "$ALERTED_FILE"
        echo 0 > "$FAILS_FILE"
      else
        notify "🔴 API не отвечал ($problem), перезапуск не помог ($REPLY)."
        echo restarted > "$ALERTED_FILE"
      fi
    fi
  fi
fi

# ── 2. Снаружи через nginx (только сообщаем) ──
if [ -z "$problem" ]; then
  if check "$PUBLIC_URL" 15 '"status":"ok"'; then
    rm -f "$PUBLIC_ALERTED_FILE.count"
    [ -f "$PUBLIC_ALERTED_FILE" ] && { notify "✅ Сайт снаружи снова доступен."; rm -f "$PUBLIC_ALERTED_FILE"; }
  else
    pf=$(( $(cat "$PUBLIC_ALERTED_FILE.count" 2>/dev/null || echo 0) + 1 ))
    echo "$pf" > "$PUBLIC_ALERTED_FILE.count"
    log "снаружи сбой $pf — $REPLY"
    if [ "$pf" -ge 3 ] && [ ! -f "$PUBLIC_ALERTED_FILE" ]; then
      notify "🟠 API на сервере работает, но снаружи (nginx/https) не отвечает: $REPLY."
      touch "$PUBLIC_ALERTED_FILE"
    fi
  fi
fi

# ── 3. Диск ──
used=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ -n "$used" ] && [ "$used" -ge "$DISK_LIMIT" ]; then
  if [ ! -f "$DISK_ALERTED_FILE" ] || [ $(( $(now) - $(cat "$DISK_ALERTED_FILE") )) -ge 21600 ]; then
    notify "💾 Диск заполнен на ${used}% (порог ${DISK_LIMIT}%)."
    now > "$DISK_ALERTED_FILE"
  fi
elif [ -f "$DISK_ALERTED_FILE" ]; then
  rm -f "$DISK_ALERTED_FILE"
fi

exit 0
