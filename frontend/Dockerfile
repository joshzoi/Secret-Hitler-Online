# Builds the static frontend, then serves it with nginx, which also forwards the
# backend's routes so the whole app is reachable on one origin.

FROM node:18 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# buildSelfHosted sets REACT_APP_SAME_ORIGIN, so the bundle talks to whatever
# hostname it is served from rather than one baked in at build time.
RUN npm run buildSelfHosted

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
