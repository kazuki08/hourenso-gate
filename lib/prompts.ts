export const DEFAULT_AI_FORMAT_PROMPT = `
以下の報連相の下書きを、ビジネスメール形式に整形してください。
・冒頭に【報告】【連絡】【相談】のいずれかを付けてください
・箇条書きは自然な文章に直してください
・敬語を使い、簡潔にまとめてください
`.trim();

export const FORMAT_MESSAGE_SYSTEM_PROMPT = DEFAULT_AI_FORMAT_PROMPT;

