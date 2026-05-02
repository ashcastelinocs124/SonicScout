import { z } from "zod";
import { getFirecrawl } from "./firecrawl.js";
import { pickTeamUrls } from "./teamPicker.js";
import { logger } from "../log.js";

export interface DiscoveredFounder {
  name: string;
  title?: string;
  linkedinUrl?: string;
}

const FoundersSchema = z.object({
  companyName: z.string().optional(),
  founders: z.array(
    z.object({
      name: z.string(),
      title: z.string().optional(),
      linkedinUrl: z.string().url().optional(),
    }),
  ),
});

const PROMPT =
  "Extract the founders, co-founders, and C-level leadership of this company. " +
  "Include their LinkedIn URLs if linked anywhere on the page.";

export async function discoverFounders(
  companyUrl: string,
): Promise<DiscoveredFounder[]> {
  const fc = getFirecrawl();
  if (!fc) {
    logger.warn(
      { companyUrl },
      "FIRECRAWL_API_KEY unset — skipping founder discovery",
    );
    return [];
  }
  const teamUrls = await pickTeamUrls(companyUrl);
  if (teamUrls.length === 0) {
    logger.info(
      { companyUrl },
      "teamPicker found no team pages — skipping extract",
    );
    return [];
  }
  try {
    const res = await fc.extract({
      urls: teamUrls,
      // SDK bundles its own zod@3 internally; our project uses zod@4. The two
      // ZodType nominal types are incompatible at the type level even though
      // the runtime behavior is identical, so we cast here.
      schema: FoundersSchema as unknown as Parameters<typeof fc.extract>[0]["schema"],
      prompt: PROMPT,
    });
    if (!res?.success || !res.data) {
      logger.warn(
        { companyUrl, error: (res as { error?: string })?.error },
        "firecrawl extract returned no data",
      );
      return [];
    }
    const parsed = FoundersSchema.safeParse(res.data);
    if (!parsed.success) {
      logger.warn(
        { companyUrl, issues: parsed.error.issues },
        "firecrawl extract failed schema",
      );
      return [];
    }
    return parsed.data.founders;
  } catch (err) {
    logger.warn({ err, companyUrl }, "firecrawl extract threw — degrading");
    return [];
  }
}

export async function scrapeProfile(
  url: string,
): Promise<{ url: string; text: string }> {
  const fc = getFirecrawl();
  if (!fc) return { url, text: "" };
  try {
    // v2 Firecrawl.scrape() resolves to a Document with markdown at the top
    // level (no { success, data } envelope). See @mendable/firecrawl-js types.
    const doc = await fc.scrape(url, { formats: ["markdown"] });
    const markdown = doc?.markdown;
    if (!markdown) {
      logger.warn({ url }, "firecrawl scrape returned no markdown");
      return { url, text: "" };
    }
    return { url, text: markdown.slice(0, 8000) };
  } catch (err) {
    logger.warn({ err, url }, "firecrawl scrape threw — degrading");
    return { url, text: "" };
  }
}
