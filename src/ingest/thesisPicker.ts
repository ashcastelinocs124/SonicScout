// Intentionally parallel to teamPicker.ts. Keep extractAnchors, parsePickerOutput,
// the SKIP_SCHEMES/FILE_EXT regexes, and the MAX_* constants in lockstep when
// editing either file. At a 3rd caller, extract a shared helper.
import { request } from "undici";
import * as cheerio from "cheerio";
import { callLLM } from "../agents/llm.js";
import { logger } from "../log.js";

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;
const FILE_EXT = /\.(pdf|zip|png|jpg|jpeg|gif|svg|mp4|mp3|csv|xlsx?|docx?)$/i;
const MAX_ANCHORS = 50;
const MAX_PICKS = 3;
const PICKER_MAX_TOKENS = 500;

const PICKER_SYSTEM = `You are a URL classifier. Given a list of links from a venture-capital firm's website,
return up to 3 URLs most likely to contain investment thesis, focus areas, portfolio approach,
manifesto, or partner philosophy content.
Output ONLY raw JSON with shape: {"urls": string[]}.
Return {"urls": []} if none look plausible.
You may ONLY return URLs that appear verbatim in the provided list. Do not invent paths.`;

interface Anchor { label: string; url: string }

async function extractAnchors(vcUrl: string): Promise<Anchor[]> {
  const res = await request(vcUrl);
  const html = await res.body.text();
  const $ = cheerio.load(html);
  const origin = new URL(vcUrl).origin;
  const seen = new Set<string>();
  const out: Anchor[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || SKIP_SCHEMES.test(href)) return;
    let absolute: string;
    try { absolute = new URL(href, vcUrl).toString(); } catch { return; }
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

function parsePickerOutput(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const urls = Array.isArray(parsed?.urls) ? parsed.urls : [];
    return urls.filter((u: unknown): u is string => typeof u === "string");
  } catch { return []; }
}

export async function pickThesisUrls(vcUrl: string): Promise<string[]> {
  let anchors: Anchor[] = [];
  try { anchors = await extractAnchors(vcUrl); }
  catch (err) { logger.warn({ err, vcUrl }, "thesisPicker fetch failed"); return []; }
  if (anchors.length === 0) return [];
  const raw = await callLLM({
    system: PICKER_SYSTEM,
    user: ["Candidate links (label → url):", ...anchors.map((a) => `[${a.label}] ${a.url}`)].join("\n"),
    model: "gpt-5-mini",
    maxTokens: PICKER_MAX_TOKENS,
  });
  const candidates = new Set(anchors.map((a) => a.url));
  return parsePickerOutput(raw).filter((u) => candidates.has(u)).slice(0, MAX_PICKS);
}
