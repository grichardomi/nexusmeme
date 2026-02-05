#!/bin/bash
set -e

# Generate userlist.txt from environment variables
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Error: POSTGRES_USER and POSTGRES_PASSWORD must be set"
  exit 1
fi

# Generate MD5 hash: md5(password + username)
HASH=$(echo -n "${POSTGRES_PASSWORD}${POSTGRES_USER}" | md5sum | cut -d' ' -f1)
echo "\"${POSTGRES_USER}\" \"md5${HASH}\"" > /etc/pgbouncer/userlist.txt

echo "PgBouncer starting with:"
echo "  Database: ${POSTGRES_DB}"
echo "  Host: ${POSTGRES_HOST}"
echo "  Port: ${POSTGRES_PORT}"
echo "  User: ${POSTGRES_USER}"
echo "  Pool mode: transaction"
echo "  Max client connections: 1000"
echo "  Default pool size: 25"

# Start PgBouncer
exec /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini
