import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { HttpErrorCodesObj } from "../data";
import { prisma } from "../prisma";

export const ReturnResponse = (
  res: Response,
  code: number,
  message?: string,
  data?: any
) => {
  return res.status(code).json({
    data,
    message,
  });
};
export const getValidationErrors = (req: Request) => {
  const hasNoErrors = validationResult(req).isEmpty();
  const errors = Object.values(validationResult(req).mapped()).map(
    (err) => err.msg
  );
  return { hasNoErrors, errors };
};
export const ReturnValidationErrors = (res: Response, errors: any[]) => {
  ReturnResponse(res, HttpErrorCodesObj.Forbidden, "Validation Errors", errors);
};
export function trimObjectStrings<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const value = obj[key];

    if (typeof value === "string" && key !== "password") {
      result[key] = value.trim();
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
export const checkTableExists = async (
  tableName: TableNamesProps
): Promise<boolean> => {
  try {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ${tableName}
    `;

    console.log("Does the table exist?", result.length > 0);
    return result.length > 0;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
};

export const createTable = async (
  tableName: TableNamesProps
): Promise<boolean> => {
  try {
    // Check if table already exists
    const tableExists = await checkTableExists(tableName);
    if (tableExists) {
      console.log(`Table ${tableName} already exists`);
      return true;
    }

    const createTableSQL = getCreateTableSQL(tableName);

    if (!createTableSQL) {
      console.error(
        `Table ${tableName} not found in schema or not supported for creation`
      );
      return false;
    }

    await prisma.$executeRawUnsafe(createTableSQL);

    console.log(`Table ${tableName} created successfully`);
    return true;
  } catch (error) {
    console.error(`Error creating table ${tableName}:`, error);
    return false;
  }
};

type TableNamesProps = "User" | "Room" | "Roommember" | "Message";
const getCreateTableSQL = (tableName: TableNamesProps): string | null => {
  switch (tableName) {
    case "User":
      return `
        CREATE TABLE IF NOT EXISTS \`User\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`email\` VARCHAR(191) NOT NULL,
          \`password\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NULL,
          \`lastSeen\` DATETIME(3) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`User_email_key\` (\`email\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `;

    case "Room":
      return `
        CREATE TABLE IF NOT EXISTS \`Room\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`isPrivate\` BOOLEAN NOT NULL DEFAULT false,
          \`inviteCode\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL,
          \`createdById\` INT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Room_inviteCode_key\` (\`inviteCode\`),
          INDEX \`Room_createdById_idx\` (\`createdById\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `;

    case "Roommember":
      return `
        CREATE TABLE IF NOT EXISTS \`RoomMember\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`roomId\` VARCHAR(191) NOT NULL,
          \`userId\` INT NOT NULL,
          \`joinedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`RoomMember_roomId_userId_key\` (\`roomId\`, \`userId\`),
          INDEX \`RoomMember_userId_idx\` (\`userId\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `;

    case "Message":
      return `
        CREATE TABLE IF NOT EXISTS \`Message\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`roomId\` VARCHAR(191) NOT NULL,
          \`userId\` INT NOT NULL,
          \`content\` VARCHAR(191) NOT NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`deliveredAt\` DATETIME(3) NULL,
          \`readAt\` DATETIME(3) NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`Message_roomId_createdAt_idx\` (\`roomId\`, \`createdAt\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `;

    default:
      return null;
  }
};

export const wipeDatabase = async () => {
  await prisma.user.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
};
