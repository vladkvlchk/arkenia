import { expect } from "chai";
import { ethers } from "hardhat";
import { CampaignV3, CampaignV3Factory, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const u = (n: number | string) => ethers.parseUnits(n.toString(), 6);

describe("CampaignV3 — audit PoC", () => {
  let usdc: MockUSDC;
  let campaign: CampaignV3;
  let owner: HardhatEthersSigner;
  let angel: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, angel, alice, bob] = await ethers.getSigners();

    usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    const impl = await (await ethers.getContractFactory("CampaignV3")).deploy();
    const factory = (await (await ethers.getContractFactory("CampaignV3Factory")).deploy(
      await impl.getAddress()
    )) as unknown as CampaignV3Factory;
    await factory.setToken(await usdc.getAddress(), true);
    await factory.connect(angel).createCampaign(await usdc.getAddress());
    campaign = (await ethers.getContractAt(
      "CampaignV3",
      (await factory.getCampaigns())[0]
    )) as unknown as CampaignV3;

    for (const who of [angel, alice, bob]) {
      await usdc.connect(owner).transfer(who.address, u(5000));
      await usdc.connect(who).approve(await campaign.getAddress(), ethers.MaxUint256);
    }
  });

  it("HIGH regression: self-transfer cannot double-credit reward", async () => {
    // alice & bob each get 50 shares of cohort 1 + 50 refundable
    await campaign.connect(alice).deposit(u(100));
    await campaign.connect(bob).deposit(u(100));
    await campaign.connect(angel).withdraw(u(100)); // f = 0.5 -> C1 total 100 shares
    await campaign.settleTo(alice.address, 1);
    await campaign.settleTo(bob.address, 1);

    // angel returns 100 -> 1 USDC/share. Fair: alice 50, bob 50.
    await campaign.connect(angel).returnFunds(u(100), 1);
    expect(await campaign.pendingRewardOf(alice.address, [1])).to.equal(u(50));
    expect(await campaign.pendingRewardOf(bob.address, [1])).to.equal(u(50));
    expect(await campaign.rewardReserves()).to.equal(u(100));

    // The exploit path (self-transfer) is now rejected outright.
    await expect(
      campaign.connect(alice).transferShares(1, alice.address, u(50))
    ).to.be.revertedWithCustomError(campaign, "SelfFill");

    // Both holders claim exactly their fair 50; reserve reconciles to zero.
    const aBefore = await usdc.balanceOf(alice.address);
    const bBefore = await usdc.balanceOf(bob.address);
    await campaign.connect(alice).claim([1]);
    await campaign.connect(bob).claim([1]);
    expect((await usdc.balanceOf(alice.address)) - aBefore).to.equal(u(50));
    expect((await usdc.balanceOf(bob.address)) - bBefore).to.equal(u(50));
    expect(await campaign.rewardReserves()).to.equal(0);
  });
});
