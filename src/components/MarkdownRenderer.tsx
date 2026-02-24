"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import MermaidBlock from "./MermaidBlock";

type MarkdownRendererProps = {
  content: string;
};

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
            if (child?.props?.className === "language-mermaid") {
              return <MermaidBlock chart={String(child.props.children).replace(/\n$/, "")} />;
            }
            return <pre>{children}</pre>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? "");
            if (match?.[1] === "mermaid") {
              return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
