FROM heroiclabs/nakama:3.22.0

COPY ./data/modules /nakama/data/modules
COPY ./local.yml /nakama/data/local.yml

ENTRYPOINT ["/bin/sh", "-ec"]

CMD exec /nakama/nakama migrate up --database.address "$DATABASE_ADDRESS" && \
exec /nakama/nakama \
--name nakama1 \
--database.address "$DATABASE_ADDRESS" \
--logger.level INFO \
--session.token_expiry_sec 7200 \
--socket.server_key "$NAKAMA_SERVER_KEY"
