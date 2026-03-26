import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy Campaign implementation
  const Campaign = await ethers.getContractFactory("Campaign");
  const campaignImpl = await Campaign.deploy();
  await campaignImpl.waitForDeployment();
  const implAddress = await campaignImpl.getAddress();
  console.log("Campaign Implementation:", implAddress);

  // 2. Deploy CampaignFactory
  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(implAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("CampaignFactory:", factoryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
