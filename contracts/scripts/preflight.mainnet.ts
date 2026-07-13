import { ethers, network } from "hardhat";

/**
 * Read-only pre-flight for the Base-mainnet deploy. No transactions, no funds moved.
 * Confirms the deployer key is wired, prints the deployer address + gas balance, and checks
 * canonical USDC is a contract on-chain. The private key is never printed.
 *
 *   npx hardhat run scripts/preflight.mainnet.ts --network base
 */
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Network: ${network.name} (chainId ${chainId})`);

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer signer — set BASE_MAINNET_DEPLOYER_PRIVATE_KEY (or DEPLOYER_KEY) in contracts/.env."
    );
  }
  const [deployer] = signers;
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(bal)} ETH`);

  const usdcOk = (await ethers.provider.getCode(USDC_BASE)) !== "0x";
  console.log(`USDC ${USDC_BASE}: ${usdcOk ? "contract ✓" : "NOT a contract ✗"}`);

  if (chainId !== 8453) {
    console.log("Run with --network base for the real mainnet pre-flight.");
    return;
  }
  if (bal === 0n) {
    console.log("⚠️  Deployer has 0 ETH on Base — fund it before deploying (deploy costs gas).");
  } else {
    console.log("✓ Key wired, deployer funded, USDC present — ready for deployV3.mainnet.ts.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
