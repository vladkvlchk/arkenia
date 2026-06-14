import { expect } from "chai";
import { ethers } from "hardhat";
import { CampaignV2, CampaignV2Factory, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// USDC has 6 decimals
const u = (n: number | string) => ethers.parseUnits(n.toString(), 6);

describe("CampaignV2", () => {
  let usdc: MockUSDC;
  let factory: CampaignV2Factory;
  let campaign: CampaignV2;

  let owner: HardhatEthersSigner;
  let angel: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, angel, alice, bob, carol] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    usdc = (await USDC.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();

    const Impl = await ethers.getContractFactory("CampaignV2");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();

    const Factory = await ethers.getContractFactory("CampaignV2Factory");
    factory = (await Factory.deploy(await impl.getAddress())) as unknown as CampaignV2Factory;
    await factory.waitForDeployment();

    await factory.addToken(await usdc.getAddress());
    await factory.connect(angel).createCampaign(await usdc.getAddress());
    const all = await factory.getCampaigns();
    campaign = (await ethers.getContractAt("CampaignV2", all[all.length - 1])) as unknown as CampaignV2;

    // fund participants and approve campaign
    for (const who of [angel, alice, bob, carol]) {
      await usdc.transfer(who.address, u(100_000));
      await usdc.connect(who).approve(await campaign.getAddress(), ethers.MaxUint256);
    }
  });

  // ───────────────────────── basics ─────────────────────────

  describe("init & deposit", () => {
    it("sets angel and token", async () => {
      expect(await campaign.angel()).to.equal(angel.address);
      expect(await campaign.token()).to.equal(await usdc.getAddress());
    });

    it("implementation cannot be re-initialized (disabled initializers)", async () => {
      // a fresh clone is initialized exactly once; re-calling reverts
      await expect(
        campaign.initialize(alice.address, await usdc.getAddress())
      ).to.be.reverted;
    });

    it("mints shares 1:1 into the active cohort", async () => {
      await expect(campaign.connect(alice).deposit(u(100)))
        .to.emit(campaign, "Deposited")
        .withArgs(alice.address, 0, u(100));
      expect(await campaign.balanceOf(alice.address, 0)).to.equal(u(100));
      expect(await campaign.totalSharesInCohort(0)).to.equal(u(100));
    });

    it("reverts zero-amount deposit", async () => {
      await expect(campaign.connect(alice).deposit(0)).to.be.revertedWithCustomError(
        campaign,
        "ZeroAmount"
      );
    });

    it("blocks deposits while paused, resumes after", async () => {
      await campaign.connect(angel).pause();
      await expect(campaign.connect(alice).deposit(u(100))).to.be.revertedWithCustomError(
        campaign,
        "DepositsArePaused"
      );
      await campaign.connect(angel).resume();
      await expect(campaign.connect(alice).deposit(u(100))).to.emit(campaign, "Deposited");
    });
  });

  // ───────────────────────── rewards happy path ─────────────────────────

  describe("returnFunds + claim", () => {
    beforeEach(async () => {
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(300));
    });

    it("distributes pro-rata and lets holders claim", async () => {
      await campaign.connect(angel).returnFunds(u(40), 0);
      expect(await campaign.totalRewardReserves()).to.equal(u(40));

      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(10));
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(30));

      expect(await campaign.totalRewardReserves()).to.equal(0);
    });

    it("second claim with nothing new reverts", async () => {
      await campaign.connect(angel).returnFunds(u(40), 0);
      await campaign.connect(alice).claim(0);
      await expect(campaign.connect(alice).claim(0)).to.be.revertedWithCustomError(
        campaign,
        "ZeroAmount"
      );
    });

    it("returnFunds to an empty cohort reverts", async () => {
      await expect(campaign.connect(angel).returnFunds(u(40), 99)).to.be.revertedWithCustomError(
        campaign,
        "EmptyCohort"
      );
    });
  });

  // ───────────────────────── SECURITY: reward double-count (audit #1) ─────────────────────────

  describe("security: _update idempotency", () => {
    beforeEach(async () => {
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(300));
      await campaign.connect(angel).returnFunds(u(40), 0); // cumulative 0.1, reserves 40
    });

    it("self-transfer does NOT double rewards", async () => {
      // PoC from the audit: before the fix this credited Alice 20 instead of 10.
      await campaign
        .connect(alice)
        .safeTransferFrom(alice.address, alice.address, 0, 1, "0x");

      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(10));
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(30));

      expect(await campaign.totalRewardReserves()).to.equal(0);
    });

    it("duplicate ids in batch transfer do NOT double rewards", async () => {
      await campaign
        .connect(alice)
        .safeBatchTransferFrom(alice.address, bob.address, [0, 0], [1, 1], "0x");

      // alice keeps the reward accrued while she held the shares; no inflation
      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(10));
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(30));

      expect(await campaign.totalRewardReserves()).to.equal(0);
    });
  });

  // ───────────────────────── SECURITY: reserve cap (audit #2) ─────────────────────────

  describe("security: withdraw cannot drain reward reserves", () => {
    beforeEach(async () => {
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(300));
      await campaign.connect(angel).returnFunds(u(40), 0); // reserves 40, balance 440
    });

    it("blocks withdraw that would dip below reserves", async () => {
      await expect(campaign.connect(angel).withdraw(u(401))).to.be.revertedWithCustomError(
        campaign,
        "ExceedsWithdrawable"
      );
    });

    it("allows withdrawing principal, keeps claims solvent", async () => {
      await campaign.connect(angel).withdraw(u(400)); // takes all principal, cohort -> 1
      expect(await campaign.currentCohort()).to.equal(1);

      // nothing left to withdraw (only reserves remain)
      await expect(campaign.connect(angel).withdraw(u(1))).to.be.revertedWithCustomError(
        campaign,
        "ExceedsWithdrawable"
      );

      // claims still fully funded
      await campaign.connect(alice).claim(0);
      await campaign.connect(bob).claim(0);
      expect(await campaign.totalRewardReserves()).to.equal(0);
      expect(await usdc.balanceOf(await campaign.getAddress())).to.equal(0);
    });
  });

  // ───────────────────────── returnFundsBatch (audit #3) ─────────────────────────

  describe("returnFundsBatch", () => {
    beforeEach(async () => {
      // cohort 0: alice 100, bob 300
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(300));
      await campaign.connect(angel).withdraw(u(100)); // -> cohort 1
      // cohort 1: carol 200
      await campaign.connect(carol).deposit(u(200));
      await campaign.connect(angel).withdraw(u(50)); // -> cohort 2 (stays empty)
    });

    it("splits proportionally across cohorts, remainder to last non-empty", async () => {
      await campaign.connect(angel).returnFundsBatch(u(60), [0, 1, 2]);
      // c0 weight 400/600 -> 40 ; c1 remainder -> 20
      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(10));
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(30));
      await expect(campaign.connect(carol).claim(1))
        .to.emit(campaign, "Claimed")
        .withArgs(carol.address, 1, u(20));
      expect(await campaign.totalRewardReserves()).to.equal(0);
    });

    it("trailing empty cohort does not lose the remainder", async () => {
      // [0, 2]: cohort 2 empty -> all 60 must go to cohort 0
      await campaign.connect(angel).returnFundsBatch(u(60), [0, 2]);
      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(15));
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(45));
      expect(await campaign.totalRewardReserves()).to.equal(0);
    });

    it("reverts when every listed cohort is empty", async () => {
      await expect(
        campaign.connect(angel).returnFundsBatch(u(10), [5, 6])
      ).to.be.revertedWithCustomError(campaign, "EmptyCohort");
    });
  });

  // ───────────────────────── cohort lifecycle & refund ─────────────────────────

  describe("cohort lifecycle & refund", () => {
    it("withdraw opens a new cohort; deposits flow into it", async () => {
      await campaign.connect(alice).deposit(u(100));
      expect(await campaign.currentCohort()).to.equal(0);
      await campaign.connect(angel).withdraw(u(50));
      expect(await campaign.currentCohort()).to.equal(1);
      await campaign.connect(bob).deposit(u(200));
      expect(await campaign.balanceOf(bob.address, 1)).to.equal(u(200));
      expect(await campaign.totalSharesInCohort(1)).to.equal(u(200));
    });

    it("refund on the active cohort returns USDC 1:1 and burns shares", async () => {
      await campaign.connect(alice).deposit(u(100));
      const before = await usdc.balanceOf(alice.address);
      await expect(campaign.connect(alice).refund(u(40)))
        .to.emit(campaign, "Refunded")
        .withArgs(alice.address, 0, u(40));
      expect(await usdc.balanceOf(alice.address)).to.equal(before + u(40));
      expect(await campaign.balanceOf(alice.address, 0)).to.equal(u(60));
      expect(await campaign.totalSharesInCohort(0)).to.equal(u(60));
    });

    it("refund is frozen after withdraw (past cohort locked)", async () => {
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(angel).withdraw(u(50)); // freezes cohort 0
      // alice has no shares in the now-active cohort 1
      await expect(campaign.connect(alice).refund(u(10))).to.be.reverted;
    });

    it("refund preserves rewards accrued before exit; future rewards skip the exiter", async () => {
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(100));
      await campaign.connect(angel).returnFunds(u(20), 0); // each accrues 10

      // alice fully exits — must keep her 10 already accrued
      await campaign.connect(alice).refund(u(100));
      await expect(campaign.connect(alice).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(alice.address, 0, u(10));

      // next distribution goes entirely to bob (alice holds 0 shares now)
      await campaign.connect(angel).returnFunds(u(10), 0);
      await expect(campaign.connect(bob).claim(0))
        .to.emit(campaign, "Claimed")
        .withArgs(bob.address, 0, u(20)); // 10 from first + 10 from second
      expect(await campaign.totalRewardReserves()).to.equal(0);
    });
  });

  // ───────────────────────── access control ─────────────────────────

  describe("access control", () => {
    it("only angel can withdraw / returnFunds / pause", async () => {
      await campaign.connect(alice).deposit(u(100));
      await expect(campaign.connect(alice).withdraw(u(10))).to.be.revertedWithCustomError(
        campaign,
        "Unauthorized"
      );
      await expect(campaign.connect(alice).returnFunds(u(10), 0)).to.be.revertedWithCustomError(
        campaign,
        "Unauthorized"
      );
      await expect(campaign.connect(alice).pause()).to.be.revertedWithCustomError(
        campaign,
        "Unauthorized"
      );
    });
  });
});
