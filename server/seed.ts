import { db } from "./db";
import { users } from "@shared/schema";

export async function seedDatabase() {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) return;

  console.log("Seeding database...");

  await db.insert(users).values({
    username: "admin@vnnovate.com",
    password: "Process@2502",
    name: "Administrator",
    role: "admin",
    status: "online",
    lastSeenAt: new Date(),
    email: "admin@vnnovate.com",
  });

  console.log("Database seeded successfully!");
}
