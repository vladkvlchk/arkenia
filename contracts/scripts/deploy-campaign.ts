const { ethers } = require("hardhat");

async function main() {
  const Campaign = await ethers.getContractFactory("Campaign");
  const campaignImpl = await Campaign.deploy();
  await campaignImpl.waitForDeployment();

  console.log("Campaign Implementation:", await campaignImpl.getAddress());
}

main();