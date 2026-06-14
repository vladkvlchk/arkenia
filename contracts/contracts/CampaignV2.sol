// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CampaignV2 — cohort-based fundraising with MasterChef-style reward accounting
/// @notice Believers deposit `token` and receive ERC1155 shares (1 token = 1 share) in the
/// currently active cohort. Each `withdraw` by the angel opens a new cohort, freezing the
/// previous one. The angel returns funds to specific cohorts; rewards are distributed pro-rata
/// via a per-cohort accumulator. Shares are never burned on withdraw/returnFunds — they remain
/// a permanent claim on future distributions (exit only via `refund` on the active cohort, or
/// via an external premarket).
///
/// @dev TRUST / TOKEN INVARIANT: `token` MUST be a standard, non-fee-on-transfer, non-rebasing
/// ERC20 (e.g. USDC). The factory whitelist is the enforcement point. `deposit` mints shares 1:1
/// with the requested amount and does NOT measure the actually-received balance, so a
/// fee-on-transfer token would over-mint shares and break solvency. Only whitelist honest tokens.
contract CampaignV2 is Initializable, ReentrancyGuard, ERC1155 {
  using SafeERC20 for IERC20;

  uint256 private constant ACC_PRECISION = 1e18;

  error ZeroAddress();
  error ZeroAmount();
  error Unauthorized();
  error DepositsArePaused();
  error AlreadyPaused();
  error NotPaused();
  error EmptyCohort();
  error ExceedsWithdrawable();

  event Initialized(address indexed angel, address indexed token);
  event Deposited(address indexed believer, uint256 indexed cohortId, uint256 amount);
  event Paused();
  event Resumed();
  event FundsReturned(uint256 amount, uint256 indexed cohortId);
  event Claimed(address indexed believer, uint256 indexed cohortId, uint256 amount);
  event Withdrawn(uint256 amount, uint256 newCohort);
  event Refunded(address indexed believer, uint256 indexed cohortId, uint256 amount);

  address public angel;
  IERC20 public token;

  uint256 public currentCohort;
  bool public isPaused;

  /// @notice USDC currently earmarked for already-distributed rewards (returnFunds minus claims).
  /// `withdraw` can never push the contract balance below this floor.
  uint256 public totalRewardReserves;

  mapping(uint256 => uint256) public totalSharesInCohort;
  mapping(uint256 => uint256) public cumulativeRewardsPerShare;
  mapping(uint256 => mapping(address => uint256)) public rewardDebt;
  mapping(uint256 => mapping(address => uint256)) public pendingRewards;

  modifier onlyAngel() {
    if (msg.sender != angel) revert Unauthorized();
    _;
  }

  /// @dev Locks initializers on the implementation contract.
  /// Clones call `initialize()` themselves via the factory; the implementation
  /// must never be directly initializable — otherwise anyone could front-run
  /// initialization on the master copy and claim the `angel` role on it.
  constructor() ERC1155("") {
    _disableInitializers();
  }

  /// @notice One-shot initializer called by the factory on each clone.
  /// @dev Access is implicitly protected: the factory creates the clone and calls `initialize`
  /// atomically within a single transaction, so there is no window for a third party to
  /// front-run initialization. The `initializer` modifier additionally guarantees single use.
  /// @param _angel Address that will control withdraw / returnFunds / pause.
  /// @param _token ERC20 used for fundraising (e.g. USDC on Base). Must be non-fee-on-transfer.
  function initialize(address _angel, address _token) external initializer {
    if (_angel == address(0) || _token == address(0)) revert ZeroAddress();
    angel = _angel;
    token = IERC20(_token);
    emit Initialized(_angel, _token);
  }

  /// @notice Believer deposits `amount` of `token` and receives the same `amount`
  /// of ERC1155 shares minted in the currently active cohort (1 token = 1 share).
  /// @dev If `msg.sender` is a contract, it must implement
  /// `IERC1155Receiver.onERC1155Received` — otherwise `_mint` reverts. EOAs are unaffected.
  /// @param amount Amount of `token` to deposit (also the number of shares minted).
  function deposit(uint256 amount) external nonReentrant {
    if (isPaused) revert DepositsArePaused();
    if (amount == 0) revert ZeroAmount();
    uint256 cohortId = currentCohort;
    totalSharesInCohort[cohortId] += amount;
    token.safeTransferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, cohortId, amount, "");
    emit Deposited(msg.sender, cohortId, amount);
  }

  function pause() external onlyAngel {
    if (isPaused) revert AlreadyPaused();
    isPaused = true;
    emit Paused();
  }

  function resume() external onlyAngel {
    if (!isPaused) revert NotPaused();
    isPaused = false;
    emit Resumed();
  }

  /// @dev Settles accrued rewards for a single (account, cohort) pair and immediately syncs
  /// `rewardDebt`. The immediate sync makes settlement IDEMPOTENT: processing the same pair
  /// twice in one call (duplicate ids, or self-transfer) credits rewards only once.
  function _settle(address account, uint256 id, uint256 cumulative) private {
    uint256 accrued = balanceOf(account, id) * cumulative / ACC_PRECISION;
    pendingRewards[id][account] += accrued - rewardDebt[id][account];
    rewardDebt[id][account] = accrued;
  }

  /// @dev Reward-aware ERC1155 hook. Settles both sides BEFORE balances change (using old
  /// balances), then re-syncs `rewardDebt` to the NEW balances after the move.
  /// `to != from` guard prevents double-settling on self-transfers.
  function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
    for (uint256 i = 0; i < ids.length; i++) {
      uint256 cumulative = cumulativeRewardsPerShare[ids[i]];
      if (from != address(0)) _settle(from, ids[i], cumulative);
      if (to != address(0) && to != from) _settle(to, ids[i], cumulative);
    }
    super._update(from, to, ids, values);
    for (uint256 i = 0; i < ids.length; i++) {
      uint256 cumulative = cumulativeRewardsPerShare[ids[i]];
      if (from != address(0)) rewardDebt[ids[i]][from] = balanceOf(from, ids[i]) * cumulative / ACC_PRECISION;
      if (to != address(0)) rewardDebt[ids[i]][to] = balanceOf(to, ids[i]) * cumulative / ACC_PRECISION;
    }
  }

  /// @notice Claim accumulated rewards for one cohort.
  function claim(uint256 cohortId) external nonReentrant {
    uint256 cumulative = cumulativeRewardsPerShare[cohortId];
    uint256 balance = balanceOf(msg.sender, cohortId);
    uint256 total = balance * cumulative / ACC_PRECISION + pendingRewards[cohortId][msg.sender] - rewardDebt[cohortId][msg.sender];
    if (total == 0) revert ZeroAmount();
    pendingRewards[cohortId][msg.sender] = 0;
    rewardDebt[cohortId][msg.sender] = balance * cumulative / ACC_PRECISION;
    totalRewardReserves -= total;
    token.safeTransfer(msg.sender, total);
    emit Claimed(msg.sender, cohortId, total);
  }

  /// @notice Claim accumulated rewards for multiple cohorts in one tx.
  function claimAll(uint256[] calldata cohortIds) external nonReentrant {
    uint256 totalAmount = 0;
    for (uint256 i = 0; i < cohortIds.length; i++) {
      uint256 cohortId = cohortIds[i];
      uint256 cumulative = cumulativeRewardsPerShare[cohortId];
      uint256 balance = balanceOf(msg.sender, cohortId);
      uint256 amount = balance * cumulative / ACC_PRECISION + pendingRewards[cohortId][msg.sender] - rewardDebt[cohortId][msg.sender];
      if (amount > 0) {
        pendingRewards[cohortId][msg.sender] = 0;
        rewardDebt[cohortId][msg.sender] = balance * cumulative / ACC_PRECISION;
        totalAmount += amount;
        emit Claimed(msg.sender, cohortId, amount);
      }
    }
    if (totalAmount == 0) revert ZeroAmount();
    totalRewardReserves -= totalAmount;
    token.safeTransfer(msg.sender, totalAmount);
  }

  /// @notice Believer burns shares from the active cohort and receives USDC 1:1.
  /// Only available for the current cohort — past cohorts are locked (exit via premarket).
  /// Any rewards accumulated before refund remain claimable via `claim` (settled in `_update`).
  function refund(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 cohortId = currentCohort;
    totalSharesInCohort[cohortId] -= amount;
    _burn(msg.sender, cohortId, amount);
    token.safeTransfer(msg.sender, amount);
    emit Refunded(msg.sender, cohortId, amount);
  }

  /// @notice Angel takes USDC from the pool. Opens a new cohort for future deposits.
  /// @dev Cannot take funds reserved for already-distributed rewards: the post-withdraw balance
  /// must stay >= `totalRewardReserves`, so believers who saw a `returnFunds` keep a safe claim.
  /// @param amount Amount of `token` to withdraw.
  function withdraw(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 withdrawable = token.balanceOf(address(this)) - totalRewardReserves;
    if (amount > withdrawable) revert ExceedsWithdrawable();
    uint256 newCohort = ++currentCohort;
    token.safeTransfer(angel, amount);
    emit Withdrawn(amount, newCohort);
  }

  /// @notice Angel returns funds to a single cohort. Distributed pro-rata among share holders.
  /// @param amount Amount of `token` to distribute.
  /// @param cohortId Target cohort (must hold shares).
  function returnFunds(uint256 amount, uint256 cohortId) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 shares = totalSharesInCohort[cohortId];
    if (shares == 0) revert EmptyCohort();
    token.safeTransferFrom(msg.sender, address(this), amount);
    cumulativeRewardsPerShare[cohortId] += amount * ACC_PRECISION / shares;
    totalRewardReserves += amount;
    emit FundsReturned(amount, cohortId);
  }

  /// @notice Angel returns funds split proportionally across multiple cohorts by share weight.
  /// Each non-empty cohort receives `amount * cohortShares / totalShares`; the last non-empty
  /// cohort absorbs the integer-division remainder so the full `amount` is always distributed.
  /// Empty cohorts in the list are skipped. Reverts if none of the listed cohorts hold shares.
  /// @param amount Total amount of `token` to distribute.
  /// @param cohortIds List of cohorts to distribute to.
  function returnFundsBatch(uint256 amount, uint256[] calldata cohortIds) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 len = cohortIds.length;
    if (len == 0) revert ZeroAmount();

    uint256 totalShares = 0;
    uint256 lastNonEmpty = type(uint256).max;
    for (uint256 i = 0; i < len; i++) {
      uint256 shares = totalSharesInCohort[cohortIds[i]];
      if (shares > 0) {
        totalShares += shares;
        lastNonEmpty = i;
      }
    }
    if (totalShares == 0) revert EmptyCohort();

    token.safeTransferFrom(msg.sender, address(this), amount);
    totalRewardReserves += amount;

    uint256 distributed = 0;
    for (uint256 i = 0; i < len; i++) {
      uint256 cohortId = cohortIds[i];
      uint256 cohortShares = totalSharesInCohort[cohortId];
      if (cohortShares == 0) continue;
      uint256 cohortAmount = i == lastNonEmpty
        ? amount - distributed
        : amount * cohortShares / totalShares;
      distributed += cohortAmount;
      cumulativeRewardsPerShare[cohortId] += cohortAmount * ACC_PRECISION / cohortShares;
      emit FundsReturned(cohortAmount, cohortId);
    }
  }
}
