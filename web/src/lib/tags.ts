// Pull "#tag" tokens out of free text. A # only counts at a word boundary
// (start or after whitespace) so "C#" in a title isn't mistaken for a tag.
const TAG_RE = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;

export interface ParsedInput {
  title: string;
  tags: string[];
}

export function parseTags(raw: string): ParsedInput {
  const tags: string[] = [];
  const title = raw
    .replace(TAG_RE, (_m, pre, tag) => {
      tags.push(tag.toLowerCase().slice(0, 24));
      return pre; // keep the boundary whitespace, drop the #tag
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags: [...new Set(tags)].slice(0, 8) };
}
