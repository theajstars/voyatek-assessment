## Voyatek Chat Backend

Node.js + TypeScript + Express + Socket.IO + Prisma (MySQL).

### Prerequisites

- Node.js 18+
- MySQL 8+

### Quick Start

```bash
# Install
npm install

# Configure env
cp env.example .env
# edit .env → DATABASE_URL, JWT_SECRET, CORS_ORIGIN, PORT (default 8080)

# Init DB
npx prisma migrate dev --name init
npx prisma generate

# Run
npm run build && npm start
# Dev (after an initial build)
npm run dev
```

### Environment

- PORT: HTTP port (default 8080)
- DATABASE_URL: MySQL connection string
- JWT_SECRET: secret for signing JWTs
- CORS_ORIGIN: allowed origin(s), comma-separated

### REST

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/rooms`
- POST `/api/rooms`
- POST `/api/rooms/join`
- GET `/api/rooms/:id/messages`

### Socket.IO

- Connect with `auth: { token }`
- Events: `join_room`, `send_message`, `receive_message`, `typing`, `user_status`
