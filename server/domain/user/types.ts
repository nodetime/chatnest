// 用户类型:游客(免登临时会话)/ 正式用户;与会话鉴权(app/(auth)/auth.ts)共用同一联合
export type UserType = "guest" | "regular";

// 用户行领域类型:与 infrastructure/persistence/drizzle/schema.ts 的 users 表结构等价,
// 仓储实现处的赋值由 tsc 校验,列变更会在此处报错(防漂移)。
export type UserRow = {
  createdAt: Date;
  email: string;
  emailVerified: boolean;
  id: string;
  image: string | null;
  isAnonymous: boolean;
  name: string | null;
  // 登录口令散列;匿名账号为空
  password: string | null;
  updatedAt: Date;
};

// 应用层可见的最小会话视图:工具与用例只消费 user.id/type,不感知完整鉴权对象
export type SessionUser = { id: string; type: UserType };

// 完整鉴权 Session 的结构超集视图:expires 为工具侧 Session 结构兼容保留
export type ChatSession = { user: SessionUser; expires: string };
