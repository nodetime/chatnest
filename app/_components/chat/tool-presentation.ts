import type { ToolPart } from "../ai-elements/tool";

const browserTitles: Record<string, string> = {
  browser__browser_click: "点击页面",
  browser__browser_close: "关闭网页",
  browser__browser_navigate: "打开网页",
  browser__browser_press_key: "操作键盘",
  browser__browser_scroll: "滚动页面",
  browser__browser_snapshot: "查看网页",
  browser__browser_tabs: "管理网页标签",
  browser__browser_take_screenshot: "查看页面截图",
  browser__browser_type: "输入内容",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function loadedSkill(part: ToolPart) {
  const output = record(part.output);
  return part.type === "tool-loadSkill" &&
    part.state === "output-available" &&
    output &&
    ["name", "displayName", "description", "instructions"].every(
      (key) => typeof output[key] === "string"
    )
    ? output
    : undefined;
}

// Runtime aliases can include hashes. Never guess a provider or classify an
// arbitrary operation by substrings such as "search" or "fetch".
export function projectToolIdentity(
  part: ToolPart,
  aliases: { alias: string; name: string; serverName: string }[] = []
) {
  const name =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const input = record(part.input);
  const skill = loadedSkill(part);
  const nativeTitles: Record<string, string> = {
    "tool-createResultTable": "生成表格产物",
    "tool-loadSkill": "加载技能",
    "tool-readAttachment": "读取文件",
    "tool-readSkillResource": "读取技能参考",
  };
  const match = aliases.find((item) => item.alias === name);
  // Exact conventional operations only; unknown operations keep their real name.
  const knownActions: Record<string, string> = {
    search: "搜索资料",
    search_web: "搜索资料",
    "search.web": "搜索资料",
    tavily_extract: "读取网页正文",
    tavily_search: "搜索资料",
    "tavily-extract": "读取网页正文",
    "tavily-search": "搜索资料",
    web_search_exa: "搜索资料",
  };
  const knownAction =
    match && Object.hasOwn(knownActions, match.name)
      ? knownActions[match.name]
      : undefined;
  const mappedTitle = match
    ? knownAction
      ? knownAction
      : `${match.serverName} · ${match.name}`
    : undefined;
  const title =
    (skill?.displayName as string | undefined) ||
    nativeTitles[part.type] ||
    (Object.hasOwn(browserTitles, name) ? browserTitles[name] : undefined) ||
    mappedTitle ||
    name;
  const context = [
    input?.query,
    input?.q,
    input?.url,
    input?.filename,
    input?.resource,
    input?.name,
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0 && value !== title
  );
  return {
    context: skill ? undefined : context,
    kind:
      knownAction === "搜索资料"
        ? "search"
        : knownAction === "读取网页正文"
          ? "web"
          : "tool",
    name,
    origin: match?.serverName,
    skillLoaded: Boolean(skill),
    title,
  };
}

type PreviewSource = { url: string; title: string; domain: string };
export type ResultPreview = {
  records: {
    title: string;
    source?: PreviewSource;
    text?: string;
    fields: { label: string; text: string }[];
  }[];
  blocks: {
    label: string;
    fields: { label: string; text: string }[];
    // Only actual prose or a scoped empty-state is part of the reader surface.
    readable?: boolean;
  }[];
  sources: PreviewSource[];
  notice?: string;
  truncated: boolean;
};

// A small text-only view, not a second evidence store. All budgets apply across
// the entire return, including mixed MCP content. Original values stay in Sheet.
export function projectResult(
  value: unknown,
  mode: "result" | "parameters" = "result"
): ResultPreview {
  const preview: ResultPreview = {
    blocks: [],
    records: [],
    sources: [],
    truncated: false,
  };
  let remaining = 4800;
  let visited = 0;
  let parseBudget = 20_000;
  let nonText = false;
  let emptyLists = 0;
  const seen = new Set<object>();
  const clip = (text: string, limit = 700) => {
    const length = Math.min(limit, remaining);
    const result = text.slice(0, length);
    remaining -= result.length;
    if (result.length < text.length) {
      preview.truncated = true;
      return `${result}…`;
    }
    return result;
  };
  const primitive = (item: unknown) =>
    typeof item === "string" ? (item === "" ? '""' : item) : String(item);
  const add = (
    label: string,
    fields: { label: string; text: string }[],
    readable = false
  ) => {
    if (fields.length) {
      preview.blocks.push({ fields, label: clip(label, 120), readable });
    }
  };
  const sourceFor = (
    object: Record<string, unknown>
  ): PreviewSource | undefined => {
    for (const key of ["url", "source_url", "href", "item_url"]) {
      const rawUrl = object[key];
      if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
        continue;
      }
      try {
        const url = new URL(rawUrl);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        ) {
          continue;
        }
        const existing = preview.sources.find(
          (candidate) => candidate.url === url.href
        );
        if (existing) {
          return existing;
        }
        if (preview.sources.length >= 6) {
          preview.truncated = true;
          return;
        }
        const source = {
          domain: url.hostname,
          title: clip(
            typeof object.title === "string"
              ? object.title
              : typeof object.name === "string"
                ? object.name
                : url.hostname,
            180
          ),
          url: url.href,
        };
        preview.sources.push(source);
        return source;
      } catch {
        /* No arbitrary schemes or credential-bearing links. */
      }
    }
  };
  const addRecord = (object: Record<string, unknown>) => {
    const titleKey =
      typeof object.title === "string"
        ? "title"
        : typeof object.name === "string"
          ? "name"
          : undefined;
    const title = titleKey ? (object[titleKey] as string) : undefined;
    const source = sourceFor(object);
    if (!title && !source) {
      return false;
    }
    if (preview.records.length >= 4) {
      preview.truncated = true;
      return true;
    }
    const textKey = [
      "snippet",
      "description",
      "summary",
      "excerpt",
      "content",
      "text",
    ].find((key) => typeof object[key] === "string" && object[key].length > 0);
    const text = textKey ? (object[textKey] as string) : undefined;
    const fields: { label: string; text: string }[] = [];
    let inspected = 0;
    for (const key in object) {
      if (!Object.hasOwn(object, key)) {
        continue;
      }
      inspected += 1;
      if (inspected > 12) {
        preview.truncated = true;
        break;
      }
      if (
        [
          "title",
          "name",
          "url",
          "source_url",
          "href",
          "item_url",
          "snippet",
          "description",
          "summary",
          "content",
          "excerpt",
          "text",
        ].includes(key)
      ) {
        // A selected heading/snippet/link is represented; other original
        // values under these familiar keys are still omissions, even falsey.
        const represented =
          key === titleKey ||
          key === textKey ||
          (["url", "source_url", "href", "item_url"].includes(key) &&
            object[key] === source?.url);
        if (!represented) {
          preview.truncated = true;
        }
        continue;
      }
      const child = object[key];
      if (child !== null && typeof child === "object") {
        preview.truncated = true;
        continue;
      }
      if (fields.length >= 4 || remaining <= 0) {
        preview.truncated = true;
        break;
      }
      fields.push({ label: clip(key, 80), text: clip(primitive(child), 160) });
    }
    preview.records.push({
      fields,
      source,
      text: text ? clip(text, 400) : undefined,
      title: clip(title ?? source?.title ?? "", 180),
    });
    return true;
  };
  const visit = (item: unknown, label = "", depth = 0): void => {
    if (remaining <= 0 || visited >= 64 || preview.blocks.length >= 16) {
      preview.truncated = true;
      return;
    }
    visited += 1;
    if (item === null || typeof item !== "object") {
      add(label, [{ label: "", text: clip(primitive(item)) }], !label);
      return;
    }
    if (seen.has(item) || depth > 5) {
      preview.truncated = true;
      add(label, [{ label: "", text: "嵌套内容，详见调用详情" }]);
      return;
    }
    seen.add(item);
    if (Array.isArray(item)) {
      if (!item.length) {
        if (mode === "result") {
          emptyLists += 1;
          add(label || "列表", [{ label: "", text: "返回列表为空。" }], true);
        } else {
          add(label, [{ label: "", text: "[]" }]);
        }
      }
      for (let index = 0; index < Math.min(item.length, 4); index += 1) {
        visit(
          item[index],
          `${label ? `${label} · ` : ""}${index + 1}`,
          depth + 1
        );
      }
      if (item.length > 4) {
        preview.truncated = true;
      }
      return;
    }
    const object = item as Record<string, unknown>;
    if (mode === "result") {
      if (
        (Array.isArray(object.content) ||
          typeof object.isError === "boolean") &&
        record(object.structuredContent)
      ) {
        if (Array.isArray(object.content)) {
          nonText ||= object.content
            .slice(0, 6)
            .some((entry) => record(entry)?.type !== "text");
          if (object.content.length > 6) {
            preview.truncated = true;
          }
        }
        preview.notice = "结构化结果预览；完整返回内容见调用详情。";
        visit(object.structuredContent, "", depth + 1);
        return;
      }
      const collectionKey = ["items", "results", "data"].find((key) =>
        Array.isArray(object[key])
      );
      if (collectionKey) {
        for (const key of ["answer", "summary", "message"]) {
          if (typeof object[key] === "string") {
            add("", [{ label: "", text: clip(object[key]) }], true);
          }
        }
        for (const key in object) {
          if (!Object.hasOwn(object, key)) {
            continue;
          }
          if (
            key === collectionKey ||
            (["answer", "summary", "message"].includes(key) &&
              typeof object[key] === "string")
          ) {
            continue;
          }
          preview.truncated = true;
          break;
        }
        visit(object[collectionKey], collectionKey, depth + 1);
        return;
      }
      if (addRecord(object)) {
        return;
      }
    }
    const entries: [string, unknown][] = [];
    for (const key in object) {
      if (!Object.hasOwn(object, key)) {
        continue;
      }
      if (entries.length === 8) {
        preview.truncated = true;
        break;
      }
      entries.push([key, object[key]]);
    }
    if (!entries.length) {
      add(label, [{ label: "", text: "{}" }]);
    }
    const fields: { label: string; text: string }[] = [];
    const nested: [string, unknown][] = [];
    for (const [key, child] of entries.slice(0, 8)) {
      if (
        mode === "result" &&
        key === "isError" &&
        Array.isArray(object.content)
      ) {
        continue;
      }
      if (remaining <= 0) {
        preview.truncated = true;
        break;
      }
      // MCP content has an explicit type discriminator. Binary/media payloads
      // are never rendered, fetched or interpreted as markup.
      if (mode === "result" && key === "content" && Array.isArray(child)) {
        nested.push([key, child]);
      } else if (child === null || typeof child !== "object") {
        if (
          mode === "result" &&
          typeof child === "string" &&
          child.trim().length > 0 &&
          [
            "snippet",
            "text",
            "content",
            "answer",
            "summary",
            "description",
            "excerpt",
            "message",
          ].includes(key)
        ) {
          add("", [{ label: "", text: clip(child) }], true);
        } else {
          fields.push({ label: clip(key, 100), text: clip(primitive(child)) });
        }
      } else {
        nested.push([key, child]);
      }
    }
    add(label, fields);
    for (const [key, child] of nested) {
      const mcpContent =
        mode === "result" &&
        key === "content" &&
        Array.isArray(child) &&
        child.slice(0, 6).some((entry) => {
          const block = record(entry);
          return (
            typeof block?.type === "string" &&
            ["text", "image", "audio", "resource", "resource_link"].includes(
              block.type
            )
          );
        });
      if (!mcpContent || !Array.isArray(child)) {
        visit(child, label ? `${label} · ${key}` : key, depth + 1);
        continue;
      }
      if (child.length === 0) {
        add(key, [{ label: "", text: "[]" }]);
      }
      for (const block of child.slice(0, 6)) {
        const content = record(block);
        if (content?.type !== "text" || typeof content.text !== "string") {
          nonText = true;
          continue;
        }
        let text: unknown = content.text;
        if (remaining <= 0 || visited >= 64 || preview.blocks.length >= 16) {
          preview.truncated = true;
          break;
        }
        if (content.text.length <= parseBudget) {
          parseBudget -= content.text.length;
          try {
            text = JSON.parse(content.text);
          } catch {
            /* Plain text. */
          }
        }
        visit(text, "", depth + 1);
      }
      if (child.length > 6) {
        preview.truncated = true;
      }
    }
  };
  if (value === undefined) {
    preview.notice =
      mode === "parameters"
        ? "调用参数未记录，请查看调用详情。"
        : "工具没有返回内容。";
  } else {
    visit(value);
  }
  if (
    emptyLists > 0 &&
    !preview.truncated &&
    preview.blocks.length === emptyLists &&
    preview.records.length === 0 &&
    preview.sources.length === 0
  ) {
    preview.blocks = [];
    preview.notice = "返回列表为空。";
  }
  if (
    preview.truncated &&
    preview.notice === "结构化结果预览；完整返回内容见调用详情。"
  ) {
    preview.notice = undefined;
  }
  if (nonText) {
    preview.notice = "含非文本或未识别内容；原始返回值保留在调用详情。";
  }
  return preview;
}

export function projectToolResult(part: ToolPart): ResultPreview {
  const skill = loadedSkill(part);
  if (skill) {
    const description = skill.description as string;
    const preview = projectResult(description.slice(0, 240));
    preview.truncated = description.length > 240;
    return preview;
  }
  const output = record(part.output);
  if (part.type === "tool-loadSkill") {
    return {
      blocks: [],
      notice: "返回内容格式未识别，请查看调用详情。",
      records: [],
      sources: [],
      truncated: false,
    };
  }
  if (part.type === "tool-readSkillResource") {
    if (
      output &&
      ["name", "resource", "content"].every(
        (key) => typeof output[key] === "string"
      )
    ) {
      const preview = projectResult(output.content);
      if (preview.blocks[0]) {
        preview.blocks[0].label = (output.resource as string).slice(0, 160);
      }
      return preview;
    }
    return {
      blocks: [],
      notice: "返回内容格式未识别，请查看调用详情。",
      records: [],
      sources: [],
      truncated: false,
    };
  }
  return projectResult(part.output);
}
