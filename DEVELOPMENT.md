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

## Playing a test game

A game needs five players and the server has no bots, so trying a real game by
hand would mean five browser sessions. `fill-lobby` opens the rest of them: each
placeholder joins over a websocket like any other client and plays the first
legal move it is offered. It does not try to play well -- it is there so the game
keeps moving.

Create a lobby in the browser, then, in a second terminal:

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

Follow these instructions if you are only making changes to the frontend. These instructions will allow you to connect to the development server rather than needing to run the instance locally.

### Running frontend server

Open a terminal window and run the following commands to clone the project and set up the frontend dependencies:

```bash
git clone git@github.com:joshzoi/Secret-Hitler-Online.git
cd Secret-Hitler-Online/frontend

npm install
npm run devServer
```

The webpage should open automatically in your browser, but is usually hosted at [localhost:3000](http://localhost:3000).

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
