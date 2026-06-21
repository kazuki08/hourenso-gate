import { auth } from "@clerk/nextjs/server";
import { Client } from "@notionhq/client";
import type { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { NextResponse } from "next/server";

type NotionBlock = ListBlockChildrenResponse["results"][number];

function getMissingEnvVars() {
  const required = ["NOTION_API_KEY", "NOTION_TEST_PAGE_ID"] as const;
  return required.filter((key) => !process.env[key]);
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

async function collectBlockTexts(notion: Client, block: NotionBlock): Promise<string[]> {
  const lines: string[] = [];
  const current = extractCurrentBlockText(block);
  if (current) {
    lines.push(current);
  }

  if ("has_children" in block && block.has_children) {
    const children = await listAllChildren(notion, block.id);
    for (const child of children) {
      const childLines = await collectBlockTexts(notion, child);
      lines.push(...childLines);
    }
  }

  return lines;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing_env_vars", missing },
      { status: 500 }
    );
  }

  const pageId = process.env.NOTION_TEST_PAGE_ID!;
  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  try {
    await notion.pages.retrieve({ page_id: pageId });
    const rootBlocks = await listAllChildren(notion, pageId);
    const allLines: string[] = [];

    for (const block of rootBlocks) {
      const blockLines = await collectBlockTexts(notion, block);
      allLines.push(...blockLines);
    }

    return NextResponse.json({
      ok: true,
      pageId,
      content: allLines.join("\n").trim(),
      lineCount: allLines.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "notion_fetch_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
