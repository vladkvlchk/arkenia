import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deploys the full CampaignV3 testnet stack:
 *   TestUSDC (faucet) → CampaignV3 implementation → CampaignV3Factory → whitelist token.
 * Writes an address-book to contracts/deployments/<network>.json for the frontend/backend
 * to consume (no manual env editing).
 *
 * Usage:
 *   npx hardhat run scripts/deployV3.ts --network baseSepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address} (${ethers.formatEther(bal)} ETH)`);

  // 1. Test token with public faucet (testnet only)
  const TestUSDC = await ethers.getContractFactory("TestUSDC");
  const usdc = await TestUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("TestUSDC:", usdcAddr);

  // 2. CampaignV3 implementation (locked; never initialized directly)
  const Impl = await ethers.getContractFactory("CampaignV3");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("CampaignV3 impl:", implAddr);

  // 3. Factory
  const Factory = await ethers.getContractFactory("CampaignV3Factory");
  const factory = await Factory.deploy(implAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("CampaignV3Factory:", factoryAddr);

  // 4. Whitelist the test token
  await (await factory.setToken(usdcAddr, true)).wait();
  console.log(`Whitelisted TestUSDC on factory`);

  // 5. Address book
  const book = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      CampaignV3Factory: factoryAddr,
      CampaignV3Implementation: implAddr,
      TestUSDC: usdcAddr,
    },
  };
  const dir = join(__dirname, "..", "deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${network.name}.json`);
  writeFileSync(file, JSON.stringify(book, null, 2));
  console.log(`\nAddress book → deployments/${network.name}.json`);
  console.log(JSON.stringify(book.contracts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
