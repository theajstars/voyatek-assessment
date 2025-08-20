export type PresenceStatus = "online" | "offline";

export type Presence = {
  status: PresenceStatus;
  lastSeen?: Date;
};

const userIdToPresence = new Map<number, Presence>();

export function setOnline(userId: number): void {
  userIdToPresence.set(userId, { status: "online" });
}

export function setOffline(userId: number, lastSeen: Date): void {
  userIdToPresence.set(userId, { status: "offline", lastSeen });
}

export function getPresence(userId: number): Presence {
  const presence = userIdToPresence.get(userId);
  return presence ?? { status: "offline" };
}

export function getManyPresence(userIds: number[]): Record<number, Presence> {
  const map: Record<number, Presence> = {};
  for (const id of userIds) {
    map[id] = getPresence(id);
  }
  return map;
}
