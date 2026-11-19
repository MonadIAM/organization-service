#!/bin/sh
set -eu

export POSTGRES_PASSWORD
export POSTGRES_USER

wait_for_secret() {
    path="$1"
    i=0

    until [ -s "$path" ]; do
        i=$((i + 1))
        if [ "$i" -ge 60 ]; then
            echo "Timed out waiting for $path" >&2
            exit 1
        fi
        sleep 1
    done
}

wait_for_secret /vault/secrets/postgresql_username
wait_for_secret /vault/secrets/postgresql_password

POSTGRES_PASSWORD="$(cat /vault/secrets/postgresql_password)"
POSTGRES_USER="$(cat /vault/secrets/postgresql_username)"

exec "$@"
