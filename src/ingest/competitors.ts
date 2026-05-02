import { z } from "zod";
import { callLLMWithSearch } from "../agents/llm.js";
import { logger } from "../log.js";

export interface Competitor {
  name: string;
  url?: string;
  positioning: string;
  source: string;
}

const MAX_COMPETITORS = 3;
const WEBSITE_CONTEXT_CHARS = 2000;

const COMPETITOR_SYSTEM = `You are a venture-research assistant. Given a company URL and a snippet of its website content, use the web_search tool to identify exactly 3 real competitors. For each competitor, you MUST cite a URL that the web_search tool actually returned to you — do NOT invent URLs.

Output ONLY raw JSON with shape:
  {"competitors":[{"name":string,"url"?:string,"positioning":string,"source":string}]}

Constraints:
- Do NOT include the company itself or its parent/subsidiary.
- Do NOT use the company's own website as a source.
- "positioning" is one sentence describing how they compete.
- "source" is a URL from your search results that supports the claim.
- Return {"competitors":[]} if you cannot find 3 grounded competitors.`;

const CompetitorsSchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string().min(1),
      url: z.string().url().optional(),
      positioning: z.string().min(1),
      source: z.string().url(),
    }),
  ).default([]),
});

function safeHost(u: string): string | null {
  try { return new URL(u).host; } catch { return null; }
}

export async function discoverCompetitors(
  companyUrl: string,
  websiteText: string,
): Promise<Competitor[]> {
  if (!companyUrl || !websiteText) return [];

  let res;
  try {
    res = await callLLMWithSearch({
      model: "gpt-5-mini",
      system: COMPETITOR_SYSTEM,
      user: `Company URL: ${companyUrl}\n\nWebsite content:\n${websiteText.slice(0, WEBSITE_CONTEXT_CHARS)}`,
    });
  } catch (err) {
    logger.warn({ err, companyUrl }, "competitor search call failed");
    return [];
  }

  let parsed;
  try {
    parsed = CompetitorsSchema.safeParse(JSON.parse(res.text.trim()));
  } catch (err) {
    logger.warn({ err, companyUrl }, "competitor JSON parse failed");
    return [];
  }
  if (!parsed.success) {
    logger.warn({ companyUrl, issues: parsed.error.issues }, "competitor schema failed");
    return [];
  }

  const companyHost = safeHost(companyUrl);
  return parsed.data.competitors
    .filter((c) => {
      const sourceHost = safeHost(c.source);
      if (!sourceHost) return false;
      if (sourceHost === companyHost) return false;
      if (!res.citationHosts.has(sourceHost)) {
        logger.warn({ companyUrl, name: c.name, source: c.source }, "competitor source not in retrieved citations — dropping");
        return false;
      }
      return true;
    })
    .slice(0, MAX_COMPETITORS);
}
