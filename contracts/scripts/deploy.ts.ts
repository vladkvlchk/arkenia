import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying FundRaiser with account:", deployer.address);

  const Factory = await ethers.getContractFactory("FundRaiser");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("FundRaiser deployed to:", address);

  // For local testing: whitelist the deployer
  if (process.env.HARDHAT_NETWORK === "localhost" || !process.env.HARDHAT_NETWORK) {
    await contract.setEligible(deployer.address, true);
    console.log("Deployer whitelisted for testing");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
