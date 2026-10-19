import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";

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
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
