#!/usr/bin/env bash
# The first thing the container runs, as root: prepare /data, bring the
# database up to date, pick the Nginx setup, then hand over to the command
# -- supervisord, which runs Postgres, gunicorn and Nginx (supervisord.conf).
#
# Every step checks before it acts, so this runs on every start: the first
# one creates the database, later ones (after an upgrade) just migrate it.
set -Eeuo pipefail

DATA=/data
PGDATA=$DATA/postgres
PG_MAJOR=17
SOCKET_DIR=/run/postgresql
APP_USER=gym

log() { echo "[entrypoint] $*"; }

as() {
    local user=$1
    shift
    setpriv --reuid="$user" --regid="$user" --init-groups -- "$@"
}

manage() {
    (cd /app && as "$APP_USER" python -m django "$@")
}

# A directory in the volume, with its owner. A volume restored from another
# machine can arrive with different numeric owners, so a wrong top level
# gets fixed all the way down.
own() {
    local owner=$1 mode=$2 dir=$3
    mkdir -p "$dir"
    if [ "$(stat -c %U:%G "$dir")" != "$owner:$owner" ]; then
        chown -R "$owner:$owner" "$dir"
    fi
    chmod "$mode" "$dir"
}

prepare_volume() {
    mkdir -p "$DATA" "$DATA/backups"
    chmod 755 "$DATA"
    chown root:gymbackup "$DATA/backups"
    chmod 750 "$DATA/backups"
    find "$DATA/backups" -maxdepth 1 -type f \( -name 'gym-db-*.dump' -o -name 'gym-full-*.tar.gz' \) \
        -exec chgrp gymbackup -- {} + -exec chmod 640 -- {} +
    own postgres 700 "$PGDATA"
    own "$APP_USER" 755 "$DATA/media"
    # Django checks who is asking before serving body photos or chat media.
    # Nginx has no access to this directory.
    own "$APP_USER" 700 "$DATA/private_media"
    install -d -m 2775 -o postgres -g postgres "$SOCKET_DIR"
}

# Generated once and kept in the volume, unless SECRET_KEY is given.
# gym_backend/settings/container.py reads the same file.
ensure_secret_key() {
    local file=$DATA/secret_key
    if [ -z "${SECRET_KEY:-}" ] && [ ! -s "$file" ]; then
        log "Generating a secret key in $file"
        (umask 077 && python -c 'import secrets; print(secrets.token_urlsafe(50))' > "$file")
    fi
    if [ -e "$file" ]; then
        chown "$APP_USER:$APP_USER" "$file"
        chmod 600 "$file"
    fi
}

init_cluster() {
    if [ -s "$PGDATA/PG_VERSION" ]; then
        local version
        version=$(cat "$PGDATA/PG_VERSION")
        if [ "$version" != "$PG_MAJOR" ]; then
            log "The database in $PGDATA was made by PostgreSQL $version; this image runs $PG_MAJOR."
            log "Restore a backup into a fresh volume instead (see DEPLOY.md)."
            exit 1
        fi
        return
    fi
    log "Creating the database cluster in $PGDATA"
    as postgres initdb --pgdata="$PGDATA" --username=postgres --encoding=UTF8 \
        --locale-provider=builtin --locale=C.UTF-8 --data-checksums \
        --auth-local=peer --auth-host=reject >/dev/null
    # Unix socket only (docker/postgresql.conf), and peer authentication:
    # the OS user IS the database role, so there are no passwords.
    cat > "$PGDATA/pg_hba.conf" <<'EOF'
# TYPE  DATABASE  USER      METHOD
local   all       postgres  peer
local   gym       gym       peer
EOF
}

# The container's own settings, which come with the image.
include_pg_settings() {
    local line="include_if_exists = '/etc/gym/postgresql.conf'"
    grep -qxF "$line" "$PGDATA/postgresql.conf" || echo "$line" >> "$PGDATA/postgresql.conf"
}

pg_start_local() {
    as postgres pg_ctl --pgdata="$PGDATA" --wait --timeout=120 --silent start
}

pg_stop_local() {
    as postgres pg_ctl --pgdata="$PGDATA" --wait --timeout=120 --silent --mode=fast stop
}

# Against a server nothing else can reach yet, so no request is served
# before the schema matches the code.
migrate() {
    pg_start_local
    trap pg_stop_local EXIT

    as postgres psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --host="$SOCKET_DIR" --dbname=postgres <<'EOF'
SELECT 'CREATE ROLE gym LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gym')\gexec
SELECT 'CREATE DATABASE gym OWNER gym' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gym')\gexec
EOF

    log "Applying database migrations"
    manage migrate --noinput
    manage createcachetable

    if [ -n "${ADMIN_USERNAME:-}" ]; then
        manage ensure_admin --username="$ADMIN_USERNAME" --national-id="${ADMIN_NATIONAL_ID:-}"
    elif ! manage shell -c 'from apps.accounts.models import User
raise SystemExit(0 if User.objects.filter(role="admin").exists() else 1)'; then
        log "There's no admin account yet. Set ADMIN_USERNAME, ADMIN_NATIONAL_ID and"
        log "ADMIN_PASSWORD and restart, or run: docker exec -it gym manage ensure_admin --help"
    fi

    pg_stop_local
    trap - EXIT
}

# Nginx must let through the largest upload Django accepts in each API
# location, plus room for the rest of the form.
upload_limits_mb() {
    manage shell -c 'import math
from django.conf import settings
from apps.chat.models import MAX_CHAT_ATTACHMENT_BYTES
move_limit_mb = max(cap["max"] for cap in settings.MEDIA_SIZE_LIMITS_MB.values())
chat_limit_mb = MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)
print(math.ceil(move_limit_mb) + 10, math.ceil(chat_limit_mb) + 10)'
}

# The server blocks are fixed files (docker/nginx/); what varies between
# deployments goes in included files.
configure_nginx() {
    local cert=${TLS_CERT:-/certs/fullchain.pem}
    local key=${TLS_KEY:-/certs/privkey.pem}
    local site=http limits max_mb chat_max_mb
    limits=$(upload_limits_mb)
    read -r max_mb chat_max_mb <<< "$limits"
    printf 'client_max_body_size %sm;\n' "$chat_max_mb" > /etc/nginx/gym/chat-upload.conf

    if [ -r "$cert" ] && [ -r "$key" ]; then
        site=https
    elif [ -e "$cert" ] || [ -e "$key" ]; then
        log "Found only one of $cert and $key, or can't read it: staying on plain http."
    fi

    {
        echo "client_max_body_size ${max_mb}m;"
        if [ -n "${TRUSTED_PROXIES:-}" ]; then
            # A proxy or CDN in front: take its word for the visitor's
            # address and scheme -- but only when it's the one talking.
            local ranges=${TRUSTED_PROXIES//,/ } range
            for range in $ranges; do
                echo "set_real_ip_from $range;"
            done
            echo 'real_ip_header X-Forwarded-For;'
            echo 'real_ip_recursive on;'
            echo 'geo $realip_remote_addr $via_trusted_proxy {'
            echo '    default 0;'
            for range in $ranges; do
                echo "    $range 1;"
            done
            echo '}'
            echo 'map "$via_trusted_proxy:$http_x_forwarded_proto" $forwarded_proto {'
            echo '    default $scheme;'
            echo '    "1:https" https;'
            echo '    "1:http" http;'
            echo '}'
        else
            echo 'map $scheme $forwarded_proto { default $scheme; }'
        fi
        if [ "$site" = https ]; then
            echo "ssl_certificate $cert;"
            echo "ssl_certificate_key $key;"
        fi
    } > /etc/nginx/gym/runtime.conf

    ln -sfn "/etc/nginx/gym/site-$site.conf" /etc/nginx/conf.d/gym.conf
    if [ "$site" = https ]; then
        log "Serving https with $cert"
        export HTTPS=${HTTPS:-true}
    else
        log "Serving plain http (no certificate at $cert)"
    fi
    nginx -t -q
}

rm -f /run/gym-started  # the health check waits for it (docker/bin/healthcheck)
prepare_volume
ensure_secret_key
init_cluster
include_pg_settings
migrate
configure_nginx

log "Starting services"
touch /run/gym-started
exec "$@"
