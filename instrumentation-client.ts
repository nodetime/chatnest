import { initBotId } from "botid/client/core";

// A loopback Next dev server has no BotID challenge service. The browser SDK
// otherwise blocks the chat POST when its challenge script cannot load.
if (
  process.env.NODE_ENV !== "development" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
) {
  initBotId({
    protect: [
      {
        method: "POST",
        path: "/api/chat",
      },
    ],
  });
}
