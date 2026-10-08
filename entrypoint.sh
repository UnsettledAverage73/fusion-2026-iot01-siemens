#!/bin/bash
set -e

echo "=== [Sovereign Industrial System Starting] ==="

# 1. Start local Redis daemon
echo "Starting Redis server..."
redis-server --daemonize yes || echo "Redis already running or using external REDIS_HOST"

# 2. Ensure data directory exists
mkdir -p /app/data

# 3. Start Sovereign IoT Background Ingestor Daemon
echo "Starting Sovereign IoT Ingestor Daemon..."
python -m src.data.iot_ingestor &

# 4. Start FastAPI application on Render assigned PORT
APP_PORT="${PORT:-8000}"
echo "Starting Uvicorn ASGI server on port ${APP_PORT}..."
exec uvicorn src.api:app --host 0.0.0.0 --port "${APP_PORT}"
