#!/bin/bash

# Trap Ctrl+C (SIGINT) to kill both background processes gracefully when the terminal stops
trap 'echo "\nShutting down both..." && kill 0' SIGINT

echo "Starting NVE Server (Port 3001)..."
(cd server && npm run dev) &
SERVER_PID=$!

echo "Starting NVE Dashboard (Port 5173)..."
(cd dashboard && npm run dev) &
DASHBOARD_PID=$!

sleep 2

echo "=================================================="
echo " 🚀 Both Server and Dashboard are currently running!"
echo " 👉 Dashboard UI: http://localhost:5173"
echo " 👉 API Server:   http://localhost:3001"
echo "    Press Ctrl+C in this terminal to stop both."
echo "=================================================="

# Keep the script running and wait for background processes
wait
