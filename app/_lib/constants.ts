import { generateDummyPassword } from "@/server/db/utils";

// 环境判定已收敛 server/shared/runtime(P2),此处转发保持单一来源
export {
  isDevelopmentEnvironment,
  isProductionEnvironment,
  isTestEnvironment,
} from "@/server/shared/runtime";

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "What are the advantages of using Next.js?",
  "Write code to demonstrate Dijkstra's algorithm",
  "Help me write an essay about Silicon Valley",
  "What is the weather in San Francisco?",
];
