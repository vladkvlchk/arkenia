import { expect } from "chai";
import { ethers } from "hardhat";
import { CampaignV3, CampaignV3Factory, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const u = (n: number | string) => ethers.parseUnits(n.toString(), 6);

const ORDER_TYPES = {
  Order: [
    { name: "maker", type: "address" },
    { name: "isSell", type: "bool" },
    { name: "cohortId", type: "uint256" },
    { name: "shareAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

describe("CampaignV3", () => {
  let usdc: MockUSDC;
  let factory: CampaignV3Factory;
  let campaign: CampaignV3;
  let chainId: bigint;

  let owner: HardhatEthersSigner;
  let angel: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let tom: HardhatEthersSigner;
  let richard: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, angel, alice, bob, tom, richard, carol] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    const impl = await (await ethers.getContractFactory("CampaignV3")).deploy();
    factory = (await (await ethers.getContractFactory("CampaignV3Factory")).deploy(
      await impl.getAddress()
    )) as unknown as CampaignV3Factory;
    await factory.setToken(await usdc.getAddress(), true);
    await factory.connect(angel).createCampaign(await usdc.getAddress());
    const list = await factory.getCampaigns();
    campaign = (await ethers.getContractAt("CampaignV3", list[0])) as unknown as CampaignV3;

    for (const who of [angel, alice, bob, tom, richard, carol]) {
      await usdc.connect(owner).transfer(who.address, u(5000));
      await usdc.connect(who).approve(await campaign.getAddress(), ethers.MaxUint256);
    }
  });

  const signOrder = async (maker: HardhatEthersSigner, order: any) => {
    const domain = {
      name: "CampaignV3",
      version: "1",
      chainId,
      verifyingContract: await campaign.getAddress(),
    };
    return maker.signTypedData(domain, ORDER_TYPES, order);
  };

  const usdcOf = async (who: HardhatEthersSigner, cohorts: number[]) =>
    (await campaign.refundableOf(who.address)) + (await campaign.pendingRewardOf(who.address, cohorts));

  // ───────────────────────── whiteboard scenario ─────────────────────────

  it("reproduces every number on the Akrenia board", async () => {
    const C = [1, 2];
    for (const who of [alice, bob, tom, richard]) await campaign.connect(who).deposit(u(100));
    await campaign.connect(angel).withdraw(u(300));
    for (const who of [alice, bob, tom, richard]) {
      expect(await campaign.cohortSharesOf(who.address, 1)).to.equal(u(75));
      expect(await campaign.refundableOf(who.address)).to.equal(u(25));
    }
    await campaign.connect(alice).refund(u(25));
    await campaign.connect(bob).deposit(u(275));
    expect(await campaign.poolTotal()).to.equal(u(350));

    await campaign.connect(angel).withdraw(u(175));
    expect(await campaign.cohortSharesOf(bob.address, 2)).to.equal(u(150));
    expect(await campaign.refundableOf(bob.address)).to.equal(u(150));
    for (const who of [tom, richard]) {
      expect(await campaign.cohortSharesOf(who.address, 2)).to.equal(u("12.5"));
      expect(await campaign.refundableOf(who.address)).to.equal(u("12.5"));
    }
    expect(await campaign.totalShares()).to.equal(u(475));

    await campaign.connect(angel).returnFundsToAll(u(950));
    expect(await usdcOf(alice, C)).to.equal(u(150));
    expect(await usdcOf(bob, C)).to.equal(u(600));
    expect(await usdcOf(tom, C)).to.equal(u("187.5"));

    await campaign.connect(angel).returnFunds(u(300), 1);
    expect(await usdcOf(alice, C)).to.equal(u(225));
    expect(await usdcOf(bob, C)).to.equal(u(675));
    expect(await usdcOf(tom, C)).to.equal(u("262.5"));
    expect(await usdcOf(richard, C)).to.equal(u("262.5"));
  });

  it("un-withdrawn funds are never frozen after partial withdrawal", async () => {
    await campaign.connect(alice).deposit(u(1000));
    await campaign.connect(angel).withdraw(u(100));
    expect(await campaign.refundableOf(alice.address)).to.equal(u(900));
    await campaign.connect(alice).refund(u(900));
    expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(100));
  });

  // ───────────────────────── premarket ─────────────────────────

  describe("premarket", () => {
    beforeEach(async () => {
      // alice & bob each end up with 50 C1 shares + 50 refundable
      await campaign.connect(alice).deposit(u(100));
      await campaign.connect(bob).deposit(u(100));
      await campaign.connect(angel).withdraw(u(100)); // f = 0.5 -> C1 total 100
    });

    it("fills a signed SELL order (partial fills + overfill guard)", async () => {
      const order = {
        maker: alice.address,
        isSell: true,
        cohortId: 1n,
        shareAmount: u(20),
        usdcAmount: u(30), // 1.5 USDC / share
        nonce: 1n,
        deadline: BigInt(2_000_000_000),
      };
      const sig = await signOrder(alice, order);

      const aliceUsdcBefore = await usdc.balanceOf(alice.address);
      const bobUsdcBefore = await usdc.balanceOf(bob.address);

      await campaign.connect(bob).fillOrder(order, sig, u(10)); // half
      await campaign.connect(bob).fillOrder(order, sig, u(10)); // rest

      expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(30)); // 50 - 20
      expect(await campaign.cohortSharesOf(bob.address, 1)).to.equal(u(70));   // 50 + 20
      expect((await usdc.balanceOf(alice.address)) - aliceUsdcBefore).to.equal(u(30));
      expect(bobUsdcBefore - (await usdc.balanceOf(bob.address))).to.equal(u(30));

      await expect(campaign.connect(bob).fillOrder(order, sig, u(1))).to.be.revertedWithCustomError(
        campaign,
        "Overfill"
      );
    });

    it("fills a signed BUY order", async () => {
      const order = {
        maker: bob.address,
        isSell: false, // bob buys shares with USDC
        cohortId: 1n,
        shareAmount: u(10),
        usdcAmount: u(20),
        nonce: 7n,
        deadline: BigInt(2_000_000_000),
      };
      const sig = await signOrder(bob, order);

      const aliceBefore = await usdc.balanceOf(alice.address);
      await campaign.connect(alice).fillOrder(order, sig, u(10)); // alice sells into bob's buy
      expect(await campaign.cohortSharesOf(bob.address, 1)).to.equal(u(60));
      expect(await campaign.cohortSharesOf(alice.address, 1)).to.equal(u(40));
      expect((await usdc.balanceOf(alice.address)) - aliceBefore).to.equal(u(20));
    });

    it("rejects cancelled, expired, and badly-signed orders", async () => {
      const base = {
        maker: alice.address,
        isSell: true,
        cohortId: 1n,
        shareAmount: u(10),
        usdcAmount: u(10),
        nonce: 3n,
        deadline: BigInt(2_000_000_000),
      };
      const sig = await signOrder(alice, base);

      // cancelled
      await campaign.connect(alice).cancelOrder(base);
      await expect(campaign.connect(bob).fillOrder(base, sig, u(1))).to.be.revertedWithCustomError(
        campaign,
        "OrderInactive"
      );

      // expired
      const expired = { ...base, nonce: 4n, deadline: 1n };
      const sig2 = await signOrder(alice, expired);
      await expect(campaign.connect(bob).fillOrder(expired, sig2, u(1))).to.be.revertedWithCustomError(
        campaign,
        "OrderExpired"
      );

      // wrong signer
      const order3 = { ...base, nonce: 5n };
      const badSig = await signOrder(bob, order3); // bob signs alice's order
      await expect(campaign.connect(bob).fillOrder(order3, badSig, u(1))).to.be.revertedWithCustomError(
        campaign,
        "BadSignature"
      );
    });

    it("transfer preserves the seller's accrued reward; buyer earns only future", async () => {
      // reset to clean 2-holder cohort
      await campaign.connect(angel).returnFunds(u(100), 1); // 1 USDC / share -> alice 50, bob 50 owed
      expect(await campaign.pendingRewardOf(alice.address, [1])).to.equal(u(50));

      // alice sells all her 50 shares to carol
      await campaign.connect(alice).transferShares(1, carol.address, u(50));

      // alice keeps her already-accrued 50 (now realised), carol starts fresh
      expect(await campaign.pendingRewardOf(alice.address, [1])).to.equal(u(50));
      expect(await campaign.pendingRewardOf(carol.address, [1])).to.equal(0);

      // next distribution goes to current holders (bob 50, carol 50)
      await campaign.connect(angel).returnFunds(u(100), 1);
      expect(await campaign.pendingRewardOf(carol.address, [1])).to.equal(u(50));
      expect(await campaign.pendingRewardOf(bob.address, [1])).to.equal(u(100));
      expect(await campaign.pendingRewardOf(alice.address, [1])).to.equal(u(50)); // unchanged

      // everyone can actually claim; totals reconcile to 200 distributed
      const before = async (w: HardhatEthersSigner) => usdc.balanceOf(w.address);
      const a0 = await before(alice), b0 = await before(bob), c0 = await before(carol);
      await campaign.connect(alice).claim([1]);
      await campaign.connect(bob).claim([1]);
      await campaign.connect(carol).claim([1]);
      const paid =
        ((await before(alice)) - a0) + ((await before(bob)) - b0) + ((await before(carol)) - c0);
      expect(paid).to.equal(u(200));
      expect(await campaign.rewardReserves()).to.equal(0);
    });
  });
});
