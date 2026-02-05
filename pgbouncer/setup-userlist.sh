#!/bin/bash
# Generate userlist.txt from environment variables
# PgBouncer requires MD5 hash in format: "username" "md5<hash>"

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Error: POSTGRES_USER and POSTGRES_PASSWORD must be set"
  exit 1
fi

# Generate MD5 hash: md5(password + username)
HASH=$(echo -n "${POSTGRES_PASSWORD}${POSTGRES_USER}" | md5sum | cut -d' ' -f1)

# Write userlist.txt
echo "\"${POSTGRES_USER}\" \"md5${HASH}\"" > /etc/pgbouncer/userlist.txt

echo "Generated userlist.txt for user: ${POSTGRES_USER}"
cat /etc/pgbouncer/userlist.txt
