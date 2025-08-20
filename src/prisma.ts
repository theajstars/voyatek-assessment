import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Middleware to check if tables exist
prisma.$use(async (params, next) => {
  if (
    params.action.startsWith("find") ||
    params.action === "count" ||
    params.action === "aggregate"
  ) {
    try {
      const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ${params.model}
      `;

      if (result.length === 0) {
        throw new Error(
          `Table '${params.model}' does not exist or is not accessible`
        );
      }
    } catch (error) {
      throw new Error(
        `Table '${params.model}' does not exist or is not accessible`
      );
    }
  }

  return next(params);
});

// CHECK IF A TABLE EXISTS
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ${tableName}
    `;
    return result.length > 0;
  } catch (error) {
    return false;
  }
}

// SAFE PRISMA OPERATION
export async function safePrismaOperation<T>(
  operation: () => Promise<T>,
  tableName: string
): Promise<T> {
  try {
    // Check if table exists first
    const exists = await tableExists(tableName);
    if (!exists) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      throw error;
    }
    throw new Error(
      `Operation failed on table '${tableName}': ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
