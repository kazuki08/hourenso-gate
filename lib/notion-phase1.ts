import { Client } from "@notionhq/client";
import type { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { normalizeEnvValue } from "@/lib/env-utils";

type NotionBlock = ListBlockChildrenResponse["results"][number];
type NotionPage = {
  object: string;
  id: string;
  last_edited_time?: string;
  parent?: {
    type?: string;
    database_id?: string;
    data_source_id?: string;
  };
  properties?: Record<string, any>;
};

type NotionDatabaseQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

const NOTION_LOG_PREFIX = "[NotionPhase1]";

export type DailyMemoParams = {
  lineUserId?: string;
  notionUserHint?: string;
};

function richTextToPlainText(
  richText?: Array<{ plain_text?: string }>
) {
  if (!richText || richText.length === 0) return "";
  return richText.map((item) => item.plain_text || "").join("").trim();
}

function extractCurrentBlockText(block: NotionBlock) {
  if (!("type" in block)) return "";

  switch (block.type) {
    case "paragraph":
      return richTextToPlainText(block.paragraph.rich_text);
    case "to_do": {
      const text = richTextToPlainText(block.to_do.rich_text);
      if (!text) return "";
      return `${block.to_do.checked ? "- [x]" : "- [ ]"} ${text}`;
    }
    case "bulleted_list_item": {
      const text = richTextToPlainText(block.bulleted_list_item.rich_text);
      return text ? `- ${text}` : "";
    }
    case "numbered_list_item": {
      const text = richTextToPlainText(block.numbered_list_item.rich_text);
      return text ? `1. ${text}` : "";
    }
    case "heading_1":
      return richTextToPlainText(block.heading_1.rich_text);
    case "heading_2":
      return richTextToPlainText(block.heading_2.rich_text);
    case "heading_3":
      return richTextToPlainText(block.heading_3.rich_text);
    case "quote":
      return richTextToPlainText(block.quote.rich_text);
    case "callout":
      return richTextToPlainText(block.callout.rich_text);
    case "toggle":
      return richTextToPlainText(block.toggle.rich_text);
    case "code":
      return richTextToPlainText(block.code.rich_text);
    default:
      return "";
  }
}

async function listAllChildren(notion: Client, blockId: string) {
  const results: NotionBlock[] = [];
  let nextCursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100,
      start_cursor: nextCursor,
    });
    results.push(...response.results);
    nextCursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (nextCursor);

  return results;
}

async function collectBlockTexts(notion: Client, block: NotionBlock): Promise<string[]> {
  const lines: string[] = [];
  const current = extractCurrentBlockText(block);
  if (current) lines.push(current);

  if ("has_children" in block && block.has_children) {
    const children = await listAllChildren(notion, block.id);
    for (const child of children) {
      const childLines = await collectBlockTexts(notion, child);
      lines.push(...childLines);
    }
  }
  return lines;
}

function getNotionClient() {
  const apiKey = normalizeEnvValue(process.env.NOTION_API_KEY);
  if (!apiKey) {
    throw new Error("missing_env_var:NOTION_API_KEY");
  }
  return new Client({ auth: apiKey });
}

function getJstDateParts(base: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);

  const year = Number(parts.find((p) => p.type === "year")?.value || "0");
  const month = Number(parts.find((p) => p.type === "month")?.value || "0");
  const day = Number(parts.find((p) => p.type === "day")?.value || "0");
  return { year, month, day };
}

function toJstDayRange() {
  const today = getJstDateParts();
  const nextBaseUtc = Date.UTC(today.year, today.month - 1, today.day) + 24 * 60 * 60 * 1000;
  const nextDate = new Date(nextBaseUtc);
  const next = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate(),
  };

  const toDateString = (v: { year: number; month: number; day: number }) =>
    `${String(v.year).padStart(4, "0")}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;

  const start = `${toDateString(today)}T00:00:00+09:00`;
  const end = `${toDateString(next)}T00:00:00+09:00`;
  return { start, end };
}

async function queryDatabaseByLastEditedTime(params: {
  databaseId: string;
  start: string;
  end: string;
}) {
  const apiKey = normalizeEnvValue(process.env.NOTION_API_KEY);
  if (!apiKey) {
    throw new Error("missing_env_var:NOTION_API_KEY");
  }

  console.log(
    `${NOTION_LOG_PREFIX} database query start`,
    JSON.stringify({
      databaseId: params.databaseId,
      start: params.start,
      end: params.end,
    })
  );

  const queryPayloadBase = {
    page_size: 50,
    filter: {
      and: [
        {
          timestamp: "last_edited_time",
          last_edited_time: { on_or_after: params.start },
        },
        {
          timestamp: "last_edited_time",
          last_edited_time: { before: params.end },
        },
      ],
    },
    sorts: [{ timestamp: "last_edited_time", direction: "descending" as const }],
  };

  const callQueryEndpoint = async (endpointUrl: string, cursor?: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const body = cursor
        ? { ...queryPayloadBase, start_cursor: cursor }
        : queryPayloadBase;
      console.log(
        `${NOTION_LOG_PREFIX} request`,
        JSON.stringify({ endpointUrl, hasCursor: Boolean(cursor) })
      );
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        console.error(
          `${NOTION_LOG_PREFIX} request failed`,
          JSON.stringify({
            endpointUrl,
            status: response.status,
            statusText: response.statusText,
            body: text,
          })
        );
        throw new Error(
          `notion_db_query_failed:${response.status}:${response.statusText}`
        );
      }

      let data: NotionDatabaseQueryResponse;
      try {
        data = JSON.parse(text) as NotionDatabaseQueryResponse;
      } catch (error) {
        console.error(
          `${NOTION_LOG_PREFIX} json parse failed`,
          JSON.stringify({
            endpointUrl,
            body: text.slice(0, 1000),
            message: error instanceof Error ? error.message : "unknown",
          })
        );
        throw new Error("notion_db_query_invalid_json");
      }
      console.log(
        `${NOTION_LOG_PREFIX} response ok`,
        JSON.stringify({
          endpointUrl,
          resultCount: data.results?.length || 0,
          hasMore: Boolean(data.has_more),
        })
      );
      return data;
    } catch (error) {
      console.error(
        `${NOTION_LOG_PREFIX} request exception`,
        JSON.stringify({
          endpointUrl,
          hasCursor: Boolean(cursor),
          message: error instanceof Error ? error.message : "unknown",
        })
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const endpoints = [
    `https://api.notion.com/v1/databases/${params.databaseId}/query`,
    `https://api.notion.com/v1/data_sources/${params.databaseId}/query`,
  ];

  let nextCursor: string | undefined;
  const pages: NotionPage[] = [];
  let activeEndpoint: string | null = null;
  for (const endpoint of endpoints) {
    try {
      await callQueryEndpoint(endpoint);
      activeEndpoint = endpoint;
      break;
    } catch {
      // 次の候補エンドポイントを試す
    }
  }

  if (!activeEndpoint) {
    throw new Error("notion_db_query_all_endpoints_failed");
  }

  do {
    const data = await callQueryEndpoint(activeEndpoint, nextCursor);
    pages.push(...(data.results || []).filter((row) => row.object === "page"));
    nextCursor = data.has_more ? data.next_cursor || undefined : undefined;
  } while (nextCursor);

  console.log(
    `${NOTION_LOG_PREFIX} database query done`,
    JSON.stringify({ totalPages: pages.length, endpoint: activeEndpoint })
  );

  return pages;
}

async function fetchPromptTextFromPage(notion: Client) {
  const promptPageId = process.env.NOTION_PROMPT_PAGE_ID || "";
  if (!promptPageId) return "";
  const blocks = await listAllChildren(notion, promptPageId);
  const lines: string[] = [];
  for (const block of blocks) {
    const childLines = await collectBlockTexts(notion, block);
    lines.push(...childLines);
  }
  return lines.join("\n").trim();
}

function getPageTitle(page: NotionPage) {
  if (!("properties" in page)) return "";
  for (const prop of Object.values(page.properties || {})) {
    if (prop.type === "title") {
      return richTextToPlainText(prop.title);
    }
  }
  return "";
}

function maybeMatchUser(page: NotionPage, hint: string) {
  if (!hint || !("properties" in page)) return true;
  const lowered = hint.toLowerCase();
  return Object.values(page.properties || {}).some((prop) => {
    if (prop.type === "rich_text") {
      return richTextToPlainText(prop.rich_text).toLowerCase().includes(lowered);
    }
    if (prop.type === "title") {
      return richTextToPlainText(prop.title).toLowerCase().includes(lowered);
    }
    if (prop.type === "email") {
      return (prop.email || "").toLowerCase().includes(lowered);
    }
    if (prop.type === "people") {
      const raw = JSON.stringify(prop.people || []).toLowerCase();
      return raw.includes(lowered);
    }
    return false;
  });
}

async function fetchDailyMemoFromDatabase(notion: Client, params: DailyMemoParams) {
  const dbId = process.env.NOTION_DAILY_DB_ID || "";
  if (!dbId) {
    throw new Error("missing_env_var:NOTION_DAILY_DB_ID");
  }

  const createdProp = process.env.NOTION_DAILY_DATE_PROPERTY || "最終編集日時";
  const userHint = params.notionUserHint || params.lineUserId || "";
  const { start, end } = toJstDayRange();

  const fetchedPages = await queryDatabaseByLastEditedTime({
    databaseId: dbId,
    start,
    end,
  });

  // Phase 1ではタイトル一致を必須条件にしない。
  // ユーザー紐付け絞り込みは明示的に有効化したときのみ適用する。
  const shouldFilterByUser =
    process.env.NOTION_DAILY_FILTER_BY_USER === "true" && userHint.trim().length > 0;
  const pages = shouldFilterByUser
    ? fetchedPages.filter((page) => maybeMatchUser(page, userHint))
    : fetchedPages;
  if (pages.length === 0) {
    return {
      content: "",
      source: "database",
      pageCount: 0,
      promptFromNotion: await fetchPromptTextFromPage(notion),
      note: `db:${dbId}, filter:last_edited_time(JST), dateProperty:${createdProp}`,
    };
  }

  const lines: string[] = [];
  for (const page of pages.slice(0, 5)) {
    const title = getPageTitle(page) || "無題メモ";
    lines.push(`## ${title}`);
    const blocks = await listAllChildren(notion, page.id);
    for (const block of blocks) {
      const blockLines = await collectBlockTexts(notion, block);
      lines.push(...blockLines);
    }
    lines.push("");
  }

  return {
    content: lines.join("\n").trim(),
    source: "database",
    pageCount: pages.length,
    promptFromNotion: await fetchPromptTextFromPage(notion),
    note: `db:${dbId}, filter:last_edited_time(JST), dateProperty:${createdProp}`,
  };
}

async function fetchFallbackPageMemo(notion: Client) {
  const pageId = process.env.NOTION_TEST_PAGE_ID || "";
  if (!pageId) {
    throw new Error("missing_env_var:NOTION_TEST_PAGE_ID");
  }
  await notion.pages.retrieve({ page_id: pageId });
  const blocks = await listAllChildren(notion, pageId);
  const lines: string[] = [];
  for (const block of blocks) {
    const blockLines = await collectBlockTexts(notion, block);
    lines.push(...blockLines);
  }
  return {
    content: lines.join("\n").trim(),
    source: "page",
    pageCount: 1,
    promptFromNotion: await fetchPromptTextFromPage(notion),
    note: `page:${pageId}`,
  };
}

export function getMissingNotionPhase1EnvVars() {
  const missing: string[] = [];
  if (!process.env.NOTION_API_KEY) {
    missing.push("NOTION_API_KEY");
  }
  if (!process.env.NOTION_DAILY_DB_ID && !process.env.NOTION_TEST_PAGE_ID) {
    missing.push("NOTION_DAILY_DB_ID or NOTION_TEST_PAGE_ID");
  }
  return missing;
}

export async function getNotionDailyMemo(params: DailyMemoParams = {}) {
  const notion = getNotionClient();
  if (process.env.NOTION_DAILY_DB_ID) {
    try {
      return await fetchDailyMemoFromDatabase(notion, params);
    } catch (error) {
      console.error(
        `${NOTION_LOG_PREFIX} daily db fetch failed, fallback to page`,
        JSON.stringify({
          message: error instanceof Error ? error.message : "unknown",
          hasFallbackPage: Boolean(process.env.NOTION_TEST_PAGE_ID),
        })
      );
      if (process.env.NOTION_TEST_PAGE_ID) {
        return fetchFallbackPageMemo(notion);
      }
      return {
        content: "",
        source: "database",
        pageCount: 0,
        promptFromNotion: "",
        note: "db_query_failed_without_fallback_page",
      };
    }
  }
  return fetchFallbackPageMemo(notion);
}
