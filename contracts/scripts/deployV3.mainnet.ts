import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deploys the CampaignV3 MAINNET stack on Base:
 *   CampaignV3 implementation → CampaignV3Factory → whitelist canonical USDC.
 * NO test token, NO faucet, NO seed — this handles REAL funds. Writes deployments/base.json.
 *
 * Usage (contracts/.env needs a FUNDED mainnet DEPLOYER_KEY + BASE_RPC_URL + BASESCAN_API_KEY):
 *   npx hardhat run scripts/deployV3.mainnet.ts --network base
 *   npx hardhat verify --network base <impl>
 *   npx hardhat verify --network base <factory> <impl>
 */

// Canonical Circle USDC on Base mainnet (6 decimals).
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 8453) {
    throw new Error(
      `Refusing to run: expected Base mainnet (8453), got chainId ${chainId} (network "${network.name}"). Pass --network base.`
    );
  }

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("━━━ CampaignV3 · Base MAINNET deploy (REAL FUNDS) ━━━");
  console.log(`Deployer: ${deployer.address} (${ethers.formatEther(bal)} ETH)`);
  if (bal === 0n) throw new Error("Deployer has 0 ETH on Base — fund it before deploying.");

  // Sanity: the whitelist target must be a real contract on this chain.
  if ((await ethers.provider.getCode(USDC_BASE)) === "0x") {
    throw new Error(`No contract at USDC ${USDC_BASE} on chainId ${chainId} — wrong network?`);
  }
  console.log(`USDC (whitelist target): ${USDC_BASE}`);

  // 1. Implementation (locked; never initialized directly).
  const impl = await (await ethers.getContractFactory("CampaignV3")).deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("CampaignV3 impl:", implAddr);

  // 2. Factory.
  const factory = await (await ethers.getContractFactory("CampaignV3Factory")).deploy(implAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("CampaignV3Factory:", factoryAddr);

  // 3. Whitelist canonical USDC.
  await (await factory.setToken(USDC_BASE, true)).wait();
  console.log("Whitelisted USDC on factory");

  // 4. Address book.
  const book = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      CampaignV3Factory: factoryAddr,
      CampaignV3Implementation: implAddr,
      USDC: USDC_BASE,
    },
  };
  const dir = join(__dirname, "..", "deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "base.json"), JSON.stringify(book, null, 2));
  console.log("\nAddress book → deployments/base.json");
  console.log(JSON.stringify(book.contracts, null, 2));

  console.log("\nNext — verify on Basescan:");
  console.log(`  npx hardhat verify --network base ${implAddr}`);
  console.log(`  npx hardhat verify --network base ${factoryAddr} ${implAddr}`);
  console.log("\nThen sync these addresses into the frontend (Vercel) + backend (.env.mainnet).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
