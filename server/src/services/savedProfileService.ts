import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "./activityService.js";
import { getInstagramProvider } from "./instagram/instagramClient.js";
import { getStoredProfile, serializeProfile } from "./instagram/instagramProfileService.js";

export async function listSaved() {
  const rows = await prisma.savedProfile.findMany({
    where: { profile: { dataSource: getInstagramProvider().dataSource } },
    orderBy: { createdAt: "desc" },
    include: { profile: { include: { saved: true } } },
  });
  return rows.map((r) => ({ id: r.id, savedAt: r.createdAt.toISOString(), profile: serializeProfile(r.profile) }));
}

export async function saveProfile(username: string) {
  const profile = await getStoredProfile(username);
  const saved = await prisma.savedProfile.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id },
    update: {},
  });
  await logActivity(profile.dataSource, "save_profile", { username: profile.username, profileId: profile.id });
  return { id: saved.id, savedAt: saved.createdAt.toISOString(), profile: serializeProfile({ ...profile, saved }) };
}

export async function removeSaved(id: string) {
  const row = await prisma.savedProfile.findUnique({ where: { id }, include: { profile: true } });
  if (!row || row.profile.dataSource !== getInstagramProvider().dataSource) {
    throw new AppError("NOT_FOUND", "Saved profile not found.");
  }
  await prisma.savedProfile.delete({ where: { id } });
  await logActivity(row.profile.dataSource, "unsave_profile", { username: row.profile.username, profileId: row.profileId });
  return { removed: true };
}
