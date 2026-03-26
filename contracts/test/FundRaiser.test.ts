import { expect } from "chai";
import { ethers } from "hardhat";
import { FundRaiser } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("FundRaiser", () => {
  let contract: FundRaiser;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let funder1: HardhatEthersSigner;
  let funder2: HardhatEthersSigner;

  const BOND = ethers.parseEther("0.1");
  const TARGET = ethers.parseEther("1");
  const DURATION = 7 * 24 * 3600; // 1 week

  beforeEach(async () => {
    [owner, creator, funder1, funder2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("FundRaiser");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Whitelist creator
    await contract.setEligible(creator.address, true);
  });

  describe("Eligibility", () => {
    it("should set and check eligibility", async () => {
      expect(await contract.eligible(creator.address)).to.be.true;
      expect(await contract.eligible(funder1.address)).to.be.false;
    });

    it("should reject non-eligible campaign creators", async () => {
      await expect(
        contract.connect(funder1).createCampaign("@funder1", TARGET, DURATION, { value: BOND })
      ).to.be.revertedWith("Not eligible (TwitterScore)");
    });
  });

  describe("Campaign Creation", () => {
    it("should create a campaign with bond", async () => {
      const tx = await contract
        .connect(creator)
        .createCampaign("@creator", TARGET, DURATION, { value: BOND });

      await expect(tx).to.emit(contract, "CampaignCreated");

      const c = await contract.getCampaign(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.username).to.equal("@creator");
      expect(c.bondAmount).to.equal(BOND);
      expect(c.targetAmount).to.equal(TARGET);
      expect(c.status).to.equal(0); // Active
    });

    it("should reject zero bond", async () => {
      await expect(
        contract.connect(creator).createCampaign("@creator", TARGET, DURATION, { value: 0 })
      ).to.be.revertedWith("Bond must be > 0");
    });
  });

  describe("Funding", () => {
    beforeEach(async () => {
      await contract
        .connect(creator)
        .createCampaign("@creator", TARGET, DURATION, { value: BOND });
    });

    it("should accept funds from anyone", async () => {
      const amount = ethers.parseEther("0.5");
      await expect(contract.connect(funder1).fundCampaign(0, { value: amount }))
        .to.emit(contract, "CampaignFunded")
        .withArgs(0, funder1.address, amount);

      const c = await contract.getCampaign(0);
      expect(c.raisedAmount).to.equal(amount);
    });

    it("should track multiple funders", async () => {
      await contract.connect(funder1).fundCampaign(0, { value: ethers.parseEther("0.3") });
      await contract.connect(funder2).fundCampaign(0, { value: ethers.parseEther("0.5") });

      const funders = await contract.getFunders(0);
      expect(funders.length).to.equal(2);

      expect(await contract.getContribution(0, funder1.address)).to.equal(
        ethers.parseEther("0.3")
      );
    });

    it("should reject funding after deadline", async () => {
      await time.increase(DURATION + 1);
      await expect(
        contract.connect(funder1).fundCampaign(0, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Campaign expired");
    });
  });

  describe("Finalization — Success", () => {
    beforeEach(async () => {
      await contract
        .connect(creator)
        .createCampaign("@creator", TARGET, DURATION, { value: BOND });
      await contract.connect(funder1).fundCampaign(0, { value: TARGET });
    });

    it("should release funds + bond to creator", async () => {
      const balBefore = await ethers.provider.getBalance(creator.address);

      const tx = await contract.connect(creator).finalizeCampaign(0, 1); // Successful
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balAfter = await ethers.provider.getBalance(creator.address);
      expect(balAfter - balBefore + gasUsed).to.equal(TARGET + BOND);

      expect(await contract.getReputation(creator.address)).to.equal(1);
    });
  });

  describe("Finalization — Failed", () => {
    beforeEach(async () => {
      await contract
        .connect(creator)
        .createCampaign("@creator", TARGET, DURATION, { value: BOND });
      await contract
        .connect(funder1)
        .fundCampaign(0, { value: ethers.parseEther("0.3") });
    });

    it("should return bond to creator, allow funder refund", async () => {
      await contract.connect(creator).finalizeCampaign(0, 2); // Failed

      const c = await contract.getCampaign(0);
      expect(c.status).to.equal(2); // Failed

      // Funder claims refund
      const balBefore = await ethers.provider.getBalance(funder1.address);
      const tx = await contract.connect(funder1).claimRefund(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(funder1.address);

      expect(balAfter - balBefore + gasUsed).to.equal(ethers.parseEther("0.3"));
    });
  });

  describe("Finalization — Rugged", () => {
    beforeEach(async () => {
      await contract
        .connect(creator)
        .createCampaign("@creator", TARGET, DURATION, { value: BOND });
      await contract
        .connect(funder1)
        .fundCampaign(0, { value: ethers.parseEther("0.5") });
    });

    it("should slash bond, allow refunds, decrease reputation", async () => {
      // Only owner can rug-flag
      await expect(
        contract.connect(creator).finalizeCampaign(0, 3)
      ).to.be.revertedWith("Only owner can rug-flag");

      await contract.connect(owner).finalizeCampaign(0, 3); // Rugged

      expect(await contract.getReputation(creator.address)).to.equal(-2);

      // Funder refund works
      await contract.connect(funder1).claimRefund(0);
      expect(await contract.getContribution(0, funder1.address)).to.equal(0);
    });
  });
});
