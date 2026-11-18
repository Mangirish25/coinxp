#!/bin/sh
set -eu
npm run db:backup --workspace server
npm run db:migrate --workspace server
exec node server/src/server.js
