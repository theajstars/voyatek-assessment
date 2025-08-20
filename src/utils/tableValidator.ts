import { prisma } from "../prisma";

export interface TableValidationResult {
  exists: boolean;
  error?: string;
  tableName: string;
}

export interface TableInfo {
  name: string;
  columns: string[];
  rowCount?: number;
}

/**
 * Check if a specific table exists in the database
 */
export async function validateTableExists(
  tableName: string
): Promise<TableValidationResult> {
  try {
    // Use the same approach as the existing checkTableExists function
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ${tableName}
    `;

    return {
      exists: result.length > 0,
      tableName,
    };
  } catch (error) {
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      tableName,
    };
  }
}

/**
 * Get detailed information about a table including its columns
 */
export async function getTableInfo(
  tableName: string
): Promise<TableInfo | null> {
  try {
    // Check if table exists first
    const exists = await validateTableExists(tableName);
    if (!exists.exists) {
      return null;
    }

    // Get table structure
    const columns = await prisma.$queryRaw<
      Array<{ Field: string }>
    >`DESCRIBE ${tableName}`;

    let rowCount: number | undefined;
    try {
      const countResult = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) as count FROM ${tableName}`;
      rowCount = Number(countResult[0]?.count || 0);
    } catch {
      // Row count failed, continue without it
    }

    return {
      name: tableName,
      columns: columns.map((col) => col.Field),
      rowCount,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get all existing tables in the database
 */
export async function getAllTables(): Promise<string[]> {
  try {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `;
    return result.map((row) => row.table_name);
  } catch (error) {
    return [];
  }
}

/**
 * Validate multiple tables at once
 */
export async function validateMultipleTables(
  tableNames: string[]
): Promise<TableValidationResult[]> {
  const results = await Promise.all(
    tableNames.map((name) => validateTableExists(name))
  );
  return results;
}

/**
 * Create a safe wrapper for Prisma operations that validates table existence
 */
export function createSafePrismaOperation<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  tableName: string
) {
  return async (...args: T): Promise<R> => {
    const validation = await validateTableExists(tableName);
    if (!validation.exists) {
      throw new Error(
        `Cannot perform operation: Table '${tableName}' does not exist`
      );
    }
    return operation(...args);
  };
}

/**
 * Check if all required tables exist for the application to function
 */
export async function validateApplicationTables(): Promise<{
  valid: boolean;
  missingTables: string[];
  existingTables: string[];
}> {
  const requiredTables = ["User", "Room", "RoomMember", "Message"];
  const existingTables = await getAllTables();

  const missingTables = requiredTables.filter(
    (table) => !existingTables.includes(table)
  );

  return {
    valid: missingTables.length === 0,
    missingTables,
    existingTables,
  };
}
