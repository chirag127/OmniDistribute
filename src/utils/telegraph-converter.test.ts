import { describe, expect, it } from "vitest";
import { markdownToTelegraph } from "./telegraph-converter.js";

describe("markdownToTelegraph", () => {
  it("maps h1/h2 to h3 (Telegraph only supports h3/h4)", () => {
    const [h1] = markdownToTelegraph("# Title");
    expect(h1.tag).toBe("h3");
    const [h2] = markdownToTelegraph("## Subtitle");
    expect(h2.tag).toBe("h3");
  });

  it("maps h3+ to h4", () => {
    const [h3] = markdownToTelegraph("### Deep");
    expect(h3.tag).toBe("h4");
    const [h4] = markdownToTelegraph("#### Deeper");
    expect(h4.tag).toBe("h4");
  });

  it("converts paragraphs to <p> nodes", () => {
    const [node] = markdownToTelegraph("Just a paragraph.");
    expect(node.tag).toBe("p");
    expect(node.children).toContain("Just a paragraph.");
  });

  it("converts bold and italic inline markup", () => {
    const [para] = markdownToTelegraph("This is **bold** and *italic*.");
    const tags = (para.children ?? [])
      .filter((c): c is { tag?: string } => typeof c === "object")
      .map((c) => c.tag);
    expect(tags).toContain("b");
    expect(tags).toContain("i");
  });

  it("converts links to <a> with href attr", () => {
    const [para] = markdownToTelegraph("[link](https://example.com)");
    const anchor = (para.children ?? []).find(
      (c): c is { tag?: string; attrs?: Record<string, string> } =>
        typeof c === "object" && c.tag === "a",
    );
    expect(anchor?.attrs?.href).toBe("https://example.com");
  });

  it("converts unordered lists to <ul> with <li> items", () => {
    const [list] = markdownToTelegraph("- one\n- two");
    expect(list.tag).toBe("ul");
    expect(list.children).toHaveLength(2);
    const [li] = list.children as { tag?: string }[];
    expect(li.tag).toBe("li");
  });

  it("converts ordered lists to <ol>", () => {
    const [list] = markdownToTelegraph("1. first\n2. second");
    expect(list.tag).toBe("ol");
  });

  it("converts fenced code to <pre><code>", () => {
    const [pre] = markdownToTelegraph("```\nconst x = 1;\n```");
    expect(pre.tag).toBe("pre");
    const code = (pre.children ?? [])[0] as { tag?: string; children?: unknown[] };
    expect(code.tag).toBe("code");
    expect(code.children?.[0]).toContain("const x = 1;");
  });

  it("converts blockquotes", () => {
    const [bq] = markdownToTelegraph("> quoted");
    expect(bq.tag).toBe("blockquote");
  });

  it("converts horizontal rules to <hr>", () => {
    const nodes = markdownToTelegraph("text\n\n---\n\nmore");
    expect(nodes.some((n) => n.tag === "hr")).toBe(true);
  });

  it("renders a standalone image as an inline '[Image: alt]' inside a paragraph", () => {
    // marked lexes a lone image as a paragraph wrapping an inline image token,
    // so convertInline renders it as descriptive text (Telegraph has no good
    // inline-image element). This asserts the converter's real behavior.
    const [para] = markdownToTelegraph("![alt text](https://example.com/i.png)");
    expect(para.tag).toBe("p");
    expect(para.children).toContain("[Image: alt text]");
  });

  it("returns an empty array for empty input", () => {
    expect(markdownToTelegraph("")).toEqual([]);
  });
});
