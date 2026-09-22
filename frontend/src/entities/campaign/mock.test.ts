import { describe, expect, it, vi } from "vitest";
import { MOCK_CAMPAIGNS_MANY, MOCK_COHORTS, getCampaign, getCohorts } from "./mock";

/**
 * This module is transitional — it disappears once the indexer is wired — so
 * its contents are not worth pinning. One property is: the index is generated
 * from a seeded PRNG at module load, and the campaigns route renders it on both
 * the server and the client. Any non-determinism becomes a hydration mismatch
 * that React reports as a generic warning and papers over by re-rendering, so
 * it is the kind of bug that survives a long time in plain sight.
 */
describe("generated campaign index", () => {
  it("produces the same index on every evaluation of the module", async () => {
    vi.resetModules();
    const reimported = await import("./mock");

    expect(reimported.MOCK_CAMPAIGNS_MANY).toEqual(MOCK_CAMPAIGNS_MANY);
  });

  it("keeps addresses unique so React keys never collide", () => {
    const addresses = MOCK_CAMPAIGNS_MANY.map((c) => c.address.toLowerCase());

    expect(new Set(addresses).size).toBe(addresses.length);
  });

  // The generator strides through the name pairs with a step coprime to their
  // count precisely so no pair repeats; a wrong stride silently produces
  // duplicates deep in the list where nobody scrolls.
  it("keeps generated names unique", () => {
    const names = MOCK_CAMPAIGNS_MANY.map((c) => c.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("produces well-formed addresses", () => {
    for (const campaign of MOCK_CAMPAIGNS_MANY) {
      expect(campaign.address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  // The ledger grid and the progress meters divide by these, so a negative or
  // inverted figure would render as a bar running the wrong way.
  it("keeps the accounting figures coherent", () => {
    for (const campaign of MOCK_CAMPAIGNS_MANY) {
      expect(campaign.totalWithdrawn).toBeLessThanOrEqual(campaign.totalDeposited);
      expect(campaign.poolBalance).toBeGreaterThanOrEqual(0);
      expect(campaign.totalReturned).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("lookup helpers", () => {
  // Addresses reach these from the URL in whatever casing the link carried.
  it("finds a campaign regardless of address casing", () => {
    const target = MOCK_CAMPAIGNS_MANY[0];

    expect(getCampaign(target.address.toUpperCase().replace("0X", "0x"))?.name).toBe(target.name);
  });

  it("returns nothing for an address that is not in the index", () => {
    expect(getCampaign("0x0000000000000000000000000000000000000000")).toBeUndefined();
  });

  it("returns only the cohorts belonging to the campaign asked for", () => {
    const campaignAddress = MOCK_COHORTS[0].campaignAddress;
    const cohorts = getCohorts(campaignAddress);

    expect(cohorts.length).toBeGreaterThan(0);
    for (const cohort of cohorts) {
      expect(cohort.campaignAddress).toBe(campaignAddress);
    }
  });

  it("returns an empty list for a campaign with no cohorts", () => {
    expect(getCohorts("0x0000000000000000000000000000000000000000")).toEqual([]);
  });
});
