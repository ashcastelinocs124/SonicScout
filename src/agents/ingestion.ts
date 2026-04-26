import { extractPdf } from "../ingest/pdf.js";
import { extractWeb } from "../ingest/web.js";
import { extractLinkedIn } from "../ingest/linkedin.js";
import type { IngestedContext } from "../types.js";

export interface IngestArgs {
  deckPath?: string;
  whitepaperPath?: string;
  websitePath?: string;
  founderProfileUrls?: string[];
}

export async function ingest(a: IngestArgs): Promise<IngestedContext> {
  const [deckText, whitepaperText, websiteText, founderProfiles] = await Promise.all([
    a.deckPath ? extractPdf(a.deckPath) : Promise.resolve(undefined),
    a.whitepaperPath ? extractPdf(a.whitepaperPath) : Promise.resolve(undefined),
    a.websitePath ? extractWeb(a.websitePath) : Promise.resolve(undefined),
    Promise.all((a.founderProfileUrls ?? []).map(extractLinkedIn)),
  ]);
  return {
    url: a.websitePath,
    deckText,
    whitepaperText,
    websiteText,
    founderProfiles,
    rawMetadata: {},
  };
}
