import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { ReturnResponse } from "../methods";
import { HttpErrorCodesObj } from "../data";

export interface AuthPayload {
  userId: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function validateAuthHeader(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers["authorization"];
  if (!header) {
    ReturnResponse(
      res,
      HttpErrorCodesObj.Unauthorized,
      "Missing Authorization header"
    );
  } else {
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token)
      ReturnResponse(
        res,
        HttpErrorCodesObj.Unauthorized,
        "Invalid Authorization header"
      );
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
      req.user = decoded;
      next();
    } catch {
      ReturnResponse(res, HttpErrorCodesObj.Unauthorized, "Invalid token");
    }
  }
}

export function signJwt(payload: AuthPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}
