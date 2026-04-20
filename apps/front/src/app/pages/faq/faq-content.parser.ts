import { marked } from 'marked';

export interface FaqItem {
  question: string;
  answerHtml: string;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

/**
 * Parse a FAQ markdown file into a structured list of sections.
 *
 * Expected format:
 * - `## Section title`
 * - `### Question?`
 * - Answer body rendered as markdown (paragraphs, lists, links, emphasis...)
 *
 * Any content before the first `##` heading is ignored. Questions with an
 * empty body produce an empty `answerHtml`. Section/question titles are
 * kept as plain text; only answers go through the markdown renderer.
 *
 * Limitation: the parser splits strictly on `^## ` / `^### ` at line start
 * and is not aware of fenced code blocks. Do not put literal `## ` or
 * `### ` sequences at the start of a line inside an answer body.
 */
export function parseFaqMarkdown(raw: string): FaqSection[] {
  const normalized = raw.replaceAll('\r\n', '\n');
  // Drop the first element (content before the first `## ` heading).
  const sectionChunks = normalized.split(/^## /m).slice(1);
  const sections: FaqSection[] = [];
  for (const chunk of sectionChunks) {
    const section = parseSection(chunk);
    if (section !== undefined) {
      sections.push(section);
    }
  }
  return sections;
}

function parseSection(chunk: string): FaqSection | undefined {
  const { head, body } = splitFirstLine(chunk);
  const title = head.trim();
  if (title === '') return undefined;
  // Drop the first element (any orphan text between the `## ` heading and
  // the first `### ` — the authoring convention forbids putting content there).
  const itemChunks = body.split(/^### /m).slice(1);
  const items: FaqItem[] = [];
  for (const itemChunk of itemChunks) {
    const item = parseItem(itemChunk);
    if (item !== undefined) {
      items.push(item);
    }
  }
  return { title, items };
}

function parseItem(chunk: string): FaqItem | undefined {
  const { head, body } = splitFirstLine(chunk);
  const rawQuestion = head.trim();
  if (rawQuestion === '') return undefined;
  // French typography: a regular space before `?` must be a non-breaking
  // space so the `?` never ends up alone on the next line. No-op for
  // languages that don't put a space before `?` (e.g. English).
  const question = rawQuestion.replaceAll(' ?', '\u00A0?');
  const answerMarkdown = body.trim();
  const answerHtml = renderMarkdown(answerMarkdown);
  return { question, answerHtml };
}

function splitFirstLine(chunk: string): { head: string; body: string } {
  const newlineIdx = chunk.indexOf('\n');
  if (newlineIdx === -1) {
    return { head: chunk, body: '' };
  }
  return { head: chunk.slice(0, newlineIdx), body: chunk.slice(newlineIdx + 1) };
}

function renderMarkdown(md: string): string {
  if (md === '') return '';
  return marked.parse(md, { async: false });
}
