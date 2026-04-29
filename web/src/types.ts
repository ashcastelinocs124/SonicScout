export type Recommendation = "Pass" | "Watch" | "Take Meeting" | "Invest";
export type Phase = "ingestion" | "market" | "founder" | "product" | "tokenomics" | "risk" | "memo";
export interface Memo {
  recommendation: Recommendation;
  thesis: string[];
  risks: string[];
  sections: Record<string, string>;
}
export type RunStatus = "pending" | "running" | "completed" | "failed";
export interface RunSnapshot {
  id: number;
  status: RunStatus;
  url: string | null;
  memo: Memo | null;
}
