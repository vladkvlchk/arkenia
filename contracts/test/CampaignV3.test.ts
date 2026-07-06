import { expect } from "chai";
import { ethers } from "hardhat";
import { CampaignV3, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const u = (n: number | string) => ethers.parseUnits(n.toString(), 6);

describe("CampaignV3 — Akrenia whiteboard scenario", () => {
  let usdc: MockUSDC;
  let campaign: CampaignV3;
  let angel: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let tom: HardhatEthersSigner;
  let richard: HardhatEthersSigner;

  beforeEach(async () => {
    const [owner, _angel, _alice, _bob, _tom, _richard] = await ethers.getSigners();
    angel = _angel; alice = _alice; bob = _bob; tom = _tom; richard = _richard;

    usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    campaign = (await (await ethers.getContractFactory("CampaignV3")).deploy()) as unknown as CampaignV3;
    await campaign.initialize(angel.address, await usdc.getAddress());

    for (const who of [angel, alice, bob, tom, richard]) {
      await usdc.connect(owner).transfer(who.address, u(5000));
      await usdc.connect(who).approve(await campaign.getAddress(), ethers.MaxUint256);
    }
  });

  // convenience: total USDC a believer can pull right now (refundable pool + claimable rewards)
  const usdcOf = async (who: HardhatEthersSigner, cohorts: number[]) => {
    const pool = await campaign.refundableOf(who.address);
    const rew = await campaign.pendingRewardOf(who.address, cohorts);
    return pool + rew;
  };

  it("reproduces every number on the board", async () => {
    const C = [1, 2];

    // ── deposit 1 (400 USDC): 100 each ─────────────────────────────
    for (const who of [alice, bob, tom, richard]) await campaign.connect(who).deposit(u(100));
    expect(await campaign.poolTotal()).to.equal(u(400));
    expect(await campaign.refundableOf(alice.address)).to.equal(u(100));

    // ── Angel withdrawal 1 (300) → f = 0.75, cohort C1 ─────────────
    await campaign.connect(angel).withdraw(u(300));
    for (const who of [alice, bob, tom, richard]) {
      expect(await campaign.cohortSharesOf(who.address, 1)).to.equal(u(75)); // 75 C1
      expect(await campaign.refundableOf(who.address)).to.equal(u(25));      // 25 USDC
    }
    expect(await campaign.totalCohortShares(1)).to.equal(u(300));

    // ── Alice backs (refunds) 25 USDC ──────────────────────────────
    await campaign.connect(alice).refund(u(25));
    expect(await campaign.refundableOf(alice.address)).to.equal(0);
    expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(75)); // C1 untouched

    // ── Bob deposits 275 (→ 300 USDC pool balance) ─────────────────
    await campaign.connect(bob).deposit(u(275));
    expect(await campaign.refundableOf(bob.address)).to.equal(u(300));
    expect(await campaign.poolTotal()).to.equal(u(350)); // 25(bob)+25(tom)+25(richard)+275

    // ── Angel withdrawal 2 (175) → f = 0.5, cohort C2 ──────────────
    await campaign.connect(angel).withdraw(u(175));
    // Alice: 75 C1, nothing in C2
    expect(await campaign.cohortSharesOf(alice.address, 2)).to.equal(0);
    // Bob: 75 C1, 150 C2, 150 USDC
    expect(await campaign.cohortSharesOf(bob.address, 2)).to.equal(u(150));
    expect(await campaign.refundableOf(bob.address)).to.equal(u(150));
    // Tom & Richard: 75 C1, 12.5 C2, 12.5 USDC
    for (const who of [tom, richard]) {
      expect(await campaign.cohortSharesOf(who.address, 1)).to.equal(u(75));
      expect(await campaign.cohortSharesOf(who.address, 2)).to.equal(u("12.5"));
      expect(await campaign.refundableOf(who.address)).to.equal(u("12.5"));
    }
    expect(await campaign.totalCohortShares(2)).to.equal(u(175));
    expect(await campaign.totalShares()).to.equal(u(475));

    // ── Angel returns 950 to ALL cohorts (2 USDC / share) ──────────
    await campaign.connect(angel).returnFundsToAll(u(950));
    expect(await usdcOf(alice, C)).to.equal(u(150));   // 75*2 + 0 pool
    expect(await usdcOf(bob, C)).to.equal(u(600));      // (75+150)*2 + 150 pool
    expect(await usdcOf(tom, C)).to.equal(u("187.5"));  // (75+12.5)*2 + 12.5 pool
    expect(await usdcOf(richard, C)).to.equal(u("187.5"));

    // ── Angel returns 300 to C1 only (1 USDC / C1 share) ───────────
    await campaign.connect(angel).returnFunds(u(300), 1);
    expect(await usdcOf(alice, C)).to.equal(u(225));    // +75
    expect(await usdcOf(bob, C)).to.equal(u(675));      // +75
    expect(await usdcOf(tom, C)).to.equal(u("262.5"));  // +75
    expect(await usdcOf(richard, C)).to.equal(u("262.5"));
  });

  it("believers can actually claim the rewards the board shows", async () => {
    for (const who of [alice, bob, tom, richard]) await campaign.connect(who).deposit(u(100));
    await campaign.connect(angel).withdraw(u(300));
    await campaign.connect(alice).refund(u(25));
    await campaign.connect(bob).deposit(u(275));
    await campaign.connect(angel).withdraw(u(175));
    await campaign.connect(angel).returnFundsToAll(u(950));
    await campaign.connect(angel).returnFunds(u(300), 1);

    // Bob claims C1 + C2: expect 525 reward (675 total - 150 still-refundable pool)
    const before = await usdc.balanceOf(bob.address);
    await campaign.connect(bob).claim([1, 2]);
    const gained = (await usdc.balanceOf(bob.address)) - before;
    expect(gained).to.equal(u(525));

    // second claim with nothing new reverts
    await expect(campaign.connect(bob).claim([1, 2])).to.be.revertedWithCustomError(
      campaign,
      "ZeroAmount"
    );

    // Bob can still refund his 150 pool balance afterwards
    await campaign.connect(bob).refund(u(150));
    expect(await campaign.refundableOf(bob.address)).to.equal(0);
  });

  it("un-withdrawn funds are never frozen: refund works after partial withdrawals", async () => {
    await campaign.connect(alice).deposit(u(1000));
    await campaign.connect(angel).withdraw(u(100)); // takes 10%, cohort C1
    // 900 stays refundable — NOT frozen
    expect(await campaign.refundableOf(alice.address)).to.equal(u(900));
    await campaign.connect(alice).refund(u(900));
    expect(await campaign.refundableOf(alice.address)).to.equal(0);
    expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(100)); // keeps her C1
  });

  it("full withdrawal (f = 1) converts everything and does not brick the pool", async () => {
    await campaign.connect(alice).deposit(u(100));
    await campaign.connect(angel).withdraw(u(100)); // f = 1
    expect(await campaign.refundableOf(alice.address)).to.equal(0);
    expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(100));
    // pool still usable afterwards
    await campaign.connect(bob).deposit(u(50));
    expect(await campaign.refundableOf(bob.address)).to.equal(u(50));
  });
});
