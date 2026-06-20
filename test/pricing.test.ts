import { PricingService } from "../src/segments/pricing";

jest.mock("../src/utils/cache", () => ({
  CacheManager: {
    getUsageCache: jest.fn().mockResolvedValue(null),
    setUsageCache: jest.fn().mockResolvedValue(undefined),
    ensureCacheDirectories: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("node:https", () => ({
  get: jest.fn(),
}));

const mockHttpGet = jest.requireMock("node:https").get as jest.Mock;
const { CacheManager } = jest.requireMock("../src/utils/cache");

function resetPricingCache() {
  (PricingService as any).executionCache = null;
  (PricingService as any).modelPricingCache = new Map();
}

// Default HTTP mock: immediately fires an error so pricing falls back to offline data
function mockNetworkError() {
  mockHttpGet.mockImplementation((_opts: any, _cb: any) => {
    const req = {
      on: jest.fn((event: string, handler: any) => {
        if (event === "error") (handler as (e: Error) => void)(new Error("Network unavailable"));
      }),
      end: jest.fn(),
      destroy: jest.fn(),
    };
    return req;
  });
}

describe("PricingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPricingCache();
    CacheManager.getUsageCache.mockResolvedValue(null);
    CacheManager.setUsageCache.mockResolvedValue(undefined);
  });

  describe("getCurrentPricing", () => {
    it("uses execution cache on second call", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, cb: any) => {
        const res = {
          statusCode: 200,
          on: jest.fn((event: string, handler: any) => {
            if (event === "data") {
              (handler as (d: string) => void)(JSON.stringify({
                "claude-sonnet-4-6": {
                  name: "Sonnet",
                  input: 3.0,
                  output: 15.0,
                  cache_read: 0.3,
                  cache_write_5m: 3.75,
                  cache_write_1h: 6.0,
                },
              }));
            }
            if (event === "end") (handler as () => void)();
          }),
        };
        (cb as (r: typeof res) => void)(res);
        return { on: jest.fn(), end: jest.fn() };
      });

      await PricingService.getCurrentPricing();
      await PricingService.getCurrentPricing();

      // getUsageCache only called once — second call hits execution cache
      expect(CacheManager.getUsageCache).toHaveBeenCalledTimes(1);
    });

    it("uses disk cache when available", async () => {
      const diskData = {
        "claude-haiku-4-5": {
          name: "Haiku",
          input: 1.0,
          output: 5.0,
          cache_read: 0.1,
          cache_write_5m: 1.25,
          cache_write_1h: 2.0,
        },
      };
      CacheManager.getUsageCache.mockResolvedValueOnce(diskData);

      const result = await PricingService.getCurrentPricing();

      expect(result).toEqual(diskData);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("falls back to offline data when fetch fails", async () => {
      mockNetworkError();

      const result = await PricingService.getCurrentPricing();

      expect(result).toBeDefined();
      expect(result["claude-haiku-4-5"]).toBeDefined();
      expect(result["claude-haiku-4-5"]?.input).toBe(1.0);
    });

    it("falls back to offline data when HTTP returns non-200", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, cb: any) => {
        const res = { statusCode: 500, statusMessage: "Internal Server Error", on: jest.fn() };
        (cb as (r: typeof res) => void)(res);
        return { on: jest.fn(), end: jest.fn() };
      });

      const result = await PricingService.getCurrentPricing();
      expect(result["claude-haiku-4-5"]).toBeDefined();
    });

    it("falls back to offline data when JSON is invalid", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, cb: any) => {
        const res = {
          statusCode: 200,
          on: jest.fn((event: string, handler: any) => {
            if (event === "data") (handler as (d: string) => void)("not valid json{{{");
            if (event === "end") (handler as () => void)();
          }),
        };
        (cb as (r: typeof res) => void)(res);
        return { on: jest.fn(), end: jest.fn() };
      });

      const result = await PricingService.getCurrentPricing();
      expect(result["claude-haiku-4-5"]).toBeDefined();
    });

    it("falls back to offline data when pricing data is structurally invalid", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, cb: any) => {
        const res = {
          statusCode: 200,
          on: jest.fn((event: string, handler: any) => {
            if (event === "data") {
              (handler as (d: string) => void)(JSON.stringify({ "model-x": { name: "No prices" } }));
            }
            if (event === "end") (handler as () => void)();
          }),
        };
        (cb as (r: typeof res) => void)(res);
        return { on: jest.fn(), end: jest.fn() };
      });

      const result = await PricingService.getCurrentPricing();
      expect(result["claude-haiku-4-5"]).toBeDefined();
    });

    it("saves fresh pricing data to disk cache", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, cb: any) => {
        const res = {
          statusCode: 200,
          on: jest.fn((event: string, handler: any) => {
            if (event === "data") {
              (handler as (d: string) => void)(JSON.stringify({
                "claude-haiku-4-5": {
                  name: "Haiku",
                  input: 1.0,
                  output: 5.0,
                  cache_read: 0.1,
                  cache_write_5m: 1.25,
                  cache_write_1h: 2.0,
                },
              }));
            }
            if (event === "end") (handler as () => void)();
          }),
        };
        (cb as (r: typeof res) => void)(res);
        return { on: jest.fn(), end: jest.fn() };
      });

      await PricingService.getCurrentPricing();

      expect(CacheManager.setUsageCache).toHaveBeenCalledWith(
        "pricing",
        expect.objectContaining({ "claude-haiku-4-5": expect.anything() }),
      );
    });
  });

  describe("getModelPricing", () => {
    beforeEach(() => {
      mockNetworkError();
    });

    it("returns pricing for an exact known model ID", async () => {
      const pricing = await PricingService.getModelPricing("claude-haiku-4-5-20251001");
      expect(pricing.input).toBe(1.0);
      expect(pricing.output).toBe(5.0);
      expect(pricing.cache_read).toBe(0.1);
    });

    it("uses per-model cache on repeated calls", async () => {
      await PricingService.getModelPricing("claude-haiku-4-5");
      await PricingService.getModelPricing("claude-haiku-4-5");
      // getUsageCache called once for the first getCurrentPricing; second getModelPricing uses per-model cache
      expect(CacheManager.getUsageCache).toHaveBeenCalledTimes(1);
    });

    it("fuzzy matches opus model variants", async () => {
      const pricing = await PricingService.getModelPricing(
        "us.anthropic.claude-opus-4-20250514-v1:0",
      );
      expect(pricing.input).toBe(15.0);
    });

    it("fuzzy matches sonnet model variants", async () => {
      const pricing = await PricingService.getModelPricing("some-prefix-sonnet-4-5-some-suffix");
      expect(pricing.output).toBe(15.0);
    });

    it("fuzzy matches haiku model variants", async () => {
      const pricing = await PricingService.getModelPricing("haiku-4-5-custom");
      expect(pricing.input).toBe(1.0);
    });

    it("returns default sonnet pricing for completely unknown models", async () => {
      const pricing = await PricingService.getModelPricing("totally-unknown-model-xyz");
      expect(pricing.input).toBe(3.0);
      expect(pricing.output).toBe(15.0);
    });
  });

  describe("calculateCostForEntry", () => {
    beforeEach(() => {
      mockNetworkError();
    });

    it("calculates cost from usage tokens", async () => {
      const entry = {
        model: "claude-haiku-4-5-20251001",
        message: {
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      };

      const cost = await PricingService.calculateCostForEntry(entry);
      // haiku: input=$1/M, output=$5/M
      expect(cost).toBeCloseTo(6.0, 5);
    });

    it("includes cache creation and read costs", async () => {
      const entry = {
        model: "claude-haiku-4-5-20251001",
        message: {
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 1_000_000,
            cache_read_input_tokens: 1_000_000,
          },
        },
      };

      const cost = await PricingService.calculateCostForEntry(entry);
      // haiku: cache_write_5m=$1.25/M, cache_read=$0.1/M
      expect(cost).toBeCloseTo(1.35, 5);
    });

    it("returns 0 when entry has no usage", async () => {
      const cost = await PricingService.calculateCostForEntry({ model: "claude-haiku-4-5" });
      expect(cost).toBe(0);
    });

    it("returns 0 when usage is missing from message", async () => {
      const cost = await PricingService.calculateCostForEntry({ message: {} });
      expect(cost).toBe(0);
    });

    it("extracts model from message.model when not at top level", async () => {
      const entry = {
        message: {
          model: "claude-haiku-4-5-20251001",
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      };

      const cost = await PricingService.calculateCostForEntry(entry);
      expect(cost).toBeCloseTo(1.0, 5);
    });

    it("extracts model from model_id field", async () => {
      const entry = {
        model_id: "claude-haiku-4-5-20251001",
        message: {
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      };

      const cost = await PricingService.calculateCostForEntry(entry);
      expect(cost).toBeCloseTo(1.0, 5);
    });

    it("falls back to sonnet pricing when no model ID found", async () => {
      const entry = {
        message: {
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      };

      const cost = await PricingService.calculateCostForEntry(entry);
      // sonnet: input=$3/M
      expect(cost).toBeCloseTo(3.0, 5);
    });
  });

  describe("request timeout handling", () => {
    it("falls back to offline data on request timeout", async () => {
      mockHttpGet.mockImplementationOnce((_opts: any, _cb: any) => {
        const req = {
          on: jest.fn((event: string, handler: any) => {
            if (event === "timeout") {
              // Fire timeout callback after the current sync block registers all handlers
              setImmediate(() => (handler as () => void)());
            }
          }),
          end: jest.fn(),
          destroy: jest.fn(),
        };
        return req;
      });

      const result = await PricingService.getCurrentPricing();

      expect(result["claude-haiku-4-5"]).toBeDefined();
    });
  });
});
