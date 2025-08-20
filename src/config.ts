import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  corsOrigin: (
    process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim()),
};
