import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { HttpErrorCodesObj, HttpSuccessCodesObj } from "../data";
import {
  checkTableExists,
  createTable,
  getValidationErrors,
  ReturnResponse,
  ReturnValidationErrors,
  trimObjectStrings,
} from "../methods";
import { signJwt, validateAuthHeader } from "../middleware/auth";
import { prisma } from "../prisma";
import { validateLogin, validateRegister } from "./validation";

const router = Router();

// GET USER PROFILE
router.get("/me", validateAuthHeader, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return ReturnResponse(
        res,
        HttpErrorCodesObj.Unauthorized,
        "Invalid token"
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return ReturnResponse(res, HttpErrorCodesObj.NotFound, "User not found");
    }

    ReturnResponse(
      res,
      HttpSuccessCodesObj.Success,
      "User retrieved successfully",
      {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    );
  } catch (error) {
    console.error("Error getting user:", error);
    ReturnResponse(
      res,
      HttpErrorCodesObj.InternalServerError,
      "Internal server error"
    );
  }
});

router.post(
  "/register",
  validateRegister,
  async (req: Request, res: Response) => {
    const { hasNoErrors, errors } = getValidationErrors(req);
    if (hasNoErrors) {
      const { email, password, name } = trimObjectStrings(
        req.body as {
          email: string;
          password: string;
          name?: string;
        }
      );

      try {
        const createUser = async () => {
          const hash = await bcrypt.hash(password, 10);
          const user = await prisma.user.create({
            data: { email, password: hash, name },
          });
          const token = signJwt({ userId: user.id });
          ReturnResponse(res, HttpSuccessCodesObj.Created, "User created", {
            token,
            user: { id: user.id, email: user.email, name: user.name },
          });
        };
        // CREATE TABLE IF NOT EXISTS users
        const tableExists = await checkTableExists("User");
        if (tableExists) {
          const existing = await prisma.user.findUnique({ where: { email } });
          if (existing) {
            ReturnResponse(
              res,
              HttpErrorCodesObj.Conflict,
              "Email already registered"
            );
          } else {
            createUser();
          }
        } else {
          await createTable("User");
          createUser();
        }
      } catch (error) {
        console.error("Error creating users table:", error);
        ReturnResponse(
          res,
          HttpErrorCodesObj.InternalServerError,
          "Internal server error"
        );
      }
    } else {
      ReturnValidationErrors(res, errors);
    }
  }
);

router.post("/login", validateLogin, async (req: Request, res: Response) => {
  const { hasNoErrors, errors } = getValidationErrors(req);
  if (hasNoErrors) {
    const { email, password } = trimObjectStrings(
      req.body as { email: string; password: string }
    );
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      ReturnResponse(res, HttpErrorCodesObj.NotFound, "User not found");
    } else {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (isPasswordValid) {
        const token = signJwt({ userId: user.id });
        ReturnResponse(res, HttpSuccessCodesObj.Success, "Login successful", {
          token,
          user: { id: user.id, email: user.email, name: user.name },
        });
      } else {
        ReturnResponse(
          res,
          HttpErrorCodesObj.Unauthorized,
          "Invalid credentials"
        );
      }
    }
  } else {
    ReturnValidationErrors(res, errors);
  }
});

export default router;
