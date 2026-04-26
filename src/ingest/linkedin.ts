import { extractWeb } from "./web.js";
import { logger } from "../log.js";

export async function extractLinkedIn(url: string): Promise<{ url: string; text: string }> {
  try {
    const text = await extractWeb(url);
    return { url, text: text.slice(0, 8000) };
  } catch (err) {
    logger.warn({ err, url }, "linkedin fetch failed — degrading");
    return { url, text: "" };
  }
}
