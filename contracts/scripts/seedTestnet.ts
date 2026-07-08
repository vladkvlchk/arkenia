import { ethers, network } from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Seeds the Base Sepolia deployment with a handful of realistic campaigns + activity so the
 * public testnet app has real on-chain data to render. The deployer signer acts as the angel
 * (and, for simplicity, the sole believer) of each campaign.
 *
 *   npx hardhat run scripts/seedTestnet.ts --network baseSepolia
 */
const u = (n: number) => ethers.parseUnits(n.toString(), 6);

// Distinct personas with varied lifecycle stage, so the list doesn't look uniform.
const PERSONAS = [
  { name: "Aurora Compute", blurb: "Distributed GPU cycles for open model training.", deposit: 800, withdraw: 500, ret: 90 },
  { name: "Meridian Yield", blurb: "Delta-neutral basis trades across majors.", deposit: 1200, withdraw: 900, ret: 210 },
  { name: "Tessellate Labs", blurb: "On-chain simulation primitives.", deposit: 400, withdraw: 150, ret: 0 },
  { name: "Vesper Seed", blurb: "Pre-launch community round — nothing deployed yet.", deposit: 300, withdraw: 0, ret: 0 },
];

async function main() {
  const file = join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!existsSync(file)) throw new Error(`No deployment book at ${file} — run deployV3 first`);
  const book = JSON.parse(readFileSync(file, "utf8"));
  const factoryAddr: string = book.contracts.CampaignV3Factory;
  const tokenAddr: string = book.contracts.TestUSDC;

  const [angel] = await ethers.getSigners();
  console.log(`Network ${network.name} — angel ${angel.address}`);

  const factory = await ethers.getContractAt("CampaignV3Factory", factoryAddr);
  const token = await ethers.getContractAt("TestUSDC", tokenAddr);

  // Top up the angel's tUSDC once (faucet drips 10k).
  const need = u(PERSONAS.reduce((s, p) => s + p.deposit + p.ret, 0));
  while ((await token.balanceOf(angel.address)) < need) {
    await (await token.faucet()).wait();
    console.log(`faucet → ${ethers.formatUnits(await token.balanceOf(angel.address), 6)} tUSDC`);
  }

  const seeded: { address: string; name: string; blurb: string }[] = [];

  for (const p of PERSONAS) {
    const rc = await (await factory.createCampaign(tokenAddr)).wait();
    // pull the clone address from the CampaignCreated event
    const ev = rc!.logs
      .map((l) => { try { return factory.interface.parseLog(l as any); } catch { return null; } })
      .find((x) => x?.name === "CampaignCreated");
    const addr = ev!.args.campaign as string;
    const campaign = await ethers.getContractAt("CampaignV3", addr);

    await (await token.approve(addr, ethers.MaxUint256)).wait();
    await (await campaign.deposit(u(p.deposit))).wait();
    if (p.withdraw > 0) await (await campaign.withdraw(u(p.withdraw))).wait(); // mints cohort 1
    if (p.ret > 0) await (await campaign.returnFunds(u(p.ret), 1)).wait();

    console.log(`✓ ${p.name.padEnd(16)} ${addr}  deposit=${p.deposit} withdraw=${p.withdraw} return=${p.ret}`);
    seeded.push({ address: addr, name: p.name, blurb: p.blurb });
  }

  const out = join(__dirname, "..", "deployments", `seed-${network.name}.json`);
  writeFileSync(out, JSON.stringify({ seededAt: new Date().toISOString(), campaigns: seeded }, null, 2));
  console.log(`\nSeed metadata → deployments/seed-${network.name}.json (${seeded.length} campaigns)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
