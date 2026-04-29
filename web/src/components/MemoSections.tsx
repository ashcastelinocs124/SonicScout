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
  verified:    "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 mx-0.5",
  inferred:    "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 mx-0.5",
  speculative: "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 mx-0.5",
};

function renderTagged(text: string) {
  const parts = text.split(/(\[verified\]|\[inferred\]|\[speculative\])/g);
  return parts.map((p, i) => {
    if (p === "[verified]")    return <span key={i} className={PILL.verified}>verified</span>;
    if (p === "[inferred]")    return <span key={i} className={PILL.inferred}>inferred</span>;
    if (p === "[speculative]") return <span key={i} className={PILL.speculative}>speculative</span>;
    return <span key={i}>{p}</span>;
  });
}

export function MemoSections({ memo }: { memo: Memo }) {
  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-8">
      <Tabs defaultValue="market" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-zinc-800">
              {renderTagged(memo.sections[t.key] ?? "(no output)")}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
