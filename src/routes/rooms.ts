import { Room } from "@prisma/client";
import { Request, Response, Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { HttpErrorCodesObj, HttpSuccessCodesObj } from "../data";
import {
  checkTableExists,
  createTable,
  getValidationErrors,
  ReturnResponse,
  ReturnValidationErrors,
} from "../methods";
import { validateAuthHeader } from "../middleware/auth";
import { prisma, safePrismaOperation } from "../prisma";
import { getManyPresence } from "../services/presence";
import { validateCreateRoom, validateJoinRoom } from "./validation";

const router = Router();

// GET ALL ROOMS FOR A USER
router.get("/", validateAuthHeader, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      include: { room: true },
    });
    const rooms = memberships.map((m) => m.room);
    ReturnResponse(
      res,
      HttpSuccessCodesObj.Success,
      "Rooms retrieved successfully",
      rooms
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      ReturnResponse(res, HttpErrorCodesObj.NotFound, "No rooms found");
    } else {
      ReturnResponse(
        res,
        HttpErrorCodesObj.InternalServerError,
        "Error retrieving rooms"
      );
    }
  }
});

// CREATE A ROOM
router.post(
  "/",
  validateAuthHeader,
  validateCreateRoom,
  async (req: Request, res: Response) => {
    const { hasNoErrors, errors } = getValidationErrors(req);
    if (hasNoErrors) {
      const userId = req.user!.userId;
      const { name, isPrivate } = req.body as {
        name: string;
        isPrivate?: boolean;
      };
      const inviteCode = isPrivate ? uuidv4() : null;

      const createRoom = async () => {
        const room = await prisma.room.create({
          data: {
            name,
            isPrivate: !!isPrivate,
            inviteCode,
            createdById: userId,
            members: { create: [{ userId }] },
          },
        });
        ReturnResponse(res, HttpSuccessCodesObj.Created, "Room created", room);
      };
      const roomTableExists = await checkTableExists("Room");
      const roomMemberTableExists = await checkTableExists("Roommember");
      if (!roomMemberTableExists) {
        await createTable("Roommember");
      }
      if (roomTableExists) {
        createRoom();
      } else {
        await createTable("Room");
        createRoom();
      }
    } else {
      ReturnValidationErrors(res, errors);
    }
  }
);

// JOIN A ROOM
router.post(
  "/join",
  validateAuthHeader,
  validateJoinRoom,
  async (req: Request, res: Response) => {
    const { hasNoErrors, errors } = getValidationErrors(req);
    if (!hasNoErrors) {
      ReturnValidationErrors(res, errors);
    } else {
      const userId = req.user!.userId;
      const { roomId, inviteCode } = req.body as {
        roomId?: string;
        inviteCode?: string;
      };

      let room: Room | null = null;

      const joinRoom = async () => {
        try {
          await prisma.roomMember.create({
            data: { roomId: room!.id, userId },
          });
          ReturnResponse(
            res,
            HttpSuccessCodesObj.Success,
            "Successfully joined room",
            room
          );
        } catch (error) {
          // USER IS ALREADY A MEMBER
          ReturnResponse(
            res,
            HttpSuccessCodesObj.Success,
            "Already a member of this room",
            room
          );
        }
      };
      if (inviteCode) {
        room = await prisma.room.findFirst({ where: { inviteCode } });
        if (!room) {
          ReturnResponse(
            res,
            HttpErrorCodesObj.NotFound,
            "Invalid invite code"
          );
        } else {
          joinRoom();
        }
      } else if (roomId) {
        room = await prisma.room.findUnique({ where: { id: roomId } });

        if (!room) {
          ReturnResponse(res, HttpErrorCodesObj.NotFound, "Room not found");
        } else {
          if (room.isPrivate) {
            if (room.createdById !== userId) {
              ReturnResponse(
                res,
                HttpErrorCodesObj.Forbidden,
                "Private room requires invite"
              );
            } else {
              joinRoom();
            }
          } else {
            joinRoom();
          }
        }
      } else {
        ReturnResponse(
          res,
          HttpErrorCodesObj.BadRequest,
          "Provide roomId or inviteCode"
        );
      }
    }
  }
);

// GET MESSAGES FOR A ROOM
router.get("/:roomID/messages", validateAuthHeader, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.roomID;
    const limit = Math.min(
      parseInt((req.query.limit as string) || "20", 10),
      100
    );
    const cursor = (req.query.cursor as string) || undefined;

    const member = await safePrismaOperation(
      () =>
        prisma.roomMember.findFirst({
          where: { roomId, userId },
        }),
      "RoomMember"
    );

    if (!member)
      ReturnResponse(res, HttpErrorCodesObj.Forbidden, "Not a member of room");

    const messages = await safePrismaOperation(
      () =>
        prisma.message.findMany({
          where: { roomId },
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      "Message"
    );

    const nextCursor =
      messages.length === limit ? messages[messages.length - 1].id : null;
    ReturnResponse(
      res,
      HttpSuccessCodesObj.Success,
      "Messages retrieved successfully",
      {
        messages: messages.reverse(),
        nextCursor,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      ReturnResponse(res, HttpSuccessCodesObj.Success, "No messages found", {
        messages: [],
        nextCursor: null,
      });
    } else {
      ReturnResponse(
        res,
        HttpErrorCodesObj.InternalServerError,
        "Error retrieving messages"
      );
    }
  }
});

// GET MEMBERS FOR A ROOM WITH PRESENCE STATUS
router.get("/:roomID/members", validateAuthHeader, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.roomID;

    // ENSURE REQUESTER IS A MEMBER
    const member = await prisma.roomMember.findFirst({
      where: { roomId, userId },
    });
    if (!member) {
      return ReturnResponse(
        res,
        HttpErrorCodesObj.Forbidden,
        "Not a member of room"
      );
    }

    const members = await prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: {
          select: { id: true, name: true, email: true, lastSeen: true },
        },
      },
    });

    const presences = getManyPresence(members.map((m) => m.userId));
    const payload = members.map((m) => {
      const p = presences[m.userId];
      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        status: p?.status || "offline",
        lastSeen: (p?.lastSeen || m.user.lastSeen) ?? null,
      };
    });

    ReturnResponse(
      res,
      HttpSuccessCodesObj.Success,
      "Members retrieved successfully",
      payload
    );
  } catch (error) {
    ReturnResponse(
      res,
      HttpErrorCodesObj.InternalServerError,
      "Error retrieving members"
    );
  }
});

export default router;
