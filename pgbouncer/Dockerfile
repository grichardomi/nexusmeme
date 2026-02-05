FROM pgbouncer/pgbouncer:1.21.0

# Install bash for entrypoint script
USER root
RUN apk add --no-cache bash

# Copy configuration
COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# PgBouncer runs on port 6432
EXPOSE 6432

# Switch back to pgbouncer user
USER pgbouncer

ENTRYPOINT ["/docker-entrypoint.sh"]
