# Bot Command Center

Веб-платформа для управления Telegram-ботами. Создавайте ботов для разных каналов, генерируйте посты через AI, контролируйте качество.

## Быстрый старт (локально)

```bash
npm install
npm run dev
```

Откройте http://localhost:5173  
Логин: `admin@localhost` / `admin`

## Production (Docker)

```bash
# Собрать и запустить
docker compose up -d

# Или без Docker
npm run build
npm start
```

Откройте http://localhost:3000

## Деплой на Ubuntu (bots.sitespro.org)

### 1. На сервере

```bash
# Клонировать репо
git clone https://github.com/crcknaka/bot-command-center.git
cd bot-command-center

# Запустить
docker compose up -d
```

### 2. Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name bots.sitespro.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Cloudflare

- DNS: `bots.sitespro.org` → IP сервера (Proxied)
- SSL: Full (strict)

## Стек

- **Backend**: Node.js, TypeScript, Hono, grammY, Drizzle ORM, SQLite
- **Frontend**: React, Vite, Tailwind CSS
- **AI**: Vercel AI SDK (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio)
- **Поиск**: Tavily, Serper, Brave Search, SerpAPI, Google CSE
# Auto-deploy test Sat Apr  4 10:27:30 TST 2026
