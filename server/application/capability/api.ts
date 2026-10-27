import "server-only";
import { ZodError, z } from "zod";
import {
  createManagementHandler,
  readSettingsBody,
} from "@/server/application/mcp/api";
import { SettingsError } from "@/server/application/mcp/security";
import { skillActionSchema } from "@/server/domain/capability/schema";
import { scopeRepository } from "@/server/infrastructure/persistence/drizzle/capability-repository";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { ChatbotError } from "@/server/shared/errors";
import { createPersonalSkillsService } from "./personal-skills";
import { createPersonalMcpService } from "./runtime";

type PersonalUser = { id?: string; type?: string } | null | undefined;
type Session = () => Promise<PersonalUser>;
export function authorizePersonal(
  user: PersonalUser,
  request: Request,
  write: boolean
) {
  if (!user?.id) {
    throw new SettingsError(401, "请先登录。");
  }
  if (user.type !== "regular") {
    throw new SettingsError(403, "请登录正式账号管理个人能力。");
  }
  const sameOrigin = request.headers.has("host")
    ? sameOriginBrowserControl(request)
    : request.headers.get("origin") === new URL(request.url).origin;
  if (write && !sameOrigin) {
    throw new SettingsError(403, "请求来源不匹配。");
  }
  return user.id;
}
const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  if (error instanceof ChatbotError) {
    return error.toResponse();
  }
  const status =
    error instanceof SettingsError
      ? error.status
      : error instanceof ZodError || error instanceof SyntaxError
        ? 400
        : 500;
  return Response.json(
    {
      error:
        error instanceof SettingsError
          ? error.message
          : status === 400
            ? "配置格式无效，请检查输入。"
            : "个人能力操作失败，请检查配置后重试。",
    },
    { headers, status }
  );
}
export function createPersonalMcpHandler({ session }: { session: Session }) {
  return async (request: Request) => {
    try {
      const user = await session();
      const id = authorizePersonal(user, request, request.method !== "GET");
      return createManagementHandler({
        authorize: authorizePersonal,
        file: async () => [],
        service: createPersonalMcpService(id),
        session: async () => user,
      })(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
export function createPersonalSkillsHandler({
  session,
  service = (userId) => createPersonalSkillsService({ userId }),
}: {
  session: Session;
  service?: (
    userId: string
  ) => Pick<ReturnType<typeof createPersonalSkillsService>, "get" | "execute">;
}) {
  return async (request: Request) => {
    try {
      const id = authorizePersonal(
        await session(),
        request,
        request.method !== "GET"
      );
      const skills = service(id);
      if (request.method === "GET") {
        return Response.json(await skills.get(), { headers });
      }
      const action = skillActionSchema.parse(
        await readSettingsBody(request, 262_144)
      );
      return Response.json(await skills.execute(action), { headers });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
export function createPersonalScopeHandler({ session }: { session: Session }) {
  return async (request: Request) => {
    try {
      const id = authorizePersonal(await session(), request, false);
      const chatId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get("chatId"));
      const scope = await scopeRepository.read(id, chatId);
      return Response.json(
        { revision: scope?.revision ?? 0, selection: scope?.selection ?? null },
        { headers }
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}
