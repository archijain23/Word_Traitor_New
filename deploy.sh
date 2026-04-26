#!/bin/bash

# ============================================
# 🎭 WORD TRAITOR — DEPLOY SCRIPT (ngrok)
# One tunnel: backend serves frontend too
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "  ██╗    ██╗ ██████╗ ██████╗ ██████╗      "
echo "  ██║    ██║██╔═══██╗██╔══██╗██╔══██╗     "
echo "  ██║ █╗ ██║██║   ██║██████╔╝██║  ██║     "
echo "  ██║███╗██║██║   ██║██╔══██╗██║  ██║     "
echo "  ╚███╔███╔╝╚██████╔╝██║  ██║██████╔╝     "
echo "   ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝      "
echo "  ████████╗██████╗  █████╗ ██╗████████╗ ██████╗ ██████╗ "
echo "  ╚══██╔══╝██╔══██╗██╔══██╗██║╚══██╔══╝██╔═══██╗██╔══██╗"
echo "     ██║   ██████╔╝███████║██║   ██║   ██║   ██║██████╔╝"
echo "     ██║   ██╔══██╗██╔══██║██║   ██║   ██║   ██║██╔══██╗"
echo "     ██║   ██║  ██║██║  ██║██║   ██║   ╚██████╔╝██║  ██║"
echo "     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "${BOLD}🎭 Word Traitor — Remote Deploy (ngrok)${NC}"
echo -e "${CYAN}────────────────────────────────────────${NC}"

# --- CLEANUP HELPER ---
cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID 2>/dev/null || true
  kill $NGROK_PID 2>/dev/null || true
  rm -f word-traitor/.env.local
  rm -f server/.env
  echo -e "${GREEN}✅ All processes stopped. Bye! 👋${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# --- CHECK DEPENDENCIES ---
echo -e "\n${YELLOW}[1/5] Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found.${NC}"
  exit 1
fi

if ! command -v ngrok &> /dev/null; then
  echo -e "${RED}❌ ngrok not found. Run: sudo snap install ngrok${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All dependencies found${NC}"

# --- PULL LATEST CODE ---
echo -e "\n${YELLOW}[2/5] Pulling latest code from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code up to date${NC}"

# --- KILL ANYTHING ON PORT 5001 ---
echo -e "\n${YELLOW}Freeing port 5001...${NC}"
fuser -k 5001/tcp 2>/dev/null || true
pkill ngrok 2>/dev/null || true
sleep 1
echo -e "${GREEN}✅ Port 5001 free${NC}"

# --- START NGROK FIRST (get URL before build) ---
echo -e "\n${YELLOW}[3/5] Starting ngrok tunnel on port 5001...${NC}"
ngrok http 5001 --log=stdout > /tmp/ngrok_word_traitor.log 2>&1 &
NGROK_PID=$!

echo "Waiting for ngrok to initialize..."
sleep 4

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)['tunnels']
for t in tunnels:
    if t['proto'] == 'https':
        print(t['public_url'])
        break
" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
  echo -e "${RED}❌ Failed to get ngrok URL.${NC}"
  echo "Make sure you've added your authtoken: ngrok config add-authtoken YOUR_TOKEN"
  kill $NGROK_PID 2>/dev/null || true
  exit 1
fi

echo -e "${GREEN}✅ ngrok tunnel active: ${CYAN}${NGROK_URL}${NC}"

# --- BUILD FRONTEND with ngrok URL baked in ---
echo -e "\n${YELLOW}[4/5] Building frontend (backend = ${NGROK_URL})...${NC}"
cd word-traitor
echo "VITE_SOCKET_URL=${NGROK_URL}" > .env.local
npm install --silent
npm run build
echo -e "${GREEN}✅ Frontend built${NC}"
cd ..

# --- START BACKEND (serves frontend + socket) ---
echo -e "\n${YELLOW}[5/5] Starting backend server on port 5001...${NC}"

echo "PORT=5001" > server/.env
echo "CLIENT_ORIGIN=${NGROK_URL}" >> server/.env

cd server
node index.js &
SERVER_PID=$!
cd ..

sleep 2

echo ""
echo -e "${CYAN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🎭 WORD TRAITOR IS LIVE!${NC}"
echo -e "${CYAN}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}🌍 Share this ONE link with your cousins:${NC}"
echo ""
echo -e "  ${CYAN}${BOLD}  👉  ${NGROK_URL}  👈${NC}"
echo ""
echo -e "  ${BOLD}(Frontend + Backend served together on port 5001)${NC}"
echo ""
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo -e "  Press ${RED}Ctrl+C${NC} to stop everything"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo ""

wait $SERVER_PID
