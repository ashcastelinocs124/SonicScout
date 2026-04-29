import { describe, it, expect, vi } from "vitest";
import { emit, subscribe } from "../../src/web/sse.js";

describe("SSE bus", () => {
  it("delivers events to all subscribers of a runId", () => {
    const a = vi.fn(); const b = vi.fn();
    const offA = subscribe(1, a);
    const offB = subscribe(1, b);
    emit(1, "progress", { phase: "market", done: 1, total: 5 });
    expect(a).toHaveBeenCalledWith({ event: "progress", data: { phase: "market", done: 1, total: 5 } });
    expect(b).toHaveBeenCalledWith({ event: "progress", data: { phase: "market", done: 1, total: 5 } });
    offA(); offB();
  });

  it("does not deliver events for a different runId", () => {
    const a = vi.fn();
    subscribe(1, a);
    emit(2, "progress", { phase: "market", done: 1, total: 5 });
    expect(a).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const a = vi.fn();
    const off = subscribe(1, a);
    off();
    emit(1, "progress", {});
    expect(a).not.toHaveBeenCalled();
  });
});
