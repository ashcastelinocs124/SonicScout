import { request } from "undici";
import * as cheerio from "cheerio";
import { callLLM } from "../agents/llm.js";
import { getFirecrawl } from "./firecrawl.js";
import { logger } from "../log.js";

export interface Anchor { label: string; url: string }

const PICKER_SYSTEM = `You are a URL classifier. Given a list of links from a company website,
return up to 3 URLs most likely to contain founder, leadership, or team information.
Output ONLY raw JSON with shape: {"urls": string[]}.
Return {"urls": []} if none look plausible.
You may ONLY return URLs that appear verbatim in the provided list. Do not invent paths.`;

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;
const FILE_EXT = /\.(pdf|zip|png|jpg|jpeg|gif|svg|mp4|mp3|csv|xlsx?|docx?)$/i;

const MAX_ANCHORS = 50;
const MAX_PICKS = 3;
const PICKER_MAX_TOKENS = 500;

export async function extractAnchors(companyUrl: string): Promise<Anchor[]> {
  const res = await request(companyUrl);
  const html = await res.body.text();
  const $ = cheerio.load(html);
  const origin = new URL(companyUrl).origin;
  const seen = new Set<string>();
  const out: Anchor[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || SKIP_SCHEMES.test(href)) return;
    let absolute: string;
    try { absolute = new URL(href, companyUrl).toString(); }
    catch { return; }
    if (!absolute.startsWith(origin)) return;
    if (FILE_EXT.test(absolute)) return;
    const normalized = absolute.split("#")[0]!;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (!label) return;
    out.push({ label, url: normalized });
  });
  return out.slice(0, MAX_ANCHORS);
}

function buildPickerUser(anchors: Anchor[]): string {
  return [
    "Candidate links (label → url):",
    ...anchors.map((a) => `[${a.label}] ${a.url}`),
  ].join("\n");
}

function parsePickerOutput(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const urls = Array.isArray(parsed?.urls) ? parsed.urls : [];
    return urls.filter((u: unknown): u is string => typeof u === "string");
  } catch {
    return [];
  }
}

export async function pickTeamUrls(companyUrl: string): Promise<string[]> {
  let anchors: Anchor[] = [];
  try {
    anchors = await extractAnchors(companyUrl);
  } catch (err) {
    logger.warn({ err, companyUrl }, "teamPicker anchor fetch failed");
  }
  if (anchors.length > 0) {
    const raw = await callLLM({
      system: PICKER_SYSTEM,
      user: buildPickerUser(anchors),
      model: "gpt-5-mini",
      maxTokens: PICKER_MAX_TOKENS,
    });
    const candidates = new Set(anchors.map((a) => a.url));
    const picked = parsePickerOutput(raw).filter((u) => candidates.has(u)).slice(0, MAX_PICKS);
    if (picked.length > 0) return picked;
  }

  // Path B: Firecrawl /map fallback
  const fc = getFirecrawl();
  if (!fc) return [];
  let mapLinks: string[] = [];
  try {
    const res = await fc.map(companyUrl);
    mapLinks = (res?.links ?? [])
      .map((l: { url: string }) => l.url)
      .filter((u: unknown): u is string => typeof u === "string");
  } catch (err) {
    logger.warn({ err, companyUrl }, "teamPicker fc.map failed");
    return [];
  }
  if (mapLinks.length === 0) return [];

  const rawB = await callLLM({
    system: PICKER_SYSTEM,
    user: ["Candidate URLs (no labels available):", ...mapLinks].join("\n"),
    model: "gpt-5-mini",
    maxTokens: PICKER_MAX_TOKENS,
  });
  const mapSet = new Set(mapLinks);
  return parsePickerOutput(rawB).filter((u) => mapSet.has(u)).slice(0, MAX_PICKS);
}
