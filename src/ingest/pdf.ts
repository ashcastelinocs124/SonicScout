import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export async function extractPdf(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
