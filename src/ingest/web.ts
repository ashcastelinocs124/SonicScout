import * as cheerio from "cheerio";
import { request } from "undici";
import { readFile } from "node:fs/promises";

export async function extractWeb(input: string): Promise<string> {
  const html = input.startsWith("http")
    ? await (await request(input)).body.text()
    : await readFile(input, "utf8");
  const $ = cheerio.load(html);
  $("script,style,nav,footer").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
