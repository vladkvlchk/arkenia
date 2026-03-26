import { ethers } from "ethers";
import { config } from "../config";

// ABI — only the functions we need
const ABI = [
  "function campaignCount() view returns (uint256)",
  "function getCampaign(uint256 id) view returns (address creator, string username, uint256 bondAmount, uint256 targetAmount, uint256 raisedAmount, uint256 deadline, uint8 status)",
  "function getReputation(address wallet) view returns (int256)",
  "function eligible(address) view returns (bool)",
  "function setEligible(address wallet, bool status)",
  "function getFunders(uint256 id) view returns (address[])",
  "function getContribution(uint256 id, address funder) view returns (uint256)",
  "event CampaignCreated(uint256 indexed id, address indexed creator, string username, uint256 bondAmount, uint256 targetAmount, uint256 deadline)",
  "event CampaignFunded(uint256 indexed id, address indexed funder, uint256 amount)",
  "event CampaignFinalized(uint256 indexed id, uint8 status)",
];

const STATUS_LABELS = ["Active", "Successful", "Failed", "Rugged"] as const;

let provider: ethers.JsonRpcProvider;
let contract: ethers.Contract;
let adminWallet: ethers.Wallet | null = null;

export function initContract() {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  contract = new ethers.Contract(config.contractAddress, ABI, provider);

  if (config.privateKey) {
    adminWallet = new ethers.Wallet(config.privateKey, provider);
    contract = new ethers.Contract(config.contractAddress, ABI, adminWallet);
  }
}

export async function getCampaigns() {
  const count = await contract.campaignCount();
  const campaigns = [];

  for (let i = 0; i < count; i++) {
    const c = await contract.getCampaign(i);
    campaigns.push({
      id: i,
      creator: c.creator,
      username: c.username,
      bondAmount: ethers.formatEther(c.bondAmount),
      targetAmount: ethers.formatEther(c.targetAmount),
      raisedAmount: ethers.formatEther(c.raisedAmount),
      deadline: Number(c.deadline),
      status: STATUS_LABELS[Number(c.status)],
    });
  }

  return campaigns;
}

export async function getCampaign(id: number) {
  const c = await contract.getCampaign(id);
  const funders = await contract.getFunders(id);

  const funderDetails = await Promise.all(
    funders.map(async (funder: string) => ({
      address: funder,
      amount: ethers.formatEther(await contract.getContribution(id, funder)),
    }))
  );

  return {
    id,
    creator: c.creator,
    username: c.username,
    bondAmount: ethers.formatEther(c.bondAmount),
    targetAmount: ethers.formatEther(c.targetAmount),
    raisedAmount: ethers.formatEther(c.raisedAmount),
    deadline: Number(c.deadline),
    status: STATUS_LABELS[Number(c.status)],
    funders: funderDetails,
  };
}

export async function getReputation(wallet: string) {
  const score = await contract.getReputation(wallet);
  return Number(score);
}

export async function isEligibleOnChain(wallet: string) {
  return contract.eligible(wallet);
}

export async function whitelistWallet(wallet: string) {
  if (!adminWallet) throw new Error("Admin key not configured");
  const tx = await contract.setEligible(wallet, true);
  await tx.wait();
  return tx.hash;
}
