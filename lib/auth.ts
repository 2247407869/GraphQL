import prisma from "./prisma";
import { logger } from "./logger";

export interface Auth {
  login: boolean;
  allowNsfw: boolean;
}

export async function byToken(access_token: string): Promise<Auth> {
  if (!access_token) {
    return {
      login: false,
      allowNsfw: false,
    };
  }
  const token = await prisma.chii_oauth_access_tokens.findFirst({
    where: { access_token, expires: { gte: new Date() } },
  });

  if (!token) {
    return {
      login: false,
      allowNsfw: false,
    };
  }

  const user = await prisma.chii_members.findFirst({
    where: { uid: parseInt(token.user_id!) },
  });

  if (!user) {
    logger.error("missing user", token.user_id);
    throw new Error("can't find user by access token");
  }

  return {
    login: true,
    allowNsfw: user.regdate - Date.now() / 1000 <= 60 * 60 * 24 * 90,
  };
}
