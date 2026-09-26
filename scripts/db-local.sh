#!/usr/bin/env bash
#
# A throwaway local Postgres for validating supabase/migrations/*.sql and
# supabase/seed.sql against a REAL server — no Docker, no Supabase project, no
# cost. Everything lives under a scratch directory and is deleted with `clean`.
#
#   bash scripts/db-local.sh start    # initdb (once), start, create the db,
#                                     # print the connection URL
#   bash scripts/db-local.sh url      # print the URL only
#   bash scripts/db-local.sh psql     # open an interactive shell on it
#   bash scripts/db-local.sh stop     # stop the server
#   bash scripts/db-local.sh clean    # stop and delete the data directory
#
# Then:
#
#   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
#
# `tests/integration/schema.test.ts` applies every migration in filename order,
# loads the seed, and asserts row counts, RLS coverage, three RLS spot checks
# and the hold_funds → settle_hold money path. Without LOCAL_PG_URL that suite
# skips itself, so `npm run test` stays hermetic.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${LOCAL_PG_PORT:-54329}"
DB="${LOCAL_PG_DB:-agentdistrict}"
USER_NAME="postgres"

# Keep the cluster out of the repository: it is scratch state, not source.
SCRATCH="${LOCAL_PG_SCRATCH:-${TMPDIR:-/tmp}/agentdistrict-localpg}"
PGDATA="$SCRATCH/pgdata"
LOGFILE="$SCRATCH/pgdata.log"

# A Unix socket path is capped at 107 bytes (`sun_path`), and a scratch
# directory keyed by session id blows straight through that — Postgres refuses
# to start with "Unix-domain socket path is too long". Everything here connects
# over TCP on 127.0.0.1 anyway, so the socket directory just needs to be short.
SOCKET_DIR="${LOCAL_PG_SOCKET_DIR:-/tmp/ad-pgsock-$PORT}"

URL="postgresql://${USER_NAME}@127.0.0.1:${PORT}/${DB}"

die() { printf 'db-local: %s\n' "$1" >&2; exit 1; }

# Postgres refuses to run as root. In a container that starts as root (this
# sandbox does) every server-side command is re-run as the unprivileged
# `postgres` system account; as any other user we run them directly.
PG_RUNAS="${LOCAL_PG_RUNAS:-postgres}"

as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    su -s /bin/sh "$PG_RUNAS" -c "$1"
  else
    sh -c "$1"
  fi
}

own_scratch() {
  [ "$(id -u)" -eq 0 ] || return 0
  chown -R "$PG_RUNAS" "$SCRATCH" 2>/dev/null || true
  # The data directory must also be *reachable*: a scratch path under /tmp is
  # often 0700 root the whole way down, which `postgres` cannot traverse.
  dir="$SCRATCH"
  while [ "$dir" != "/" ] && [ -n "$dir" ]; do
    chmod o+x "$dir" 2>/dev/null || true
    dir="$(dirname "$dir")"
  done
}

require_binaries() {
  [ -x "$PGBIN/initdb" ] || die "no initdb at $PGBIN (set PGBIN)"
  [ -x "$PGBIN/pg_ctl" ] || die "no pg_ctl at $PGBIN (set PGBIN)"
}

is_running() {
  [ -d "$PGDATA" ] && as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1
}

cmd_start() {
  require_binaries
  mkdir -p "$SCRATCH" "$SOCKET_DIR"

  own_scratch
  if [ "$(id -u)" -eq 0 ]; then chown "$PG_RUNAS" "$SOCKET_DIR" 2>/dev/null || true; fi
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "db-local: initdb → $PGDATA"
    rm -rf "$PGDATA"
    # `--auth=trust` is safe here and only here: the server listens on loopback
    # only and holds nothing but throwaway validation data.
    as_pg "'$PGBIN/initdb' -D '$PGDATA' -U '$USER_NAME' --auth=trust --encoding=UTF8 --locale=C" >/dev/null
    own_scratch
  fi

  if is_running; then
    echo "db-local: already running on port $PORT"
  else
    echo "db-local: starting on port $PORT"
    as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$LOGFILE' -w -o '-c listen_addresses=127.0.0.1 -p $PORT -k $SOCKET_DIR' start" >/dev/null
  fi

  if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -tAc \
      "select 1 from pg_database where datname = '$DB'" | grep -q 1; then
    echo "db-local: creating database $DB"
    "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" "$DB"
  fi

  echo "$URL"
}

cmd_stop() {
  require_binaries
  # Re-assert the traversal bits first. The sandbox resets `/tmp/<scratch root>`
  # to 0700 root between commands, and then `pg_ctl status` as `postgres` fails
  # with "Permission denied" — which reads as "not running" and leaves a live
  # cluster behind. Measured, not hypothetical.
  own_scratch
  if is_running; then
    as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -w -m fast stop" >/dev/null
    echo "db-local: stopped"
  else
    echo "db-local: not running"
  fi
}

case "${1:-start}" in
  start) cmd_start ;;
  stop)  cmd_stop ;;
  url)   echo "$URL" ;;
  psql)  exec "$PGBIN/psql" "$URL" ;;
  clean) cmd_stop || true; rm -rf "$PGDATA" "$SOCKET_DIR" "$LOGFILE"; echo "db-local: cleaned" ;;
  *)     die "unknown command '${1}' (start | stop | url | psql | clean)" ;;
esac
