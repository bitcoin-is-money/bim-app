import {describe, expect, it} from 'vitest';
import {parseFaqMarkdown} from './faq-content.parser';

describe('parseFaqMarkdown', () => {
  it('parses a single section with a single question', () => {
    const raw = `## General

### What is it?
A simple answer.`;
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(1);
    const [first] = result;
    expect(first?.title).toBe('General');
    expect(first?.items).toHaveLength(1);
    expect(first?.items[0]?.question).toBe('What is it?');
    expect(first?.items[0]?.answerHtml).toContain('<p>A simple answer.</p>');
  });

  it('parses multiple sections, each with multiple questions', () => {
    const raw = `## Section A

### Q1
Answer 1.

### Q2
Answer 2.

## Section B

### Q3
Answer 3.`;
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('Section A');
    expect(result[0]?.items).toHaveLength(2);
    expect(result[0]?.items[0]?.question).toBe('Q1');
    expect(result[0]?.items[1]?.question).toBe('Q2');
    expect(result[1]?.title).toBe('Section B');
    expect(result[1]?.items).toHaveLength(1);
    expect(result[1]?.items[0]?.question).toBe('Q3');
  });

  it('renders markdown in answers (bold, links, lists)', () => {
    const raw = `## General

### Rich answer
This is **bold** and has a [link](https://example.com).

- item one
- item two`;
    const result = parseFaqMarkdown(raw);
    const answerHtml = result[0]?.items[0]?.answerHtml ?? '';
    expect(answerHtml).toContain('<strong>bold</strong>');
    expect(answerHtml).toContain('<a href="https://example.com">link</a>');
    expect(answerHtml).toContain('<ul>');
    expect(answerHtml).toContain('<li>item one</li>');
    expect(answerHtml).toContain('<li>item two</li>');
  });

  it('preserves multi-paragraph answers', () => {
    const raw = `## General

### Multi paragraph
First paragraph.

Second paragraph.`;
    const result = parseFaqMarkdown(raw);
    const answerHtml = result[0]?.items[0]?.answerHtml ?? '';
    expect(answerHtml).toContain('<p>First paragraph.</p>');
    expect(answerHtml).toContain('<p>Second paragraph.</p>');
  });

  it('ignores orphan content before the first section', () => {
    const raw = `Some intro text that should be ignored.

## General

### Q1
Answer.`;
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('General');
  });

  it('ignores orphan content between a section heading and its first question', () => {
    const raw = `## General

This text has no question heading and should be dropped.

### Q1
Real answer.`;
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1);
    expect(result[0]?.items[0]?.question).toBe('Q1');
    expect(result[0]?.items[0]?.answerHtml).toContain('<p>Real answer.</p>');
  });

  it('returns an empty list when the input has no sections', () => {
    expect(parseFaqMarkdown('')).toEqual([]);
    expect(parseFaqMarkdown('   \n  \n')).toEqual([]);
    expect(parseFaqMarkdown('Just some prose.\nNo headings at all.')).toEqual([]);
  });

  it('handles a question with an empty answer body', () => {
    const raw = `## General

### Lonely question?`;
    const result = parseFaqMarkdown(raw);
    expect(result[0]?.items[0]?.question).toBe('Lonely question?');
    expect(result[0]?.items[0]?.answerHtml).toBe('');
  });

  it('normalizes CRLF line endings', () => {
    const raw = '## General\r\n\r\n### Q1\r\nAnswer.\r\n';
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1);
    expect(result[0]?.items[0]?.question).toBe('Q1');
    expect(result[0]?.items[0]?.answerHtml).toContain('<p>Answer.</p>');
  });

  it('replaces a regular space before `?` with a non-breaking space (French typography)', () => {
    const raw = `## Général

### Qu'est-ce que BIM ?
Une réponse.`;
    const result = parseFaqMarkdown(raw);
    expect(result[0]?.items[0]?.question).toBe('Qu\'est-ce que BIM\u00A0?');
  });

  it('leaves English questions with no space before `?` unchanged', () => {
    const raw = `## General

### What is BIM?
An answer.`;
    const result = parseFaqMarkdown(raw);
    expect(result[0]?.items[0]?.question).toBe('What is BIM?');
  });

  it('does not treat `##`/`###` in the middle of a line as headings', () => {
    const raw = `## General

### Hash in prose
This mentions ### but not at line start, and ## neither.`;
    const result = parseFaqMarkdown(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1);
    expect(result[0]?.items[0]?.question).toBe('Hash in prose');
  });
});
