#!/bin/bash

# ============================================
# 🎭 WORD TRAITOR — DEPLOY SCRIPT (ngrok)
# For testing with cousins in different cities
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

# ─── CHECK DEPENDENCIES ───────────────────────────────────────
echo -e "\n${YELLOW}[1/6] Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found. Install it: https://nodejs.org${NC}"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm not found.${NC}"
  exit 1
fi

if ! command -v ngrok &> /dev/null; then
  echo -e "${RED}❌ ngrok not found.${NC}"
  echo -e "${YELLOW}Install it:${NC}"
  echo "  curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null"
  echo "  echo \"deb https://ngrok-agent.s3.amazonaws.com buster main\" | sudo tee /etc/apt/sources.list.d/ngrok.list"
  echo "  sudo apt update && sudo apt install ngrok"
  echo -e "\nThen run: ${CYAN}ngrok config add-authtoken YOUR_TOKEN${NC}"
  echo "Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken"
  exit 1
fi

echo -e "${GREEN}✅ All dependencies found${NC}"

# ─── PULL LATEST CODE ─────────────────────────────────────────
echo -e "\n${YELLOW}[2/6] Pulling latest code from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code up to date${NC}"

# ─── INSTALL SERVER DEPS ──────────────────────────────────────
echo -e "\n${YELLOW}[3/6] Installing server dependencies...${NC}"
cd server
npm install --silent
echo -e "${GREEN}✅ Server dependencies installed${NC}"
cd ..

# ─── START NGROK (BACKEND) ────────────────────────────────────
echo -e "\n${YELLOW}[4/6] Starting ngrok tunnel for backend (port 5001)...${NC}"

# Kill any existing ngrok
pkill ngrok 2>/dev/null || true
sleep 1

# Start ngrok in background
ngrok http 5001 --log=stdout > /tmp/ngrok_word_traitor.log 2>&1 &
NGROK_PID=$!

echo "Waiting for ngrok to initialize..."
sleep 4

# Get the public URL from ngrok API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)['tunnels']
for t in tunnels:
    if t['proto'] == 'https':
        print(t['public_url'])
        break
" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
  echo -e "${RED}❌ Failed to get ngrok URL. Make sure you've added your authtoken:${NC}"
  echo "   ngrok config add-authtoken YOUR_TOKEN"
  echo "   Get token at: https://dashboard.ngrok.com/get-started/your-authtoken"
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

echo -e "${GREEN}✅ ngrok tunnel active: ${CYAN}${NGROK_URL}${NC}"

# ─── BUILD FRONTEND ───────────────────────────────────────────
echo -e "\n${YELLOW}[5/6] Building frontend with ngrok backend URL...${NC}"
cd word-traitor

# Write .env with the ngrok URL
echo "VITE_SOCKET_URL=${NGROK_URL}" > .env.local
echo -e "${GREEN}✅ .env.local written: VITE_SOCKET_URL=${NGROK_URL}${NC}"

npm install --silent
npm run build
echo -e "${GREEN}✅ Frontend built${NC}"
cd ..

# ─── START EVERYTHING ─────────────────────────────────────────
echo -e "\n${YELLOW}[6/6] Starting backend server...${NC}"

# Write server .env
echo "PORT=5001" > server/.env
echo "CLIENT_ORIGIN=${NGROK_URL}" >> server/.env

# Start backend
cd server
node index.js &
SERVER_PID=$!
cd ..

# Start frontend preview
cd word-traitor
npx vite preview --port 3000 --host &
FRONTEND_PID=$!
cd ..

sleep 2

# ─── GET LOCAL IP ─────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${CYAN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🎭 WORD TRAITOR IS LIVE!${NC}"
echo -e "${CYAN}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Your local URL:${NC}   http://${LOCAL_IP}:3000"
echo -e "  ${BOLD}Backend ngrok:${NC}    ${NGROK_URL}"
echo ""
echo -e "  ${YELLOW}${BOLD}📱 Share this with your cousins:${NC}"
echo -e "  ${BOLD}Frontend:${NC}         http://${LOCAL_IP}:3000"
echo ""
echo -e "  ${RED}⚠️  NOTE: Your cousins need to access your${NC}"
echo -e "  ${RED}   frontend too. Run this to expose frontend:${NC}"
echo ""
echo -e "  ${CYAN}  Open a new terminal and run:${NC}"
echo -e "  ${BOLD}  ngrok http 3000${NC}"
echo -e "  ${BOLD}  Then share that URL with your cousins 🎮${NC}"
echo ""
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo -e "  Press ${RED}Ctrl+C${NC} to stop everything"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo ""

# ─── CLEANUP ON EXIT ──────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  kill $NGROK_PID 2>/dev/null
  rm -f word-traitor/.env.local
  rm -f server/.env
  echo -e "${GREEN}✅ All processes stopped. Bye! 👋${NC}"
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait $SERVER_PID
