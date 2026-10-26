import { eq } from "drizzle-orm";
import { generateUUID } from "@/server/domain/message/ids";
import type { UserRepository } from "@/server/domain/user/repository";
import { ChatbotError } from "@/server/shared/errors";
import { generateHashedPassword } from "@/server/shared/password";
import { db } from "./client";
import { user } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移
export const userRepository: UserRepository = {
  create(email, password) {
    const hashedPassword = generateHashedPassword(password);
    return db
      .insert(user)
      .values({ email, password: hashedPassword })
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
  createGuest() {
    const email = `guest-${Date.now()}`;
    const password = generateHashedPassword(generateUUID());
    return db
      .insert(user)
      .values({ email, password })
      .returning({ email: user.email, id: user.id })
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
  findByEmail(email) {
    return db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
};
