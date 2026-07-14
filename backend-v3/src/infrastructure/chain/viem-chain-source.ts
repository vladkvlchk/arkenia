/**
 * ChainSource over viem. Normalizes raw logs into domain ChainEvents with
 * block timestamps resolved (cached), addresses lowercased.
 */

import {
  createPublicClient,
  http,
  type AbiEvent,
  type Log,
  type PublicClient,
} from "viem";
import type { ChainSource } from "../../application/ports.js";
import type { Address, ChainEvent, Hex } from "../../domain/types.js";
import { campaignV3Abi } from "../abi/campaignV3.js";
import { campaignV3FactoryAbi } from "../abi/campaignV3Factory.js";

const CAMPAIGN_EVENT_NAMES = [
  "Deposited",
  "Refunded",
  "Withdrawn",
  "FundsReturned",
  "FundsReturnedToAll",
  "Claimed",
  "Settled",
  "SharesTransferred",
  "OrderFilled",
  "OrderCancelled",
  "OrdersInvalidated",
] as const;

const campaignEvents = campaignV3Abi.filter(
  (item): item is Extract<(typeof campaignV3Abi)[number], { type: "event" }> =>
    item.type === "event" && (CAMPAIGN_EVENT_NAMES as readonly string[]).includes(item.name)
) as unknown as AbiEvent[];

const campaignCreatedEvent = campaignV3FactoryAbi.find(
  (item) => item.type === "event" && item.name === "CampaignCreated"
) as unknown as AbiEvent;

// One heterogeneous event set for a single getLogs across the factory + campaign clones.
const allEvents: AbiEvent[] = [campaignCreatedEvent, ...campaignEvents];

export function createViemClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl, { batch: true }) });
}

export class ViemChainSource implements ChainSource {
  private readonly blockTimes = new Map<bigint, Date>();

  constructor(
    private readonly client: PublicClient,
    private readonly factory: Address,
    private readonly chainId: number
  ) {}

  getHead(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  /** One getLogs across the factory + campaign clones — CampaignCreated and every campaign event. */
  async getEvents(addresses: Address[], from: bigint, to: bigint): Promise<ChainEvent[]> {
    if (addresses.length === 0) return [];
    const logs = await this.client.getLogs({
      address: addresses,
      events: allEvents,
      fromBlock: from,
      toBlock: to,
    });
    return this.normalize(logs);
  }

  /** Binary-search eth_getCode for the factory's deploy block (~log2(head) calls, cached by cursor afterwards). */
  async findFactoryDeployBlock(): Promise<bigint> {
    let lo = 0n;
    let hi = await this.client.getBlockNumber();
    const deployed = async (block: bigint) =>
      ((await this.client.getCode({ address: this.factory, blockNumber: block })) ?? "0x") !== "0x";
    if (!(await deployed(hi))) throw new Error(`factory ${this.factory} has no code at head`);
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (await deployed(mid)) hi = mid;
      else lo = mid + 1n;
    }
    return lo;
  }

  // ─────────────────────────── normalization ───────────────────────────

  private async normalize(logs: Log[]): Promise<ChainEvent[]> {
    const times = await this.resolveBlockTimes(logs.map((l) => l.blockNumber!));
    const events: ChainEvent[] = [];
    for (const log of logs) {
      const event = this.toEvent(log, times.get(log.blockNumber!)!);
      if (event) events.push(event);
    }
    return events;
  }

  private async resolveBlockTimes(blockNumbers: bigint[]): Promise<Map<bigint, Date>> {
    const unique = [...new Set(blockNumbers)].filter((b) => !this.blockTimes.has(b));
    const CHUNK = 10;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const blocks = await Promise.all(
        chunk.map((blockNumber) => this.client.getBlock({ blockNumber }))
      );
      for (const block of blocks) {
        this.blockTimes.set(block.number, new Date(Number(block.timestamp) * 1000));
      }
    }
    // keep the cache bounded (batches move forward; old entries never recur)
    if (this.blockTimes.size > 50_000) this.blockTimes.clear();
    const out = new Map<bigint, Date>();
    for (const b of blockNumbers) out.set(b, this.blockTimes.get(b)!);
    return out;
  }

  private toEvent(log: Log, blockTime: Date): ChainEvent | null {
    const decoded = log as Log & { eventName?: string; args?: Record<string, unknown> };
    if (!decoded.eventName || !decoded.args) return null;
    const base = {
      chainId: this.chainId,
      blockNumber: log.blockNumber!,
      blockTime,
      txHash: log.transactionHash! as Hex,
      logIndex: log.logIndex!,
    };
    const addr = (v: unknown) => String(v).toLowerCase() as Address;
    const big = (v: unknown) => BigInt(v as string | number | bigint);
    const contract = addr(log.address);
    const a = decoded.args;

    switch (decoded.eventName) {
      case "CampaignCreated":
        return { ...base, name: "CampaignCreated", campaign: addr(a.campaign), angel: addr(a.angel), token: addr(a.token) };
      case "Deposited":
        return { ...base, name: "Deposited", campaign: contract, believer: addr(a.believer), amount: big(a.amount) };
      case "Refunded":
        return { ...base, name: "Refunded", campaign: contract, believer: addr(a.believer), amount: big(a.amount) };
      case "Withdrawn":
        return {
          ...base,
          name: "Withdrawn",
          campaign: contract,
          cohortId: big(a.cohortId),
          amount: big(a.amount),
          fractionRay: big(a.fractionRay),
        };
      case "FundsReturned":
        return { ...base, name: "FundsReturned", campaign: contract, cohortId: big(a.cohortId), amount: big(a.amount) };
      case "FundsReturnedToAll":
        return { ...base, name: "FundsReturnedToAll", campaign: contract, amount: big(a.amount) };
      case "Claimed":
        return { ...base, name: "Claimed", campaign: contract, believer: addr(a.believer), amount: big(a.amount) };
      case "Settled":
        return { ...base, name: "Settled", campaign: contract, user: addr(a.user), uptoCohort: big(a.uptoCohort) };
      case "SharesTransferred":
        return {
          ...base,
          name: "SharesTransferred",
          campaign: contract,
          cohortId: big(a.cohortId),
          from: addr(a.from),
          to: addr(a.to),
          amount: big(a.amount),
        };
      case "OrderFilled":
        return {
          ...base,
          name: "OrderFilled",
          campaign: contract,
          orderHash: String(a.orderHash).toLowerCase() as Hex,
          maker: addr(a.maker),
          taker: addr(a.taker),
          cohortId: big(a.cohortId),
          shares: big(a.shares),
          usdc: big(a.usdc),
          makerIsSeller: Boolean(a.makerIsSeller),
        };
      case "OrderCancelled":
        return {
          ...base,
          name: "OrderCancelled",
          campaign: contract,
          orderHash: String(a.orderHash).toLowerCase() as Hex,
          maker: addr(a.maker),
        };
      case "OrdersInvalidated":
        return {
          ...base,
          name: "OrdersInvalidated",
          campaign: contract,
          maker: addr(a.maker),
          minValidNonce: big(a.minValidNonce),
        };
      default:
        return null;
    }
  }
}
