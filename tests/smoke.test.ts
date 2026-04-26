import { describe, it, expect } from "vitest";
import { logger } from "../src/log.js";

describe("smoke", () => {
  it("logger exists", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });
});
