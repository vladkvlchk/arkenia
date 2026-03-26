const { ethers } = require("hardhat");

const fmt = (wei: bigint) => ethers.formatUnits(wei, 6);
const usdc = (amount: string) => ethers.parseUnits(amount, 6);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${testName}`);
    failed++;
    failures.push(testName);
  }
}

async function expectRevert(fn: () => Promise<any>, testName: string) {
  try {
    await fn();
    console.log(`  ✗ FAIL (did not revert): ${testName}`);
    failed++;
    failures.push(testName);
  } catch {
    console.log(`  ✓ ${testName}`);
    passed++;
  }
}

// Helper: deploy fresh Campaign + Factory + MockUSDC
async function deployAll() {
  const Campaign = await ethers.getContractFactory("Campaign");
  const campaignImpl = await Campaign.deploy();
  await campaignImpl.waitForDeployment();

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(await campaignImpl.getAddress());
  await factory.waitForDeployment();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();

  return { campaignImpl, factory, mockUsdc };
}

// Helper: create campaign via factory and return Campaign contract
async function createCampaign(factory: any, creator: any, floor: string, ceil: string, tokenAddr: string) {
  await factory.connect(creator).createCampaign(usdc(floor), usdc(ceil), tokenAddr);
  const campaigns = await factory.getCampaigns();
  return await ethers.getContractAt("Campaign", campaigns[campaigns.length - 1]);
}

// Helper: give USDC to user
async function giveUsdc(mockUsdc: any, deployer: any, user: any, amount: string) {
  await mockUsdc.connect(deployer).transfer(user.address, usdc(amount));
}

// Helper: approve and deposit
async function approveAndDeposit(mockUsdc: any, campaign: any, user: any, amount: string) {
  await mockUsdc.connect(user).approve(await campaign.getAddress(), usdc(amount));
  await campaign.connect(user).deposit(usdc(amount));
}

async function main() {
  const [deployer, alice, bob, charlie, dave, eve] = await ethers.getSigners();

  // ================================================================
  // DEPLOY
  // ================================================================
  console.log("\n=== DEPLOY ===");

  const { campaignImpl, factory, mockUsdc } = await deployAll();
  const implAddress = await campaignImpl.getAddress();
  const usdcAddress = await mockUsdc.getAddress();

  assert(implAddress !== ethers.ZeroAddress, "Campaign implementation deploys");
  assert(await factory.implementation() === implAddress, "Factory has correct implementation");
  assert(await mockUsdc.balanceOf(deployer.address) === usdc("1000000"), "MockUSDC deploys, deployer gets 1M USDC");

  // ================================================================
  // TOKEN WHITELIST
  // ================================================================
  console.log("\n=== TOKEN WHITELIST ===");

  await factory.addToken(usdcAddress);
  assert(await factory.allowedTokens(usdcAddress) === true, "Owner can addToken");

  await factory.disableToken(usdcAddress);
  assert(await factory.allowedTokens(usdcAddress) === false, "Owner can disableToken");

  await expectRevert(
    () => factory.connect(alice).addToken(usdcAddress),
    "Non-owner cannot addToken"
  );

  await expectRevert(
    () => factory.connect(alice).disableToken(usdcAddress),
    "Non-owner cannot disableToken"
  );

  await expectRevert(
    () => factory.connect(alice).createCampaign(usdc("1000"), usdc("5000"), usdcAddress),
    "createCampaign with non-whitelisted token reverts"
  );

  await factory.addToken(usdcAddress);
  await factory.disableToken(usdcAddress);
  await expectRevert(
    () => factory.connect(alice).createCampaign(usdc("1000"), usdc("5000"), usdcAddress),
    "createCampaign with disabled token reverts"
  );

  // re-enable for remaining tests
  await factory.addToken(usdcAddress);

  // ================================================================
  // CAMPAIGN CREATION
  // ================================================================
  console.log("\n=== CAMPAIGN CREATION ===");

  // bounded: floor=1000, ceil=5000
  const cBounded = await createCampaign(factory, alice, "1000", "5000", usdcAddress);
  assert(await cBounded.creator() === alice.address, "Bounded campaign: correct creator");
  assert(await cBounded.floor() === usdc("1000"), "Bounded campaign: correct floor");
  assert(await cBounded.ceil() === usdc("5000"), "Bounded campaign: correct ceil");
  assert(await cBounded.token() === usdcAddress, "Bounded campaign: correct token");

  // min only: floor=1000, ceil=0
  const cMinOnly = await createCampaign(factory, bob, "1000", "0", usdcAddress);
  assert(await cMinOnly.floor() === usdc("1000"), "Min-only campaign: correct floor");
  assert(await cMinOnly.ceil() === usdc("0"), "Min-only campaign: ceil is 0");

  // cap only: floor=0, ceil=5000
  const cCapOnly = await createCampaign(factory, charlie, "0", "5000", usdcAddress);
  assert(await cCapOnly.floor() === usdc("0"), "Cap-only campaign: floor is 0");
  assert(await cCapOnly.ceil() === usdc("5000"), "Cap-only campaign: correct ceil");

  // no limits: floor=0, ceil=0
  const cNoLimits = await createCampaign(factory, dave, "0", "0", usdcAddress);
  assert(await cNoLimits.floor() === usdc("0"), "No-limits campaign: floor is 0");
  assert(await cNoLimits.ceil() === usdc("0"), "No-limits campaign: ceil is 0");

  const allCampaigns = await factory.getCampaigns();
  assert(allCampaigns.length === 4, "getCampaigns returns all 4 campaigns");

  await expectRevert(
    () => cBounded.initialize(eve.address, usdc("100"), usdc("200"), usdcAddress),
    "Cannot initialize a campaign twice"
  );

  // ================================================================
  // DEPOSIT
  // ================================================================
  console.log("\n=== DEPOSIT ===");

  // Give users USDC
  await giveUsdc(mockUsdc, deployer, charlie, "20000");
  await giveUsdc(mockUsdc, deployer, dave, "20000");
  await giveUsdc(mockUsdc, deployer, eve, "20000");

  // --- Basic deposit (using cBounded: floor=1000, ceil=5000) ---
  await approveAndDeposit(mockUsdc, cBounded, charlie, "500");
  assert(await cBounded.totalRaised() === usdc("500"), "Basic deposit works");
  assert(await cBounded.invests(charlie.address) === usdc("500"), "Investor balance updated");

  // Multiple investors
  await approveAndDeposit(mockUsdc, cBounded, dave, "1000");
  assert(await cBounded.totalRaised() === usdc("1500"), "Multiple investors can deposit");

  // Deposit trims when exceeding ceil
  await mockUsdc.connect(eve).approve(await cBounded.getAddress(), usdc("5000"));
  await cBounded.connect(eve).deposit(usdc("5000"));
  assert(await cBounded.totalRaised() === usdc("5000"), "Deposit trims to ceil (1500 + 5000 → 5000)");
  assert(await cBounded.invests(eve.address) === usdc("3500"), "Trimmed investor got 3500, not 5000");

  // Deposit reverts when at ceil
  await expectRevert(
    () => approveAndDeposit(mockUsdc, cBounded, charlie, "1"),
    "Deposit reverts when totalRaised == ceil"
  );

  // --- Without ceil (cNoLimits: floor=0, ceil=0) ---
  await approveAndDeposit(mockUsdc, cNoLimits, charlie, "10000");
  assert(await cNoLimits.totalRaised() === usdc("10000"), "No ceil: deposit any amount works");

  await approveAndDeposit(mockUsdc, cNoLimits, dave, "5000");
  assert(await cNoLimits.totalRaised() === usdc("15000"), "No ceil: no trimming happens");

  // Deposit after withdraw reverts
  // (use cCapOnly for this: floor=0, ceil=5000)
  await approveAndDeposit(mockUsdc, cCapOnly, charlie, "2000");
  await cCapOnly.connect(charlie).withdraw(); // charlie is creator of cCapOnly
  await expectRevert(
    () => approveAndDeposit(mockUsdc, cCapOnly, dave, "100"),
    "Deposit after withdraw reverts"
  );

  // ================================================================
  // WITHDRAW
  // ================================================================
  console.log("\n=== WITHDRAW ===");

  // Fresh campaign for withdraw tests: floor=1000, ceil=5000
  const cWithdraw = await createCampaign(factory, alice, "1000", "5000", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "5000");

  // Cannot withdraw when totalRaised == 0
  await expectRevert(
    () => cWithdraw.connect(alice).withdraw(),
    "Cannot withdraw when totalRaised == 0"
  );

  // Deposit below floor
  await approveAndDeposit(mockUsdc, cWithdraw, charlie, "500");

  // Cannot withdraw when totalRaised < floor
  await expectRevert(
    () => cWithdraw.connect(alice).withdraw(),
    "Withdraw reverts when totalRaised < floor"
  );

  // Non-creator cannot withdraw
  await expectRevert(
    () => cWithdraw.connect(charlie).withdraw(),
    "Non-creator cannot withdraw"
  );

  // Deposit to reach floor
  await approveAndDeposit(mockUsdc, cWithdraw, charlie, "500");
  assert(await cWithdraw.totalRaised() === usdc("1000"), "totalRaised == floor");

  // Creator can withdraw
  const aliceBalanceBefore = await mockUsdc.balanceOf(alice.address);
  await cWithdraw.connect(alice).withdraw();
  const aliceBalanceAfter = await mockUsdc.balanceOf(alice.address);
  assert(aliceBalanceAfter - aliceBalanceBefore === usdc("1000"), "Creator receives totalRaised on withdraw");
  assert(await cWithdraw.withdrawnAt() > 0n, "withdrawnAt is set");

  // Cannot withdraw twice
  await expectRevert(
    () => cWithdraw.connect(alice).withdraw(),
    "Cannot withdraw twice"
  );

  // --- Without floor (floor=0): withdraw with any amount ---
  const cNoFloor = await createCampaign(factory, alice, "0", "0", usdcAddress);
  await giveUsdc(mockUsdc, deployer, dave, "1");
  await approveAndDeposit(mockUsdc, cNoFloor, dave, "1");
  await cNoFloor.connect(alice).withdraw();
  assert(await cNoFloor.withdrawnAt() > 0n, "No floor: withdraw works with any totalRaised > 0");

  // ================================================================
  // REFUND
  // ================================================================
  console.log("\n=== REFUND ===");

  // Fresh campaign for refund tests
  const cRefund = await createCampaign(factory, alice, "1000", "5000", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "5000");
  await giveUsdc(mockUsdc, deployer, dave, "5000");

  await approveAndDeposit(mockUsdc, cRefund, charlie, "2000");
  await approveAndDeposit(mockUsdc, cRefund, dave, "1500");

  // Partial refund
  const charlieBefore = await mockUsdc.balanceOf(charlie.address);
  await cRefund.connect(charlie).refund(usdc("500"));
  assert(await cRefund.invests(charlie.address) === usdc("1500"), "Partial refund: invests updated");
  assert(await cRefund.totalRaised() === usdc("3000"), "Partial refund: totalRaised updated");
  assert(await mockUsdc.balanceOf(charlie.address) - charlieBefore === usdc("500"), "Partial refund: USDC returned");

  // Full refund
  await cRefund.connect(dave).refund(usdc("1500"));
  assert(await cRefund.invests(dave.address) === usdc("0"), "Full refund: invests is 0");
  assert(await cRefund.totalRaised() === usdc("1500"), "Full refund: totalRaised updated");

  // Refund more than invested reverts
  await expectRevert(
    () => cRefund.connect(charlie).refund(usdc("2000")),
    "Refund reverts when amount > invested"
  );

  // Refund then deposit again
  await approveAndDeposit(mockUsdc, cRefund, dave, "800");
  assert(await cRefund.invests(dave.address) === usdc("800"), "Refund then deposit again works");

  // Refund drops below floor → creator can't withdraw
  await cRefund.connect(dave).refund(usdc("800"));
  // totalRaised = 1500 - 800 + 800 - 800 = wait, let me recalc
  // charlie: 1500, dave: 0, totalRaised = 1500. then dave deposits 800 → totalRaised = 2300. then dave refunds 800 → totalRaised = 1500
  assert(await cRefund.totalRaised() === usdc("1500"), "After refund dance: totalRaised is 1500");
  // floor is 1000, so withdraw should work here. Let's make it go under floor:
  await cRefund.connect(charlie).refund(usdc("1000"));
  assert(await cRefund.totalRaised() === usdc("500"), "Refunded below floor");
  await expectRevert(
    () => cRefund.connect(alice).withdraw(),
    "Refund drops below floor → creator can't withdraw"
  );

  // Refund after withdraw reverts
  const cRefundAfter = await createCampaign(factory, alice, "0", "0", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "1000");
  await approveAndDeposit(mockUsdc, cRefundAfter, charlie, "1000");
  await cRefundAfter.connect(alice).withdraw();
  await expectRevert(
    () => cRefundAfter.connect(charlie).refund(usdc("500")),
    "Refund after withdraw reverts"
  );

  // ================================================================
  // RETURN FUNDS
  // ================================================================
  console.log("\n=== RETURN FUNDS ===");

  // Fresh campaign
  const cReturn = await createCampaign(factory, alice, "0", "0", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "3000");
  await approveAndDeposit(mockUsdc, cReturn, charlie, "3000");

  // Cannot return before withdraw
  await expectRevert(
    () => cReturn.connect(alice).returnFunds(usdc("100")),
    "Cannot return funds before withdraw"
  );

  await cReturn.connect(alice).withdraw();

  // Non-creator cannot return
  await expectRevert(
    () => cReturn.connect(charlie).returnFunds(usdc("100")),
    "Non-creator cannot return funds"
  );

  // Return 0 reverts
  await expectRevert(
    () => cReturn.connect(alice).returnFunds(usdc("0")),
    "Return 0 reverts"
  );

  // Creator returns funds
  await mockUsdc.connect(alice).approve(await cReturn.getAddress(), usdc("1000"));
  await cReturn.connect(alice).returnFunds(usdc("1000"));
  assert(await cReturn.returnedAmount() === usdc("1000"), "Creator returns 1000");

  // Creator returns more
  await mockUsdc.connect(alice).approve(await cReturn.getAddress(), usdc("500"));
  await cReturn.connect(alice).returnFunds(usdc("500"));
  assert(await cReturn.returnedAmount() === usdc("1500"), "Creator returns multiple times (1000 + 500)");

  // ================================================================
  // CLAIM
  // ================================================================
  console.log("\n=== CLAIM ===");

  // Fresh campaign with 3 investors
  const cClaim = await createCampaign(factory, alice, "0", "0", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "5000");
  await giveUsdc(mockUsdc, deployer, dave, "5000");
  await giveUsdc(mockUsdc, deployer, eve, "5000");

  await approveAndDeposit(mockUsdc, cClaim, charlie, "400");
  await approveAndDeposit(mockUsdc, cClaim, dave, "300");
  await approveAndDeposit(mockUsdc, cClaim, eve, "300");
  // totalRaised = 1000

  // Cannot claim before return
  await cClaim.connect(alice).withdraw();
  await expectRevert(
    () => cClaim.connect(charlie).claim(),
    "Cannot claim if nothing returned"
  );

  // Not an investor
  await expectRevert(
    () => cClaim.connect(bob).claim(),
    "Cannot claim if not investor"
  );

  // Return 500 → proportional claims: charlie 200, dave 150, eve 150
  await mockUsdc.connect(alice).approve(await cClaim.getAddress(), usdc("500"));
  await cClaim.connect(alice).returnFunds(usdc("500"));

  const charlieClaim1Before = await mockUsdc.balanceOf(charlie.address);
  await cClaim.connect(charlie).claim();
  assert(
    await mockUsdc.balanceOf(charlie.address) - charlieClaim1Before === usdc("200"),
    "Charlie claims 200 (400/1000 * 500)"
  );

  const daveClaim1Before = await mockUsdc.balanceOf(dave.address);
  await cClaim.connect(dave).claim();
  assert(
    await mockUsdc.balanceOf(dave.address) - daveClaim1Before === usdc("150"),
    "Dave claims 150 (300/1000 * 500)"
  );

  const eveClaim1Before = await mockUsdc.balanceOf(eve.address);
  await cClaim.connect(eve).claim();
  assert(
    await mockUsdc.balanceOf(eve.address) - eveClaim1Before === usdc("150"),
    "Eve claims 150 (300/1000 * 500)"
  );

  // Cannot claim twice for same returnedAmount
  await expectRevert(
    () => cClaim.connect(charlie).claim(),
    "Cannot claim twice for same returnedAmount"
  );

  // Partial return → claim → more return → claim again
  await mockUsdc.connect(alice).approve(await cClaim.getAddress(), usdc("500"));
  await cClaim.connect(alice).returnFunds(usdc("500"));
  // returnedAmount = 1000 now. charlie total = 400/1000*1000 = 400. already claimed 200. claimable = 200

  const charlieClaim2Before = await mockUsdc.balanceOf(charlie.address);
  await cClaim.connect(charlie).claim();
  assert(
    await mockUsdc.balanceOf(charlie.address) - charlieClaim2Before === usdc("200"),
    "Charlie claims again after more return (200 more)"
  );

  // ================================================================
  // FULL LIFECYCLE
  // ================================================================
  console.log("\n=== FULL LIFECYCLE ===");

  // Happy path: deposit → withdraw → returnFunds → claim
  const cHappy = await createCampaign(factory, alice, "500", "2000", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "3000");
  await giveUsdc(mockUsdc, deployer, dave, "3000");

  await approveAndDeposit(mockUsdc, cHappy, charlie, "800");
  await approveAndDeposit(mockUsdc, cHappy, dave, "700");
  // totalRaised = 1500
  assert(await cHappy.totalRaised() === usdc("1500"), "Lifecycle: deposits done");

  await cHappy.connect(alice).withdraw();
  assert(await cHappy.withdrawnAt() > 0n, "Lifecycle: withdrawn");

  await mockUsdc.connect(alice).approve(await cHappy.getAddress(), usdc("1500"));
  await cHappy.connect(alice).returnFunds(usdc("1500"));
  assert(await cHappy.returnedAmount() === usdc("1500"), "Lifecycle: funds returned");

  await cHappy.connect(charlie).claim();
  await cHappy.connect(dave).claim();
  assert(await cHappy.claimed(charlie.address) === usdc("800"), "Lifecycle: charlie claimed full share");
  assert(await cHappy.claimed(dave.address) === usdc("700"), "Lifecycle: dave claimed full share");

  // Refund path: some refund → withdraw → return → claim
  const cMixed = await createCampaign(factory, alice, "0", "0", usdcAddress);
  await giveUsdc(mockUsdc, deployer, charlie, "2000");
  await giveUsdc(mockUsdc, deployer, dave, "2000");
  await giveUsdc(mockUsdc, deployer, eve, "2000");

  await approveAndDeposit(mockUsdc, cMixed, charlie, "1000");
  await approveAndDeposit(mockUsdc, cMixed, dave, "1000");
  await approveAndDeposit(mockUsdc, cMixed, eve, "1000");
  // totalRaised = 3000

  // eve refunds before withdraw
  await cMixed.connect(eve).refund(usdc("1000"));
  assert(await cMixed.totalRaised() === usdc("2000"), "Mixed: eve refunded, totalRaised = 2000");

  await cMixed.connect(alice).withdraw();
  // return 1000 to remaining investors (charlie 1000, dave 1000 of 2000 total)
  await mockUsdc.connect(alice).approve(await cMixed.getAddress(), usdc("1000"));
  await cMixed.connect(alice).returnFunds(usdc("1000"));

  await cMixed.connect(charlie).claim();
  await cMixed.connect(dave).claim();
  assert(await cMixed.claimed(charlie.address) === usdc("500"), "Mixed: charlie claims 500 (1000/2000 * 1000)");
  assert(await cMixed.claimed(dave.address) === usdc("500"), "Mixed: dave claims 500 (1000/2000 * 1000)");

  // eve cannot claim (invests == 0 after refund)
  await expectRevert(
    () => cMixed.connect(eve).claim(),
    "Mixed: refunded investor cannot claim"
  );

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log(`\n========================================`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log(`\nFailed tests:`);
    failures.forEach(f => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
}

main();
