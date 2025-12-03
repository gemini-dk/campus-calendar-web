"use client";

import { useEffect, useMemo, type JSX } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faNoteSticky, faXmark } from "@fortawesome/free-solid-svg-icons";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))/g;

type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

type BlockNode =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "unorderedList"; items: InlineNode[][] }
  | { type: "orderedList"; items: InlineNode[][] }
  | { type: "code"; value: string };

const ALLOWED_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

function sanitizeHref(href: string): string | null {
  const trimmedHref = href.trim();
  const protocolMatch = trimmedHref.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);

  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (!ALLOWED_PROTOCOLS.includes(protocol)) {
      return null;
    }
  }

  return trimmedHref;
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  INLINE_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const token = match[0];

    if (token.startsWith("**")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("*")) {
      nodes.push({ type: "em", children: parseInline(token.slice(1, -1)) });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const parts = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (parts) {
        nodes.push({
          type: "link",
          href: parts[2],
          children: parseInline(parts[1]),
        });
      } else {
        nodes.push({ type: "text", value: token });
      }
    }

    lastIndex = INLINE_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", value: text.slice(lastIndex) });
  }

  return nodes;
}

function parseBlocks(markdown: string): BlockNode[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: BlockNode[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", value: codeLines.join("\n") });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: Math.min(6, headingMatch[1].length),
        children: parseInline(headingMatch[2]),
      });
      index += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: InlineNode[][] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        const content = lines[index].trim().replace(/^[-*+]\s+/, "");
        items.push(parseInline(content));
        index += 1;
      }
      blocks.push({ type: "unorderedList", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: InlineNode[][] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        const content = lines[index].trim().replace(/^\d+\.\s+/, "");
        items.push(parseInline(content));
        index += 1;
      }
      blocks.push({ type: "orderedList", items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^```/.test(lines[index].trim()) &&
      !/^[-*+]\s+/.test(lines[index].trim()) &&
      !/^\d+\.\s+/.test(lines[index].trim()) &&
      !/^#{1,6}\s+/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraphLines.join(" ")) });
  }

  return blocks;
}

type MarkdownRendererProps = {
  content: string;
};

function renderInline(nodes: InlineNode[]): (JSX.Element | null)[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return (
          <span key={`text-${index}`} className="whitespace-pre-wrap text-sm leading-6 text-neutral-900">
            {node.value}
          </span>
        );
      case "strong":
        return (
          <strong key={`strong-${index}`} className="text-sm font-semibold leading-6 text-neutral-900">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return (
          <em key={`em-${index}`} className="text-sm leading-6 text-neutral-900">
            {renderInline(node.children)}
          </em>
        );
      case "code":
        return (
          <code
            key={`code-${index}`}
            className="rounded bg-neutral-100 px-1 py-0.5 text-xs font-mono text-neutral-800"
          >
            {node.value}
          </code>
        );
      case "link":
        const safeHref = sanitizeHref(node.href);

        if (!safeHref) {
          return (
            <span key={`link-${index}`} className="text-sm font-semibold text-neutral-900">
              {renderInline(node.children)}
            </span>
          );
        }

        return (
          <a
            key={`link-${index}`}
            href={safeHref}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-blue-700 underline underline-offset-4"
          >
            {renderInline(node.children)}
          </a>
        );
      default:
        return null;
    }
  });
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  if (blocks.length === 0) {
    return (
      <p className="text-sm leading-7 text-neutral-600">表示できるメモがありません。</p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const headingStyles: Record<number, string> = {
            1: "text-2xl",
            2: "text-xl",
            3: "text-lg",
            4: "text-base",
            5: "text-sm",
            6: "text-xs",
          };
          return (
            <h2
              key={`heading-${index}`}
              className={`font-semibold leading-8 text-neutral-900 ${headingStyles[block.level] ?? "text-base"}`}
            >
              {renderInline(block.children)}
            </h2>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={`paragraph-${index}`} className="text-sm leading-6 text-neutral-900">
              {renderInline(block.children)}
            </p>
          );
        }

        if (block.type === "unorderedList") {
          return (
            <ul key={`ul-${index}`} className="ml-5 list-disc space-y-2 text-sm leading-6 text-neutral-900">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "orderedList") {
          return (
            <ol key={`ol-${index}`} className="ml-5 list-decimal space-y-2 text-sm leading-6 text-neutral-900">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`code-${index}`}
              className="w-full overflow-x-auto rounded-2xl bg-neutral-900 px-4 py-3 text-sm leading-6 text-white"
            >
              <code className="whitespace-pre-wrap">{block.value}</code>
            </pre>
          );
        }

        return null;
      })}
    </div>
  );
}

export type ClassMemoOverlayProps = {
  open: boolean;
  memo: string | null;
  onClose: () => void;
};

export default function ClassMemoOverlay({ open, memo, onClose }: ClassMemoOverlayProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const memoContent = memo?.trim() ?? "";
  const hasMemo = memoContent.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex h-[100svh] w-full flex-col bg-white">
      <header className="flex h-14 w-full flex-shrink-0 justify-center border-b border-neutral-200 bg-white">
        <div className="flex h-full w-full max-w-[800px] items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <FontAwesomeIcon icon={faNoteSticky} className="text-base" aria-hidden="true" />
            </span>
            <h1 className="text-lg font-semibold text-neutral-900">授業メモ</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="メモ表示を閉じる"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-100"
          >
            <FontAwesomeIcon icon={faXmark} fontSize={20} />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto bg-neutral-100">
        <div>
          <div className="flex w-full gap-4 px-5">
            {hasMemo ? (
              <MarkdownRenderer content={memoContent} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
                メモが登録されていません。
              </div>
            )}            
          </div>
          <div className="h-[100px]"></div>
        </div>
      </div>
    </div>
  );
}
