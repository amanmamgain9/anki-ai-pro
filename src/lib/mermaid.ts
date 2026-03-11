const MERMAID_FENCE_REGEX = /```mermaid\s*([\s\S]*?)```/gi;

function normalizeQuotes(value: string) {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
}

function quoteUnsafeNodeLabels(line: string) {
  return line.replace(
    /(\b[A-Za-z0-9_]+)\[([^\]\n"]*[(){}:,=+\-/*×][^\]\n"]*)\]/g,
    (_, id: string, label: string) => `${id}["${label.trim().replace(/"/g, "&quot;")}"]`,
  );
}

function closeDanglingEdgeLabels(line: string) {
  if (!line.includes("|")) return line;
  const arrowLabelMatch = line.match(/(-->|-\.->|==>)(\|[^|\n]+)$/);
  if (!arrowLabelMatch) return line;
  return `${line}|`;
}

export function normalizeMermaidChart(chart: string) {
  return chart
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => closeDanglingEdgeLabels(quoteUnsafeNodeLabels(normalizeQuotes(line))))
    .join("\n")
    .trim();
}

export function normalizeMermaidMarkdown(markdown: string) {
  return markdown.replace(MERMAID_FENCE_REGEX, (_, chart: string) => {
    const normalizedChart = normalizeMermaidChart(chart);
    return `\`\`\`mermaid\n${normalizedChart}\n\`\`\``;
  });
}
