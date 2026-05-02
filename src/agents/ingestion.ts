import { extractPdf } from "../ingest/pdf.js";
import { extractWeb } from "../ingest/web.js";
import { discoverFounders, scrapeProfile } from "../ingest/founders.js";
import { discoverCompetitors } from "../ingest/competitors.js";
import type { IngestedContext } from "../types.js";

export interface IngestArgs {
  deckPath?: string;
  whitepaperPath?: string;
  websitePath?: string;
  founderProfileUrls?: string[];
}

async function resolveFounderUrls(a: IngestArgs): Promise<string[]> {
  const explicit = a.founderProfileUrls ?? [];
  if (!a.websitePath) return explicit;
  const discovered = await discoverFounders(a.websitePath);
  const urls = discovered
    .map((d) => d.linkedinUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  return Array.from(new Set([...explicit, ...urls]));
}

export async function ingest(a: IngestArgs): Promise<IngestedContext> {
  const [deckText, whitepaperText, websiteText, founderUrls] = await Promise.all([
    a.deckPath ? extractPdf(a.deckPath) : Promise.resolve(undefined),
    a.whitepaperPath ? extractPdf(a.whitepaperPath) : Promise.resolve(undefined),
    a.websitePath ? extractWeb(a.websitePath) : Promise.resolve(undefined),
    resolveFounderUrls(a),
  ]);
  const founderProfiles = await Promise.all(founderUrls.map(scrapeProfile));
  const competitors = a.websitePath && websiteText
    ? await discoverCompetitors(a.websitePath, websiteText)
    : [];
  return {
    url: a.websitePath,
    deckText,
    whitepaperText,
    websiteText,
    founderProfiles,
    competitors,
    rawMetadata: {},
  };
}
