# Self-hosting behind a reverse proxy

`docker-compose.prod.yml` runs the whole app — Postgres, the Java backend, and
the built frontend — behind a single plain-HTTP port. Put your own reverse proxy
in front of it to terminate TLS, and everything is reachable over HTTPS on 443
under one hostname.

```
              insertyourdomainhere.com:443
                            │  (your proxy: TLS + certificates)
                            ▼
                  web (nginx) :8080
                    ├── /                        static frontend
                    ├── /game                    websocket ─┐
                    ├── /ping                               ├─► backend :8080
                    ├── /new-lobby                          │
                    └── /check-login             ───────────┘
                                                       │
                                                       ▼
                                                   db :5432
```

Only `web` is published to the host. The backend and database stay on the
compose network, so the proxy is the only way in.

## Setup

```bash
cp .env.example .env      # set PUBLIC_ORIGIN and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

Then check the stack directly, before involving the proxy:

```bash
curl http://localhost:8080/healthz     # nginx itself  -> ok
curl http://localhost:8080/ping        # through to the backend
curl -I http://localhost:8080/         # the frontend   -> 200
```

If the proxy runs on the same host, set `WEB_BIND=127.0.0.1` in `.env` so the
stack is not reachable from the network except through TLS.

If the proxy runs in Docker, you can skip publishing a port entirely and put
`web` on the proxy's network instead. In `docker-compose.prod.yml`, delete the
`ports:` entry under `web` and add:

```yaml
services:
  web:
    networks: [default, proxy]

networks:
  proxy:
    external: true
```

The proxy then reaches it at `http://web:80` on that shared network.

## Proxy configuration

The one requirement is that the proxy forwards the websocket upgrade. Without
it, the page loads and lobbies are created, but joining one hangs — the browser
retries `/game` and gives up after 5 attempts.

**Nginx Proxy Manager** — create a Proxy Host for `insertyourdomainhere.com` forwarding to
`<host>:8080`, tick **Websockets Support**, and request a Let's Encrypt
certificate with **Force SSL** on.

**Caddy**

```caddy
insertyourdomainhere.com {
	reverse_proxy 127.0.0.1:8080
}
```

(Use `web:80` instead if Caddy shares the compose network, per above.)

Caddy handles websockets and certificates without any extra configuration.

**Traefik** (labels on the `web` service)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.sh.rule=Host(`insertyourdomainhere.com`)
  - traefik.http.routers.sh.entrypoints=websecure
  - traefik.http.routers.sh.tls.certresolver=letsencrypt
  - traefik.http.services.sh.loadbalancer.server.port=80
```

**nginx**

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name insertyourdomainhere.com;

    ssl_certificate     /etc/letsencrypt/live/insertyourdomainhere.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/insertyourdomainhere.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Games idle between moves; the client pings every 50s.
        proxy_read_timeout 1h;
    }
}
```

**Cloudflare Tunnel** — point the tunnel at `http://<host>:8080`. Websockets are
proxied by default.

## How the frontend finds the backend

The published site normally has the backend on a separate host, baked into the
bundle at build time (`REACT_APP_SERVER_ADDRESS` in `frontend/.env.dev`). That
does not work for a self-hosted deployment, where the hostname is not known when
the image is built.

`npm run buildSelfHosted` instead sets `REACT_APP_SAME_ORIGIN=true`, and
`frontend/src/constants/index.ts` then reads the addresses from
`window.location` in the browser:

| | Value |
| --- | --- |
| `SERVER_ADDRESS` | `window.location.host` |
| `SERVER_ADDRESS_HTTP` | `window.location.origin` |
| `WEBSOCKET_HEADER` | `wss://` over HTTPS, `ws://` otherwise |

So one image serves any hostname, upgrades to `wss://` on its own, and needs no
rebuild if the domain changes. Requests are same-origin, so CORS never applies.

`PUBLIC_ORIGIN` still sets the backend's `ALLOWED_ORIGINS`, which only matters if
something reaches the backend cross-origin.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Lobbies are backed up to Postgres on shutdown and reloaded on start, so games in
progress survive a restart. The database lives in the `db-data` volume.

## Development

`docker-compose.yml` is unchanged — it is still the hot-reloading development
stack described in [DEVELOPMENT.md](DEVELOPMENT.md), with the frontend on
[localhost:3000](http://localhost:3000) and the backend on
[localhost:4040](http://localhost:4040).
