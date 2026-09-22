import { describe, expect, it } from "vitest";
import { TESTNET_CAMPAIGN_METADATA, campaignMeta, seedMeta } from "./metadata";

/**
 * The lookup keys are lowercased addresses while callers hold whatever casing
 * the chain or the API gave them. A missed normalisation does not throw — it
 * quietly falls through to the derived name, so a seeded campaign would render
 * as "Campaign 0xce9c…45ca" and look like an unknown one.
 */
const SEEDED = "0xce9ce282137528c916a15ad5542403bff51845ca";
const UNKNOWN = "0x1234567890abcdef1234567890abcdef12345678";

describe("campaignMeta", () => {
  it("returns the seeded record for a known campaign", () => {
    expect(campaignMeta(SEEDED)).toEqual(TESTNET_CAMPAIGN_METADATA[SEEDED]);
  });

  it("matches regardless of address casing", () => {
    const checksummed = "0xCE9cE282137528C916a15ad5542403bfF51845ca";

    expect(campaignMeta(checksummed).name).toBe("Aurora Compute");
  });

  it("derives a name from the address when nothing is stored", () => {
    expect(campaignMeta(UNKNOWN)).toEqual({
      name: "Campaign 0x1234…5678",
      description: "",
    });
  });

  // Reached on the campaign route before the address param resolves.
  it("falls back to a generic name with no address at all", () => {
    expect(campaignMeta(undefined)).toEqual({ name: "Campaign Campaign", description: "" });
  });
});

describe("seedMeta", () => {
  // Unlike campaignMeta this must return undefined rather than a derived
  // record: callers use it to decide whether the hardcoded name still wins over
  // the metadata API, and a truthy fallback would pin every campaign to a
  // placeholder name forever.
  it("returns undefined for a campaign that was never seeded", () => {
    expect(seedMeta(UNKNOWN)).toBeUndefined();
    expect(seedMeta(undefined)).toBeUndefined();
  });

  it("returns the record for a seeded campaign in any casing", () => {
    expect(seedMeta(SEEDED.toUpperCase().replace("0X", "0x"))?.name).toBe("Aurora Compute");
  });
});
