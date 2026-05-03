import { z } from "zod";
import { request } from "undici";
import * as cheerio from "cheerio";
import { callLLM } from "./llm.js";
import { pickThesisUrls } from "../ingest/thesisPicker.js";
import { getFirecrawl } from "../ingest/firecrawl.js";
import { logger } from "../log.js";

export interface DraftThesis {
  marketBeliefs: string;
  founderFilters: string;
  tokenStance: string;
  antiPatterns: string;
}

const EMPTY: DraftThesis = {
  marketBeliefs: "", founderFilters: "", tokenStance: "", antiPatterns: "",
};

const MAX_VC_CONTENT_CHARS = 30000;

const DraftSchema = z.object({
  marketBeliefs: z.string(),
  founderFilters: z.string(),
  tokenStance: z.string(),
  antiPatterns: z.string(),
});

const EXTRACT_SYSTEM = `You are a venture-capital research assistant. Given a VC firm's website content,
extract their investment thesis in four sections.

Output ONLY raw JSON with shape:
  {"marketBeliefs": string, "founderFilters": string, "tokenStance": string, "antiPatterns": string}

Each value must be a markdown bullet list (one bullet per line, prefixed with "- ").

Section guidance:
- marketBeliefs: what categories/sectors/trends this firm believes will win
- founderFilters: what makes them say yes or no to a founding team
- tokenStance: their position on token vs equity (use "- Equity-only firm." if no crypto stance is stated)
- antiPatterns: deal characteristics that get auto-rejected

Return empty strings for any section you cannot ground in the provided content.`;

async function fetchHomepageText(vcUrl: string): Promise<string> {
  try {
    const res = await request(vcUrl);
    const html = await res.body.text();
    const $ = cheerio.load(html);
    $("script,style,nav,footer").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  } catch (err) {
    logger.warn({ err, vcUrl }, "thesisGenerator homepage fetch failed");
    return "";
  }
}

async function fetchSubpages(urls: string[]): Promise<Array<{ url: string; markdown: string }>> {
  const fc = getFirecrawl();
  if (!fc) return [];
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const doc = await fc.scrape(url, { formats: ["markdown"] });
        return { url, markdown: doc?.markdown ?? "" };
      } catch (err) {
        logger.warn({ err, url }, "thesisGenerator scrape failed");
        return { url, markdown: "" };
      }
    }),
  );
  return results.filter((r) => r.markdown.length > 0);
}

export async function generateThesis(vcUrl: string): Promise<DraftThesis> {
  const [homepageText, picked] = await Promise.all([
    fetchHomepageText(vcUrl),
    pickThesisUrls(vcUrl),
  ]);
  const subpages = await fetchSubpages(picked);
  const sections: string[] = [];
  if (homepageText) sections.push(`## Homepage (${vcUrl})\n${homepageText}`);
  for (const s of subpages) sections.push(`## Subpage (${s.url})\n${s.markdown}`);
  const vcContent = sections.join("\n\n").slice(0, MAX_VC_CONTENT_CHARS);
  if (!vcContent) {
    logger.warn({ vcUrl }, "thesisGenerator: no content to extract from");
    return EMPTY;
  }
  let raw: string;
  try {
    raw = await callLLM({
      system: EXTRACT_SYSTEM,
      user: `VC firm URL: ${vcUrl}\n\nContent:\n${vcContent}`,
      model: "gpt-5",
    });
  } catch (err) {
    logger.warn({ err, vcUrl }, "thesisGenerator LLM call failed");
    return EMPTY;
  }
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw.trim()));
    if (!parsed.success) {
      logger.warn({ vcUrl, issues: parsed.error.issues }, "thesisGenerator schema failed");
      return EMPTY;
    }
    return parsed.data;
  } catch (err) {
    logger.warn({ err, vcUrl }, "thesisGenerator JSON parse failed");
    return EMPTY;
  }
}
