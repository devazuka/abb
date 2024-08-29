#!/bin/sh

export NO_COLOR=true
export DISPATCHER_URL='http://localhost:9019'
/root/.deno/bin/deno serve -A --port $PORT server.js
