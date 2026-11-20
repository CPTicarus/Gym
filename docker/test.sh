#!/usr/bin/env bash
# The test suite as the image build runs it (the Dockerfile's test stage):
# against the compiled modules, on Postgres like the server -- the same
# suite only ever runs on SQLite during development.
set -Eeuo pipefail

export PGDATA=/tmp/pg DATA_DIR=/tmp/test-data SECRET_KEY=only-for-tests

as() {
    local user=$1
    shift
    setpriv --reuid="$user" --regid="$user" --init-groups -- "$@"
}

install -d -m 700 -o postgres -g postgres "$PGDATA"
install -d -m 2775 -o postgres -g postgres /run/postgresql
install -d -o gym -g gym "$DATA_DIR"

as postgres initdb --pgdata="$PGDATA" --username=postgres --encoding=UTF8 \
    --locale-provider=builtin --locale=C.UTF-8 --auth-local=peer --auth-host=reject >/dev/null
echo "include_if_exists = '/etc/gym/postgresql.conf'" >> "$PGDATA/postgresql.conf"
# The server's own log goes to a file, leaving the report to the tests.
as postgres pg_ctl --pgdata="$PGDATA" --wait --silent --log=/tmp/postgres.log -o "-c fsync=off" start
trap 'as postgres pg_ctl --pgdata="$PGDATA" --wait --silent --mode=immediate stop' EXIT

# The test runner makes its own database, test_gym, hence CREATEDB -- which
# the role never gets on a real install.
as postgres psql --no-psqlrc --quiet --host=/run/postgresql --dbname=postgres \
    --command="CREATE ROLE gym LOGIN CREATEDB"

cd /app
as gym python -m django test apps --noinput
