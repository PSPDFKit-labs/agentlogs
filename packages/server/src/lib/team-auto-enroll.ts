import { and, eq } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { teamMembers, teams, user } from "../db/schema";
import { env } from "./env";
import { logger } from "./logger";

interface AutoAddResult {
  added: boolean;
  reason?: "not-configured" | "team-not-found" | "already-member";
}

export async function autoAddUserToConfiguredTeam(db: DrizzleDB, userId: string): Promise<AutoAddResult> {
  const teamId = env.AUTO_ADD_TEAM_ID;
  if (!teamId) {
    return { added: false, reason: "not-configured" };
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
  if (!team) {
    logger.error("Configured auto-add team not found", { teamId, userId });
    return { added: false, reason: "team-not-found" };
  }

  const existingMembership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
  });
  if (existingMembership) {
    return { added: false, reason: "already-member" };
  }

  const currentUser = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });
  if (!currentUser) {
    logger.error("Cannot auto-add missing user to configured team", { teamId, userId });
    return { added: false };
  }

  if (currentUser.role === "waitlist") {
    await db.transaction(async (tx) => {
      await tx.insert(teamMembers).values({ teamId, userId });
      await tx.update(user).set({ role: "user" }).where(eq(user.id, userId));
    });
    logger.info("User auto-added to configured team and upgraded from waitlist", { teamId, userId });
    return { added: true };
  }

  await db.insert(teamMembers).values({ teamId, userId });
  logger.info("User auto-added to configured team", { teamId, userId });
  return { added: true };
}
