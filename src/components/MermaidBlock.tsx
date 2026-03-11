"use client";

import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";
import { normalizeMermaidChart } from "@/lib/mermaid";

type MermaidBlockProps = {
  chart: string;
};

type MermaidRenderState = {
  chart: string;
  svg: string;
  error: string | null;
};

export default function MermaidBlock({ chart }: MermaidBlockProps) {
  const [renderState, setRenderState] = useState<MermaidRenderState>({
    chart: "",
    svg: "",
    error: null,
  });
  const id = useId().replace(/:/g, "");
  const normalizedChart = normalizeMermaidChart(chart);

  useEffect(() => {
    let isActive = true;

    mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
    });

    const render = async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, normalizedChart);
        if (isActive) {
          setRenderState({
            chart: normalizedChart,
            svg,
            error: null,
          });
        }
      } catch (err) {
        if (isActive) {
          console.error("Mermaid render failed", err);
          setRenderState({
            chart: normalizedChart,
            svg: "",
            error: "Diagram could not be rendered. Showing source instead.",
          });
        }
      }
    };

    void render();
    return () => {
      isActive = false;
    };
  }, [id, normalizedChart]);

  if (renderState.chart === normalizedChart && renderState.error) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--color-danger)]">{renderState.error}</div>
        <pre className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 text-xs text-[var(--color-text-secondary)]">
          {normalizedChart}
        </pre>
      </div>
    );
  }

  if (renderState.chart !== normalizedChart || !renderState.svg) {
    return (
      <div className="text-xs font-medium text-[var(--color-text-tertiary)]">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: renderState.svg }}
    />
  );
}
