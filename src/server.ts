import cors from "cors";
import express from "express";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { config } from "./config";
import { HttpSuccessCodesObj } from "./data";
import { createTable, ReturnResponse } from "./methods";
import { prisma } from "./prisma";
import authRoutes from "./routes/auth";
import roomRoutes from "./routes/rooms";
import { setOffline, setOnline } from "./services/presence";
import { SlidingWindowRateLimiter } from "./utils/rateLimiter";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const corsOrigins = config.corsOrigin;
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.get("/api/test-cors", (_req, res) => {
  res.json({ corsOrigins: config.corsOrigin });
});

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.get("/health", (_req, res) => {
  ReturnResponse(res, HttpSuccessCodesObj.Success, "Server is running");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

const messageLimiter = new SlidingWindowRateLimiter(5, 10_000);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("Unauthorized"));
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
    (socket as any).userId = decoded.userId;
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const userId = (socket as any).userId as number;
  setOnline(userId);
  io.emit("user_status", { userId, status: "online" });

  socket.on("join_room", async ({ roomId }: { roomId: string }) => {
    if (!roomId) return;
    const isMember = await prisma.roomMember.findFirst({
      where: { roomId, userId },
    });
    if (!isMember) return;
    socket.join(roomId);
  });

  socket.on(
    "typing",
    ({ roomId, isTyping }: { roomId: string; isTyping: boolean }) => {
      if (!roomId) return;
      socket.to(roomId).emit("typing", { roomId, userId, isTyping });
    }
  );

  socket.on(
    "send_message",
    async ({
      roomId,
      content,
      clientId,
    }: {
      roomId: string;
      content: string;
      clientId?: string;
    }) => {
      if (!roomId || !content || !content.trim()) return;
      if (!messageLimiter.allow(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }
      const isMember = await prisma.roomMember.findFirst({
        where: { roomId, userId },
      });
      if (!isMember) return;
      await createTable("Message");
      const message = await prisma.message.create({
        data: { roomId, userId, content: content.trim() },
      });
      // Get user data for the message
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      io.to(roomId).emit("receive_message", {
        id: message.id,
        roomId: message.roomId,
        userId: message.userId,
        content: message.content,
        createdAt: message.createdAt,
        user,
        clientId,
      });
    }
  );

  // Delivery/read acknowledgements
  socket.on(
    "ack_delivery",
    async ({ roomId, messageId }: { roomId: string; messageId: string }) => {
      if (!roomId || !messageId) return;
      const isMember = await prisma.roomMember.findFirst({
        where: { roomId, userId },
      });
      if (!isMember) return;
      // Broadcast to room so sender updates UI
      io.to(roomId).emit("message_delivery", {
        roomId,
        messageId,
        fromUserId: userId,
        ts: new Date().toISOString(),
      });
    }
  );

  socket.on(
    "ack_read",
    async ({ roomId, messageId }: { roomId: string; messageId: string }) => {
      if (!roomId || !messageId) return;
      const isMember = await prisma.roomMember.findFirst({
        where: { roomId, userId },
      });
      if (!isMember) return;
      io.to(roomId).emit("message_read", {
        roomId,
        messageId,
        fromUserId: userId,
        ts: new Date().toISOString(),
      });
    }
  );

  socket.on("disconnect", async () => {
    const lastSeen = new Date();
    setOffline(userId, lastSeen);
    await prisma.user
      .update({ where: { id: userId }, data: { lastSeen } })
      .catch(() => undefined);
    io.emit("user_status", { userId, status: "offline", lastSeen });
  });
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on ${config.port}`);
});
