#!/bin/sh
# Applies pending migrations, then starts the API as PID 1's child (signals reach Node via `exec`).
set -e
node_modules/.bin/prisma migrate deploy
exec node dist/main.js
