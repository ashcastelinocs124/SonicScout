import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Memo } from "../types";

const TABS = [
  { key: "market",     label: "Market Map" },
  { key: "founder",    label: "Founder Signal" },
  { key: "product",    label: "Product" },
  { key: "tokenomics", label: "Tokenomics" },
  { key: "risk",       label: "Trust & Risk" },
];

const PILL = {
  verified:    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 mx-0.5 align-middle",
  inferred:    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-100  text-amber-800  ring-1 ring-amber-200  mx-0.5 align-middle",
  speculative: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-rose-100   text-rose-800   ring-1 ring-rose-200   mx-0.5 align-middle",
};

function renderTaggedString(text: string): React.ReactNode {
  const parts = text.split(/(\[verified\]|\[inferred\]|\[speculative\])/g);
  return parts.map((p, i) => {
    if (p === "[verified]")    return <span key={i} className={PILL.verified}>verified</span>;
    if (p === "[inferred]")    return <span key={i} className={PILL.inferred}>inferred</span>;
    if (p === "[speculative]") return <span key={i} className={PILL.speculative}>speculative</span>;
    return p;
  });
}

function transformChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") return renderTaggedString(child);
    if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      return React.cloneElement(
        child,
        {},
        transformChildren(props.children),
      );
    }
    return child;
  });
}

const wrap = <T extends keyof React.JSX.IntrinsicElements>(Tag: T) =>
  ({ children, ...rest }: { children?: React.ReactNode }) =>
    React.createElement(Tag, rest, transformChildren(children));

const components = {
  p:          wrap("p"),
  li:         wrap("li"),
  td:         wrap("td"),
  th:         wrap("th"),
  h1:         wrap("h1"),
  h2:         wrap("h2"),
  h3:         wrap("h3"),
  h4:         wrap("h4"),
  blockquote: wrap("blockquote"),
};

export function MemoSections({ memo }: { memo: Memo }) {
  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-8">
      <Tabs defaultValue="market" className="w-full flex-col">
        <TabsList className="grid grid-cols-5 w-full">
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <article
              className="
                prose prose-zinc prose-sm md:prose-base max-w-none
                prose-headings:font-semibold prose-headings:text-zinc-900
                prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base
                prose-p:leading-relaxed prose-p:text-zinc-800
                prose-li:my-1 prose-ul:my-2 prose-ol:my-2
                prose-strong:text-zinc-900
                prose-blockquote:border-l-4 prose-blockquote:border-emerald-300
                prose-blockquote:bg-emerald-50/40 prose-blockquote:py-2 prose-blockquote:px-4
                prose-blockquote:not-italic prose-blockquote:text-zinc-700
                prose-a:text-emerald-700 prose-a:no-underline hover:prose-a:underline
              "
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {memo.sections[t.key] ?? "(no output)"}
              </ReactMarkdown>
            </article>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
