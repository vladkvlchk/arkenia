import { ethers } from "ethers";
import { config } from "../config";
import {
  insertEvent,
  upsertCampaignStats,
  upsertUserStats,
  getIndexerState,
  setIndexerState,
  getEventsForCampaign,
  getUserStats,
  query,
} from "./db";

const FACTORY_ABI = [
  "event CampaignCreated(address indexed campaign, address indexed creator, uint256 floor, uint256 ceil)",
];

const CAMPAIGN_ABI = [
  "event Deposited(address indexed investor, uint256 amount)",
  "event Withdrawn(uint256 amount, uint256 timestamp)",
  "event Refunded(address indexed investor, uint256 amount)",
  "event FundsReturned(uint256 amount)",
  "event Claimed(address indexed investor, uint256 amount)",
  "function creator() view returns (address)",
  "function token() view returns (address)",
  "function floor() view returns (uint256)",
  "function ceil() view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function returnedAmount() view returns (uint256)",
  "function withdrawnAt() view returns (uint256)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const POLL_INTERVAL = 15_000;
const BLOCK_BATCH_SIZE = 10_000;
const LOOKBACK_BLOCKS = 50_000;
const MAX_RETRIES = 5;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const isRateLimit = e?.code === "BAD_DATA" || e?.message?.includes("Too Many Requests") || e?.message?.includes("429");
      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`  Rate limited on ${label}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries reached");
}

let provider: ethers.JsonRpcProvider;

const tokenInfoCache = new Map<string, { symbol: string; decimals: number }>();

async function getTokenInfo(tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
  const key = tokenAddress.toLowerCase();
  if (tokenInfoCache.has(key)) return tokenInfoCache.get(key)!;

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  const info = { symbol, decimals: Number(decimals) };
  tokenInfoCache.set(key, info);
  return info;
}

async function processCampaignCreated(log: ethers.Log, parsed: ethers.LogDescription) {
  const campaignAddr = parsed.args[0] as string;
  const creator = parsed.args[1] as string;
  const floor = parsed.args[2] as bigint;
  const ceil = parsed.args[3] as bigint;

  const campaign = new ethers.Contract(campaignAddr, CAMPAIGN_ABI, provider);
  const tokenAddr = await campaign.token();
  const { symbol, decimals } = await getTokenInfo(tokenAddr);

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "CampaignCreated",
    { creator: creator.toLowerCase(), floor: floor.toString(), ceil: ceil.toString(), token: tokenAddr.toLowerCase() }
  );

  await upsertCampaignStats({
    campaign: campaignAddr, creator, token: tokenAddr,
    tokenSymbol: symbol, tokenDecimals: decimals,
    floorAmount: ethers.formatUnits(floor, decimals),
    ceilAmount: ethers.formatUnits(ceil, decimals),
    totalRaised: "0", totalReturned: "0",
    investorCount: 0, withdrawnAt: 0, pnl: "0", status: "active",
  });

  await recomputeUserCreatorStats(creator);
}

async function processDeposited(log: ethers.Log, parsed: ethers.LogDescription, campaignAddr: string) {
  const investor = parsed.args[0] as string;
  const amount = parsed.args[1] as bigint;

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "Deposited", { investor: investor.toLowerCase(), amount: amount.toString() }
  );

  await recomputeCampaignStats(campaignAddr);
  await recomputeUserInvestorStats(investor);
  await recomputeCreatorForCampaign(campaignAddr);
}

async function processWithdrawn(log: ethers.Log, parsed: ethers.LogDescription, campaignAddr: string) {
  const amount = parsed.args[0] as bigint;
  const timestamp = parsed.args[1] as bigint;

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "Withdrawn", { amount: amount.toString(), timestamp: timestamp.toString() }
  );

  await recomputeCampaignStats(campaignAddr);
  await recomputeCreatorForCampaign(campaignAddr);
}

async function processRefunded(log: ethers.Log, parsed: ethers.LogDescription, campaignAddr: string) {
  const investor = parsed.args[0] as string;
  const amount = parsed.args[1] as bigint;

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "Refunded", { investor: investor.toLowerCase(), amount: amount.toString() }
  );

  await recomputeCampaignStats(campaignAddr);
  await recomputeUserInvestorStats(investor);
  await recomputeCreatorForCampaign(campaignAddr);
}

async function processFundsReturned(log: ethers.Log, parsed: ethers.LogDescription, campaignAddr: string) {
  const amount = parsed.args[0] as bigint;

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "FundsReturned", { amount: amount.toString() }
  );

  await recomputeCampaignStats(campaignAddr);

  const campaign = new ethers.Contract(campaignAddr, CAMPAIGN_ABI, provider);
  const creator = await campaign.creator();
  await recomputeUserCreatorStats(creator);
}

async function processClaimed(log: ethers.Log, parsed: ethers.LogDescription, campaignAddr: string) {
  const investor = parsed.args[0] as string;
  const amount = parsed.args[1] as bigint;

  await insertEvent(
    log.transactionHash, log.index, log.blockNumber, campaignAddr,
    "Claimed", { investor: investor.toLowerCase(), amount: amount.toString() }
  );

  await recomputeUserInvestorStats(investor);
}

async function recomputeCampaignStats(campaignAddr: string) {
  const campaign = new ethers.Contract(campaignAddr, CAMPAIGN_ABI, provider);
  const [creator, tokenAddr, floor, ceil, totalRaised, returnedAmount, withdrawnAt] = await Promise.all([
    campaign.creator(), campaign.token(), campaign.floor(), campaign.ceil(),
    campaign.totalRaised(), campaign.returnedAmount(), campaign.withdrawnAt(),
  ]);

  const { symbol, decimals } = await getTokenInfo(tokenAddr);
  const raisedNum = Number(ethers.formatUnits(totalRaised, decimals));
  const returnedNum = Number(ethers.formatUnits(returnedAmount, decimals));
  const pnl = returnedNum - raisedNum;

  const events = await getEventsForCampaign(campaignAddr);
  const investors = new Set<string>();
  for (const e of events) {
    if (e.event_name === "Deposited" && e.args.investor) {
      investors.add(e.args.investor);
    }
  }

  let status = "active";
  if (Number(withdrawnAt) > 0) {
    status = returnedNum > 0 ? "returned" : "withdrawn";
  }

  await upsertCampaignStats({
    campaign: campaignAddr, creator, token: tokenAddr,
    tokenSymbol: symbol, tokenDecimals: decimals,
    floorAmount: ethers.formatUnits(floor, decimals),
    ceilAmount: ethers.formatUnits(ceil, decimals),
    totalRaised: ethers.formatUnits(totalRaised, decimals),
    totalReturned: ethers.formatUnits(returnedAmount, decimals),
    investorCount: investors.size,
    withdrawnAt: Number(withdrawnAt),
    pnl: pnl.toString(),
    status,
  });
}

async function recomputeCreatorForCampaign(campaignAddr: string) {
  const campaign = new ethers.Contract(campaignAddr, CAMPAIGN_ABI, provider);
  const creator = await campaign.creator();
  await recomputeUserCreatorStats(creator);
}

async function recomputeUserCreatorStats(wallet: string) {
  const walletLower = wallet.toLowerCase();

  const { rows: createdCampaigns } = await query(
    "SELECT * FROM campaign_stats WHERE creator = $1",
    [walletLower]
  );

  let creatorTotalRaised = 0;
  let creatorTotalReturned = 0;
  for (const c of createdCampaigns) {
    creatorTotalRaised += Number(c.total_raised);
    creatorTotalReturned += Number(c.total_returned);
  }
  const creatorPnl = creatorTotalReturned - creatorTotalRaised;

  const prev = await getUserStats(walletLower);

  await upsertUserStats({
    wallet: walletLower,
    campaignsCreated: createdCampaigns.length,
    creatorTotalRaised: creatorTotalRaised.toString(),
    creatorTotalReturned: creatorTotalReturned.toString(),
    creatorPnl: creatorPnl.toString(),
    campaignsInvested: prev ? Number(prev.campaigns_invested) : 0,
    investorTotalDeposited: prev ? prev.investor_total_deposited.toString() : "0",
    investorTotalClaimed: prev ? prev.investor_total_claimed.toString() : "0",
    investorTotalRefunded: prev ? prev.investor_total_refunded.toString() : "0",
    investorPnl: prev ? prev.investor_pnl.toString() : "0",
  });
}

async function recomputeUserInvestorStats(wallet: string) {
  const walletLower = wallet.toLowerCase();

  // Get per-campaign deposits with token decimals for proper formatting
  const { rows: deposits } = await query(
    `SELECT e.campaign, SUM((e.args->>'amount')::numeric) as total, cs.token_decimals
     FROM events e
     JOIN campaign_stats cs ON e.campaign = cs.campaign
     WHERE e.event_name = 'Deposited' AND e.args->>'investor' = $1
     GROUP BY e.campaign, cs.token_decimals`,
    [walletLower]
  );

  const { rows: claims } = await query(
    `SELECT e.campaign, SUM((e.args->>'amount')::numeric) as total, cs.token_decimals
     FROM events e
     JOIN campaign_stats cs ON e.campaign = cs.campaign
     WHERE e.event_name = 'Claimed' AND e.args->>'investor' = $1
     GROUP BY e.campaign, cs.token_decimals`,
    [walletLower]
  );

  const { rows: refunds } = await query(
    `SELECT e.campaign, SUM((e.args->>'amount')::numeric) as total, cs.token_decimals
     FROM events e
     JOIN campaign_stats cs ON e.campaign = cs.campaign
     WHERE e.event_name = 'Refunded' AND e.args->>'investor' = $1
     GROUP BY e.campaign, cs.token_decimals`,
    [walletLower]
  );

  let investorTotalDeposited = 0;
  for (const d of deposits) {
    investorTotalDeposited += Number(ethers.formatUnits(BigInt(d.total), d.token_decimals));
  }
  let investorTotalClaimed = 0;
  for (const c of claims) {
    investorTotalClaimed += Number(ethers.formatUnits(BigInt(c.total), c.token_decimals));
  }
  let investorTotalRefunded = 0;
  for (const r of refunds) {
    investorTotalRefunded += Number(ethers.formatUnits(BigInt(r.total), r.token_decimals));
  }
  const investorPnl = investorTotalClaimed + investorTotalRefunded - investorTotalDeposited;

  const prev = await getUserStats(walletLower);

  await upsertUserStats({
    wallet: walletLower,
    campaignsCreated: prev ? Number(prev.campaigns_created) : 0,
    creatorTotalRaised: prev ? prev.creator_total_raised.toString() : "0",
    creatorTotalReturned: prev ? prev.creator_total_returned.toString() : "0",
    creatorPnl: prev ? prev.creator_pnl.toString() : "0",
    campaignsInvested: deposits.length,
    investorTotalDeposited: investorTotalDeposited.toString(),
    investorTotalClaimed: investorTotalClaimed.toString(),
    investorTotalRefunded: investorTotalRefunded.toString(),
    investorPnl: investorPnl.toString(),
  });
}

async function processLogs(fromBlock: number, toBlock: number) {
  const factoryInterface = new ethers.Interface(FACTORY_ABI);
  const campaignInterface = new ethers.Interface(CAMPAIGN_ABI);

  const factoryForRead = new ethers.Contract(
    config.factoryAddress,
    ["function getCampaigns() view returns (address[])"],
    provider
  );
  const campaignAddresses: string[] = await withRetry(
    () => factoryForRead.getCampaigns(),
    "getCampaigns"
  );

  // Factory events
  const factoryLogs = await withRetry(
    () => provider.getLogs({
      address: config.factoryAddress,
      fromBlock, toBlock,
      topics: [ethers.id("CampaignCreated(address,address,uint256,uint256)")],
    }),
    `factory logs ${fromBlock}-${toBlock}`
  );

  for (const log of factoryLogs) {
    try {
      const parsed = factoryInterface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "CampaignCreated") {
        console.log(`  [${log.blockNumber}] CampaignCreated: ${parsed.args[0]}`);
        await processCampaignCreated(log, parsed);
      }
    } catch (e) {
      console.error("Failed to parse factory log:", e);
    }
  }

  // Campaign events
  if (campaignAddresses.length > 0) {
    const eventTopics = [
      ethers.id("Deposited(address,uint256)"),
      ethers.id("Withdrawn(uint256,uint256)"),
      ethers.id("Refunded(address,uint256)"),
      ethers.id("FundsReturned(uint256)"),
      ethers.id("Claimed(address,uint256)"),
    ];

    const campaignLogs = await withRetry(
      () => provider.getLogs({
        address: campaignAddresses,
        fromBlock, toBlock,
        topics: [eventTopics],
      }),
      `campaign logs ${fromBlock}-${toBlock}`
    );

    for (const log of campaignLogs) {
      try {
        const parsed = campaignInterface.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed) continue;

        const campaignAddr = log.address;
        console.log(`  [${log.blockNumber}] ${parsed.name} on ${campaignAddr.slice(0, 8)}...`);

        switch (parsed.name) {
          case "Deposited":
            await processDeposited(log, parsed, campaignAddr);
            break;
          case "Withdrawn":
            await processWithdrawn(log, parsed, campaignAddr);
            break;
          case "Refunded":
            await processRefunded(log, parsed, campaignAddr);
            break;
          case "FundsReturned":
            await processFundsReturned(log, parsed, campaignAddr);
            break;
          case "Claimed":
            await processClaimed(log, parsed, campaignAddr);
            break;
        }
      } catch (e) {
        console.error("Failed to parse campaign log:", e);
      }
    }
  }

  // Delay between batches to respect free RPC rate limits
  await sleep(1000);
}

async function syncHistorical() {
  const currentBlock = await provider.getBlockNumber();
  const lastBlockStr = await getIndexerState("last_block_number");
  const defaultStart = Math.max(currentBlock - LOOKBACK_BLOCKS, 0);
  const startBlock = lastBlockStr ? parseInt(lastBlockStr) + 1 : defaultStart;

  if (startBlock > currentBlock) {
    console.log("Indexer: already up to date");
    return currentBlock;
  }

  const blocksToSync = currentBlock - startBlock;
  console.log(`Indexer: syncing ${blocksToSync} blocks (${startBlock} → ${currentBlock})...`);

  for (let from = startBlock; from <= currentBlock; from += BLOCK_BATCH_SIZE) {
    const to = Math.min(from + BLOCK_BATCH_SIZE - 1, currentBlock);
    console.log(`  Processing blocks ${from}-${to}...`);
    await processLogs(from, to);
    await setIndexerState("last_block_number", to.toString());
  }

  console.log("Indexer: historical sync complete");
  return currentBlock;
}

async function pollLoop() {
  while (true) {
    try {
      const lastBlockStr = await getIndexerState("last_block_number");
      const lastBlock = lastBlockStr ? parseInt(lastBlockStr) : 0;
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock > lastBlock) {
        await processLogs(lastBlock + 1, currentBlock);
        await setIndexerState("last_block_number", currentBlock.toString());
      }
    } catch (e) {
      console.error("Indexer poll error:", e);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

export async function startIndexer() {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);

  console.log(`Indexer: starting for factory ${config.factoryAddress}`);
  console.log(`Indexer: RPC ${config.rpcUrl}`);

  await syncHistorical();
  console.log("Indexer: starting poll loop...");
  pollLoop(); // Runs in background
}
