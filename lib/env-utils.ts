export function normalizeEnvValue(value: string | undefined) {
  let raw = (value || "").trim();
  if (!raw) return "";

  // Remove wrapping quotes repeatedly to handle doubly-quoted values.
  for (let i = 0; i < 3; i += 1) {
    const isDoubleQuoted = raw.startsWith("\"") && raw.endsWith("\"");
    const isSingleQuoted = raw.startsWith("'") && raw.endsWith("'");
    if (!isDoubleQuoted && !isSingleQuoted) break;
    raw = raw.slice(1, -1).trim();
  }

  return raw.replace(/\\"/g, "\"").replace(/\\'/g, "'");
}

export function normalizeMultilineEnvValue(value: string | undefined) {
  let normalized = normalizeEnvValue(value);
  if (!normalized) return "";

  // Recover newlines even when value is double-escaped.
  for (let i = 0; i < 3; i += 1) {
    const before = normalized;
    normalized = normalized.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
    if (normalized === before) break;
  }

  return normalized.replace(/\r/g, "");
}

export function toJstIsoString(input: Date | string | number = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const jstTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jstTime.toISOString().slice(0, -1)}+09:00`;
}
