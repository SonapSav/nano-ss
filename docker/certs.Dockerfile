# One-off tool: creates the local certificate authority and the server
# certificate with mkcert (D-013). Output goes to the mounted /certs folder.
FROM debian:trixie-20261005-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends mkcert \
 && rm -rf /var/lib/apt/lists/*

ENV CAROOT=/certs/ca

# CERT_HOSTS is a space-separated list, so it is split on purpose.
ENTRYPOINT ["sh", "-c", "mkdir -p \"$CAROOT\" && mkcert -cert-file /certs/server.crt -key-file /certs/server.key $CERT_HOSTS"]
