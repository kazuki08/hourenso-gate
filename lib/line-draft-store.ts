import { toJstIsoString } from "@/lib/env-utils";

type PendingDraft = {
  lineUserId: string;
  draftText: string;
  notionSummary: string;
  generatedAt: string;
};

const STORE_TTL_MS = 1000 * 60 * 30;
const pendingDrafts = new Map<string, PendingDraft>();

function isExpired(item: PendingDraft) {
  return Date.now() - new Date(item.generatedAt).getTime() > STORE_TTL_MS;
}

export function setPendingDraft(input: {
  lineUserId: string;
  draftText: string;
  notionSummary: string;
}) {
  const payload: PendingDraft = {
    lineUserId: input.lineUserId,
    draftText: input.draftText,
    notionSummary: input.notionSummary,
    generatedAt: toJstIsoString(),
  };
  pendingDrafts.set(input.lineUserId, payload);
  return payload;
}

export function getPendingDraft(lineUserId: string) {
  const item = pendingDrafts.get(lineUserId);
  if (!item) return null;
  if (isExpired(item)) {
    pendingDrafts.delete(lineUserId);
    return null;
  }
  return item;
}

export function clearPendingDraft(lineUserId: string) {
  pendingDrafts.delete(lineUserId);
}
