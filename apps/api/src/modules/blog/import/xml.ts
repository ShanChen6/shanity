/**
 * A small, strict-enough XML reader for the Office Open XML parts of a .docx
 * (well-formed, no DTD). It builds a plain tree; it never resolves external
 * entities or DOCTYPEs, so there is nothing to expand or fetch.
 */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    return ENTITIES[body] ?? whole;
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(source: string, maxNodes = 2_000_000): XmlElement {
  const root: XmlElement = { name: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let index = 0;
  let nodes = 0;
  const length = source.length;
  while (index < length) {
    const open = source.indexOf('<', index);
    const textEnd = open === -1 ? length : open;
    if (textEnd > index) {
      const text = source.slice(index, textEnd);
      if (text.trim() || stack.length > 1)
        stack[stack.length - 1]!.children.push(decodeEntities(text));
    }
    if (open === -1) break;
    if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open);
      if (end === -1) throw new Error('Unterminated declaration');
      index = end + 2;
      continue;
    }
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open);
      if (end === -1) throw new Error('Unterminated comment');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open);
      if (end === -1) throw new Error('Unterminated CDATA');
      stack[stack.length - 1]!.children.push(source.slice(open + 9, end));
      index = end + 3;
      continue;
    }
    if (source.startsWith('<!', open)) throw new Error('DOCTYPE not allowed');
    const close = source.indexOf('>', open);
    if (close === -1) throw new Error('Unterminated tag');
    const tag = source.slice(open + 1, close);
    index = close + 1;
    if (tag[0] === '/') {
      const name = tag.slice(1).trim();
      const top = stack.pop();
      if (!top || top.name !== name || stack.length === 0)
        throw new Error(`Mismatched </${name}>`);
      continue;
    }
    if (++nodes > maxNodes) throw new Error('Document too large');
    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const space = body.search(/\s/);
    const name = space === -1 ? body : body.slice(0, space);
    const attrs: Record<string, string> = {};
    if (space !== -1)
      for (const match of body.slice(space).matchAll(ATTR))
        attrs[match[1]!] = decodeEntities(match[3] ?? match[4] ?? '');
    const element: XmlElement = { name, attrs, children: [] };
    stack[stack.length - 1]!.children.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length !== 1) throw new Error('Unclosed elements');
  const first = root.children.find(
    (child): child is XmlElement => typeof child !== 'string',
  );
  if (!first) throw new Error('Empty document');
  return first;
}

export const elements = (node: XmlElement, name?: string) =>
  node.children.filter(
    (child): child is XmlElement =>
      typeof child !== 'string' && (!name || child.name === name),
  );

export const child = (node: XmlElement | undefined, name: string) =>
  node?.children.find(
    (item): item is XmlElement => typeof item !== 'string' && item.name === name,
  );

/** Every descendant element with this name, in document order. */
export function descendants(node: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (current: XmlElement) => {
    for (const item of current.children)
      if (typeof item !== 'string') {
        if (item.name === name) found.push(item);
        walk(item);
      }
  };
  walk(node);
  return found;
}

/** Concatenated text of a subtree. */
export function textContent(node: XmlNode): string {
  return typeof node === 'string'
    ? node
    : node.children.map(textContent).join('');
}
