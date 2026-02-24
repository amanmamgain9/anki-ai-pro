"use client";

import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";

type MermaidBlockProps = {
  chart: string;
};

export default function MermaidBlock({ chart }: MermaidBlockProps) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    let isActive = true;
    setSvg("");
    setError(null);

    mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
    });

    const render = async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        if (isActive) {
          setSvg(svg);
        }
      } catch (err) {
        if (isActive) {
          setError(
            err instanceof Error ? err.message : "Unable to render diagram.",
          );
        }
      }
    };

    void render();
    return () => {
      isActive = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-4 text-xs text-[var(--color-danger)]">
        {error}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="text-xs font-medium text-[var(--color-text-tertiary)]">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
