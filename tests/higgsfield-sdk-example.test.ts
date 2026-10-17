import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ExampleError, INPUT, MODEL, generateOnce, normalize, publicVideoUrl, resume, safeError, verifyVideo, type Api } from "../examples/higgsfield/index";

let directory: string;
let api: Api;
const video = "https://cdn.example.com/sunset.mp4";
const completed = { status: "completed", request_id: "request-1", video: { url: video } };
beforeEach(async () => {
  const cache = path.resolve(".tool-cache");
  await mkdir(cache, { recursive: true });
  directory = await mkdtemp(path.join(cache, "sdk-example-test-"));
  api = { estimate: vi.fn().mockResolvedValue(2.31), subscribe: vi.fn().mockResolvedValue(completed), status: vi.fn().mockResolvedValue(completed), verify: vi.fn().mockResolvedValue(undefined) };
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

describe("one billable SDK attempt", () => {
  it("submits the requested model/input once and refuses later generation attempts", async () => {
    await expect(generateOnce(api, directory, 2.5)).resolves.toBe(video);
    await expect(generateOnce(api, directory, 2.5)).rejects.toMatchObject({ code: "ATTEMPT_EXISTS" });
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    const receipt = JSON.parse(await readFile(path.join(directory, "seedance-attempt.json"), "utf8"));
    expect(receipt).toMatchObject({ model: MODEL, input: INPUT, status: "completed", requestId: "request-1", verified: true, estimatedUsd: 2.31, approvedMaxUsd: 2.5 });
    expect(INPUT).toEqual({ prompt: "A cinematic scene at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9" });
    expect(api.subscribe).toHaveBeenCalledWith(receipt.idempotencyKey);
  });

  it("requires an approved budget and refuses an over-budget estimate before submission", async () => {
    await expect(generateOnce(api, directory, NaN)).rejects.toMatchObject({ code: "BUDGET_REQUIRED" });
    expect(api.estimate).not.toHaveBeenCalled();
    await expect(generateOnce(api, directory, 1)).rejects.toMatchObject({ code: "PRICE_LIMIT" });
    expect(api.subscribe).not.toHaveBeenCalled();
  });

  it("allows only one winner when two processes race to submit", async () => {
    const attempts = await Promise.allSettled([generateOnce(api, directory, 2.5), generateOnce(api, directory, 2.5)]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(api.subscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps an ambiguous failed submission locked and excludes raw provider errors from its receipt", async () => {
    const privateFixture = "never-print-this-fake-authorization-header";
    vi.mocked(api.subscribe).mockRejectedValue(new Error(privateFixture));
    await expect(generateOnce(api, directory, 2.5)).rejects.toThrow(privateFixture);
    await expect(generateOnce(api, directory, 2.5)).rejects.toMatchObject({ code: "ATTEMPT_EXISTS" });
    await expect(resume(api, directory)).rejects.toMatchObject({ code: "UNKNOWN_SUBMISSION" });
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    const receipt = await readFile(path.join(directory, "seedance-attempt.json"), "utf8");
    expect(receipt).not.toContain(privateFixture);
    expect(receipt).toContain("PROVIDER_OR_NETWORK_ERROR");
    expect(safeError(new Error(privateFixture))).not.toContain(privateFixture);
  });

  it.each(["failed", "canceled", "nsfw", "moderated"])("handles terminal %s without output verification or a second job", async status => {
    vi.mocked(api.subscribe).mockResolvedValue({ status, request_id: "request-1" });
    await expect(generateOnce(api, directory, 2.5)).rejects.toBeInstanceOf(ExampleError);
    expect(api.status).not.toHaveBeenCalled();
    expect(api.verify).not.toHaveBeenCalled();
    expect(api.subscribe).toHaveBeenCalledTimes(1);
  });

  it("stops polling at canceled, including when the SDK initial response was queued", async () => {
    vi.mocked(api.subscribe).mockResolvedValue({ status: "queued", request_id: "request-1" });
    vi.mocked(api.status).mockResolvedValue({ status: "canceled", request_id: "request-1" });
    await expect(generateOnce(api, directory, 2.5, { intervalMs: 0 })).rejects.toMatchObject({ code: "CANCELED" });
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("resumes only status reads after its wait limit", async () => {
    vi.mocked(api.subscribe).mockResolvedValue({ status: "queued", request_id: "request-1" });
    await expect(generateOnce(api, directory, 2.5, { maxWaitMs: 0 })).rejects.toMatchObject({ code: "WAIT_TIMEOUT" });
    await expect(resume(api, directory)).resolves.toBe(video);
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    expect(api.status).toHaveBeenCalledWith("request-1");
  });

  it("does not claim success until the returned video is reachable", async () => {
    vi.mocked(api.verify).mockRejectedValue(new ExampleError("VIDEO_UNREACHABLE", "Cannot verify video."));
    await expect(generateOnce(api, directory, 2.5)).rejects.toMatchObject({ code: "VIDEO_UNREACHABLE" });
    const receipt = JSON.parse(await readFile(path.join(directory, "seedance-attempt.json"), "utf8"));
    expect(receipt.status).toBe("completed");
    expect(receipt.verified).not.toBe(true);
    expect(receipt.videoUrl).toBeUndefined();
    vi.mocked(api.verify).mockResolvedValue(undefined);
    await expect(resume(api, directory)).resolves.toBe(video);
    expect(api.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("status and output checks", () => {
  it("rejects unknown statuses, missing completed video, and credential-bearing/private URLs", () => {
    expect(() => normalize({ status: "unknown", request_id: "r" })).toThrow();
    expect(() => normalize({ status: "completed", request_id: "r" })).toThrow();
    for (const url of ["http://cdn.example.com/video.mp4", "https://user:secret@cdn.example.com/video.mp4", "https://127.0.0.1/video.mp4", "https://localhost/video.mp4", "https://node.internal/video.mp4"]) expect(() => publicVideoUrl(url)).toThrow();
  });

  it("reads only a small unauthenticated range of the output and checks the MP4 file signature", async () => {
    const mp4Header = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const fetcher = vi.fn().mockResolvedValue(new Response(mp4Header, { status: 206 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(verifyVideo(video)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(video, expect.objectContaining({ headers: { Range: "bytes=0-63" }, redirect: "error" }));
    fetcher.mockResolvedValue(new Response("<html>not a video</html>"));
    await expect(verifyVideo(video)).rejects.toMatchObject({ code: "NOT_VIDEO" });
    fetcher.mockResolvedValue(new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 97, 118, 105, 102])));
    await expect(verifyVideo(video)).rejects.toMatchObject({ code: "NOT_VIDEO" });
  });
});
