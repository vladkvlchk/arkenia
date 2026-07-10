/** Scripted ChainSource: serves a fixed event list by block range. */

import type { ChainSource } from "../../src/application/ports.js";
import type { Address, ChainEvent } from "../../src/domain/types.js";

export const CHAIN_ID = 31337;
export const USDC = 10n ** 6n; // 6-decimal unit

export class FakeChainSource implements ChainSource {
  constructor(
    private readonly events: ChainEvent[],
    private readonly headBlock: bigint
  ) {}

  getHead(): Promise<bigint> {
    return Promise.resolve(this.headBlock);
  }

  getFactoryEvents(from: bigint, to: bigint): Promise<ChainEvent[]> {
    return Promise.resolve(
      this.events.filter(
        (e) => e.name === "CampaignCreated" && e.blockNumber >= from && e.blockNumber <= to
      )
    );
  }

  getCampaignEvents(addresses: Address[], from: bigint, to: bigint): Promise<ChainEvent[]> {
    const set = new Set(addresses.map((a) => a.toLowerCase()));
    return Promise.resolve(
      this.events.filter(
        (e) =>
          e.name !== "CampaignCreated" &&
          e.blockNumber >= from &&
          e.blockNumber <= to &&
          set.has((e as ChainEvent & { campaign: Address }).campaign.toLowerCase())
      )
    );
  }

  findFactoryDeployBlock(): Promise<bigint> {
    return Promise.resolve(1n);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ScriptEvent = DistributiveOmit<
  ChainEvent,
  "chainId" | "blockNumber" | "blockTime" | "txHash" | "logIndex"
>;

/** Sequential event builder — blocks/logIndexes laid out in call order. */
export class EventScript {
  readonly events: ChainEvent[] = [];
  private block = 0n;
  private logIndex = 0;

  nextBlock(): this {
    this.block += 1n;
    this.logIndex = 0;
    return this;
  }

  emit(event: ScriptEvent): this {
    this.events.push({
      ...event,
      chainId: CHAIN_ID,
      blockNumber: this.block,
      blockTime: new Date(1_750_000_000_000 + Number(this.block) * 2000),
      txHash: `0x${(1_000_000n + this.block).toString(16).padStart(8, "0")}${"0".repeat(56)}` as `0x${string}`,
      logIndex: this.logIndex++,
    } as ChainEvent);
    return this;
  }

  get headBlock(): bigint {
    return this.block;
  }
}

export const addr = (n: number): Address =>
  `0x${n.toString(16).padStart(40, "0")}` as Address;
