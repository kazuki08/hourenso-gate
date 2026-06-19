export const CHECKLIST_TEMPLATES_STORAGE_KEY = "checklist_templates";
export const LEGACY_ADMIN_SETTINGS_STORAGE_KEY = "hourenso-gate-admin-settings-v1";
export const USER_TODAY_PROGRESS_STORAGE_KEY_PREFIX = "user_today_progress";
export const LINE_DESTINATION_SETTINGS_STORAGE_KEY = "line_destination_settings";

export const ALL_TOOLS_ID = "all";

export type TemplateTool = {
  id: string;
  name: string;
  description: string;
};

export type TemplateChecklistItem = {
  id: string;
  label: string;
  toolId: string;
};

export type TemplateVisibilityRule = {
  id: string;
  toolId: string;
  triggerLabels: string[];
  // backward compatibility for legacy saved data
  triggerLabel?: string;
  targetLabel: string;
  targetType?: "extra" | "message";
};

export type ChecklistTemplateSettings = {
  tools: TemplateTool[];
  checklistItems: TemplateChecklistItem[];
  visibilityRules: TemplateVisibilityRule[];
};

export function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getTodayProgressStorageKey(toolId: string) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${USER_TODAY_PROGRESS_STORAGE_KEY_PREFIX}-${toolId}-${yyyy}-${mm}-${dd}`;
}

