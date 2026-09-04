// Dependency-free XML helpers for the EFS SOAP client.
// Namespace prefixes are stripped, repeated siblings collapse into arrays,
// and text nodes are returned as trimmed strings.

export type XmlNode = string | { [key: string]: XmlValue };
export type XmlValue = XmlNode | XmlNode[];

const stripPrefix = (name: string) => {
  const idx = name.indexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
};

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function assign(target: Record<string, XmlValue>, key: string, value: XmlNode) {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[key] = [existing, value];
  }
}

interface Token {
  kind: "open" | "close" | "selfClose" | "text";
  name: string;
  text: string;
}

function tokenize(xml: string): Token[] {
  const tokens: Token[] = [];
  // Drop declarations, comments, doctypes and CDATA wrappers (content kept).
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner) => escapeXml(String(inner)));

  const tagRe = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)([^>]*?)(\/?)\s*>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(cleaned)) !== null) {
    const text = cleaned.slice(cursor, match.index);
    if (text.trim()) tokens.push({ kind: "text", name: "", text: decodeEntities(text.trim()) });
    const name = stripPrefix(match[2]);
    if (match[1]) tokens.push({ kind: "close", name, text: "" });
    else if (match[4]) tokens.push({ kind: "selfClose", name, text: "" });
    else tokens.push({ kind: "open", name, text: "" });
    cursor = tagRe.lastIndex;
  }
  const tail = cleaned.slice(cursor);
  if (tail.trim()) tokens.push({ kind: "text", name: "", text: decodeEntities(tail.trim()) });
  return tokens;
}

/** Parses an XML document into a plain object tree. Never throws on malformed input. */
export function parseXml(xml: string): Record<string, XmlValue> {
  const root: Record<string, XmlValue> = {};
  const stack: { name: string; children: Record<string, XmlValue>; text: string }[] = [
    { name: "#root", children: root, text: "" },
  ];

  for (const token of tokenize(xml)) {
    const top = stack[stack.length - 1];
    if (token.kind === "text") {
      top.text += token.text;
    } else if (token.kind === "selfClose") {
      assign(top.children, token.name, "");
    } else if (token.kind === "open") {
      stack.push({ name: token.name, children: {}, text: "" });
    } else {
      // Close: unwind to the matching open tag so stray closers cannot corrupt the tree.
      let depth = stack.length - 1;
      while (depth > 0 && stack[depth].name !== token.name) depth -= 1;
      if (depth === 0) continue;
      while (stack.length - 1 >= depth) {
        const frame = stack.pop()!;
        const parent = stack[stack.length - 1];
        const hasChildren = Object.keys(frame.children).length > 0;
        assign(parent.children, frame.name, hasChildren ? frame.children : frame.text);
      }
    }
  }

  return root;
}

/** Serializes a plain object tree back to XML, preserving arrays as repeated elements. */
export function buildXml(value: XmlValue, prefix = ""): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => buildXml(item, prefix)).join("");
  if (typeof value !== "object") return escapeXml(String(value));

  return Object.entries(value)
    .map(([key, child]) => {
      const tag = prefix ? `${prefix}${key}` : key;
      if (Array.isArray(child)) {
        return child.map((item) => `<${tag}>${buildXml(item as XmlValue, prefix)}</${tag}>`).join("");
      }
      if (child === null || child === undefined) return "";
      if (typeof child === "object") return `<${tag}>${buildXml(child, prefix)}</${tag}>`;
      return `<${tag}>${escapeXml(String(child))}</${tag}>`;
    })
    .join("");
}
