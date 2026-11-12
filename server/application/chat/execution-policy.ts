import {
  isLoopFinished,
  isStepCount,
  type StopCondition,
  type ToolSet,
} from "ai";

/** 默认由模型自然结束；显式部署轮数只截停仍在继续的工具循环。 */
export function executionStepLimit<TOOLS extends ToolSet>(
  maxSteps: number | null,
  onLimit: () => void
): StopCondition<TOOLS> {
  // 不省略 stopWhen：SDK 省略时会使用自己的单步默认值。
  if (maxSteps === null) {
    return isLoopFinished();
  }
  const reachedLimit = isStepCount(maxSteps);
  return async (context) => {
    const reached = await reachedLimit(context);
    if (reached) {
      onLimit();
    }
    return reached;
  };
}
