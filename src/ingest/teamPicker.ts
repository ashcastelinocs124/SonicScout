import { request } from "undici";
import * as cheerio from "cheerio";

export interface Anchor { label: string; url: string }

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;
const FILE_EXT = /\.(pdf|zip|png|jpg|jpeg|gif|svg|mp4|mp3|csv|xlsx?|docx?)$/i;

export async function _extractAnchorsForTests(companyUrl: string): Promise<Anchor[]> {
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
  return out.slice(0, 50);
}
