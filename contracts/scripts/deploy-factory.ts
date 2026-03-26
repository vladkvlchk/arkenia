import { ethers } from "hardhat";

// Already deployed Campaign implementation
const CAMPAIGN_IMPL = "0x4760ccba5Cf97CbF380Bc8Cfd8336219ca388B7D";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(CAMPAIGN_IMPL);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("CampaignFactory:", factoryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
