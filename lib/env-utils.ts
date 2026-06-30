export function normalizeEnvValue(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const isDoubleQuoted = raw.startsWith("\"") && raw.endsWith("\"");
  const isSingleQuoted = raw.startsWith("'") && raw.endsWith("'");
  if (isDoubleQuoted || isSingleQuoted) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export function normalizeMultilineEnvValue(value: string | undefined) {
  return normalizeEnvValue(value).replace(/\\n/g, "\n").replace(/\r/g, "");
}
