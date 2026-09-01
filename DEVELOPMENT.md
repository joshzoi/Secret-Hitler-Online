# Development setup for Secret Hitler Online

## Quick start using Docker:
- Run everything with Docker Compose (DB + backend + frontend):
  - `docker compose up --build`
  - Open frontend: [http://localhost:3000](http://localhost:3000)
  - Backend health: [http://localhost:4040/ping](http://localhost:4040/ping)
- Alternative: only DB in Docker, run app locally:
  - `docker compose up -d db`  (or use docker run …)
  - `export DATABASE_URL=postgres://secret:secret@localhost:5432/secrethitler`
  - In backend/: `./gradlew runLocal`
  - In frontend/: `npm install && npm run devLocal`
  - Open frontend: [http://localhost:3000](http://localhost:3000)

To run the app for real rather than for development — one hostname, HTTPS,
behind your own reverse proxy — see [SELF_HOSTING.md](SELF_HOSTING.md).

Your setup will vary depending on if you're only making changes to the frontend, or if you're making changes to the frontend and the backend at once.

## Signing in during development

Signing in is the only way to play, and Slack will not redirect back to a
`localhost` address, so the server offers `/auth/dev-login` instead. It exists
only when `DEBUG_MODE` is set, and signs you in as whoever you ask for:

```
http://localhost:3000/auth/dev-login?name=Joshua%20Favetti
```

Open that in a browser and you are signed in for the rest of the session. Add
`&avatar=<url>` to check how a profile picture renders.

One browser is one player now, so testing with several people means several
browser profiles or private windows rather than several tabs -- a second tab
takes the seat over from the first, exactly as it would if you opened the game on
your phone.

If you want to exercise a real Slack round trip, put an HTTPS tunnel in front of
the dev server (`cloudflared tunnel --url http://localhost:3000`), add its address
as a Redirect URL on your Slack app, and set `PUBLIC_ORIGIN` to it.

## Playing a test game

A game needs five players and the server has no bots, so trying a real game by
hand would mean five browser sessions. `fill-lobby` opens the rest of them: each
placeholder joins over a websocket like any other client and plays the first
legal move it is offered. It does not try to play well -- it is there so the game
keeps moving.

Each placeholder signs itself in through `/auth/dev-login`, so this only works
against a development server. Create a lobby in the browser, then, in a second
terminal:

```bash
cd frontend
npm run fillLobby -- ABCD        # four placeholders join lobby ABCD
npm run fillLobby -- ABCD 2      # or just two
```

Press START GAME in the browser once they appear. Ctrl-C makes them leave the
lobby, freeing their seats immediately.

It talks to `ws://127.0.0.1:4040` by default; pass `--server ws://host:port` for
anything else.

## Frontend Only

There used to be a `devServer` script that pointed a local frontend at the shared
development backend. That cannot work now: the session lives in a cookie, and a
cookie set by one host is not sent to another. Signing in is the only way to play,
so a frontend without a backend it shares an origin with cannot get past the
sign-in screen.

Run the backend locally instead, as below. The dev server proxies it
(`frontend/src/setupProxy.js`), so everything is served from
[localhost:3000](http://localhost:3000) and the app exercises the same
single-origin path it uses in production.

## Changing frontend + backend

If you're modifying the backend, you'll need to run the server locally. You'll need two terminal windows to run the frontend and backend.

### Running backend server

In your first terminal, clone the repo if you haven't yet. Navigate to the `backend` subdirectory, then use gradle to start the server.

```bash
git clone git@github.com:joshzoi/Secret-Hitler-Online.git
cd Secret-Hitler-Online/backend

./gradlew runLocal
```

This will start the backend server at [`http://localhost:4040`](http://localhost:4040) by default. This will also set the server in debug-mode, so the CORS policy will not block access from the frontend.

**Every time you make changes to Java files, you'll need to stop and restart the development server.**

You can also run the backend-server using your preferred IDE by launching the Main-method in `ApplicationTest` found in the test directory.

### Running frontend server

Open another terminal at the root of the project, and run the following commands.

```bash
cd frontend

npm install
npm run devLocal
```

Note: You may need to modify `.env.local` based on the address your dev server is mounted to. By default, `.env.local` is configured to use `localhost:4040`.
