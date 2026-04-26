# 🎭 Word Traitor — Deploy Guide (Play with Friends in Different Cities)

## Prerequisites

Make sure you have these installed on your Ubuntu machine:

### 1. Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. ngrok
```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

### 3. Add your ngrok authtoken (one-time setup)
1. Go to https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your token
3. Run:
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

---

## How to Run

### Step 1 — Make deploy script executable (one-time)
```bash
chmod +x deploy.sh
```

### Step 2 — Run the deploy script
```bash
./deploy.sh
```

### Step 3 — Expose frontend to internet
Open a **new terminal** and run:
```bash
ngrok http 3000
```
You'll get a URL like `https://abc123.ngrok-free.app`

### Step 4 — Share with cousins
Send them the frontend ngrok URL (from Step 3).
They open it in their browser and can play! 🎮

---

## How It Works

```
Your Ubuntu Machine
├── Backend (Node.js)  → port 5001 → ngrok → public URL
└── Frontend (Vite)   → port 3000 → ngrok → share this URL
                                              ↑
                                    Cousins open this
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ngrok: command not found` | Follow ngrok install steps above |
| `Failed to get ngrok URL` | Add authtoken: `ngrok config add-authtoken YOUR_TOKEN` |
| Cousins can't connect | Make sure you shared the **frontend** ngrok URL (port 3000), not the backend |
| Socket not connecting | Check that `VITE_SOCKET_URL` was set correctly in `.env.local` |
| Port already in use | Run `pkill node && pkill ngrok` then retry |
