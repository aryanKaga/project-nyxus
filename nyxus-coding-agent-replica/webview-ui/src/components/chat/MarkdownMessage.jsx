import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
  themeVariables: {
    darkMode: true,
    background: "#16161f",
    primaryColor: "#7c6af7",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#7c6af7",
    lineColor: "#8b949e",
    secondaryColor: "#1e1e2d",
    tertiaryColor: "#252538",
  },
});

function MermaidBlock({ code }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);
  const rawId = useId();
  const id = `mermaid_${rawId.replace(/[^a-zA-Z0-9]/g, "_")}`;

  useEffect(() => {
    let active = true;
    async function render() {
      try {
        const renderId = `${id}_${Date.now()}`;
        const { svg: outSvg } = await mermaid.render(renderId, code);
        if (active) {
          setSvg(outSvg);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err?.message || "Failed to render diagram");
        }
      }
    }
    render();
    return () => {
      active = false;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="nyxus-mermaid-block error">
        <div className="nyxus-mermaid-header">Diagram (preview fallback)</div>
        <pre className="nyxus-code-block">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="nyxus-mermaid-block loading">
        <span className="nyxus-mermaid-loading-text">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      className="nyxus-mermaid-block"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), "className"],
    span: [...(defaultSchema.attributes?.span || []), "className", "style"],
    div: [...(defaultSchema.attributes?.div || []), "className", "style"],
    "*": [...(defaultSchema.attributes?.["*"] || []), "className"],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub",
    "msubsup", "mfrac", "msqrt", "mroot", "mtable", "mtr", "mtd",
    "mspace", "mtext", "mstyle", "annotation",
  ],
};

export default function MarkdownMessage({ content }) {
  return (
    <div className="nyxus-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          [rehypeSanitize, sanitizeSchema],
        ]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? match[1] : "";
            if (!inline && lang === "mermaid") {
              return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
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
