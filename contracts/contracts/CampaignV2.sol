// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CampaignV2 is Initializable, ReentrancyGuard, ERC1155 {
  using SafeERC20 for IERC20;

  error ZeroAddress();
  error ZeroAmount();
  error Unauthorized();
  error DepositsArePaused();
  error AlreadyPaused();
  error NotPaused();

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
  /// @param _angel Address that will control withdraw / returnFunds / pause.
  /// @param _token ERC20 used for fundraising (e.g. USDC on Base).
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

  /// @dev Settles pending rewards for both sides before every transfer / mint / burn.
  /// Must run with old balances → settle first, then call super (which updates balances), then sync rewardDebt.
  function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
    for (uint256 i = 0; i < ids.length; i++) {
      uint256 id = ids[i];
      uint256 cumulative = cumulativeRewardsPerShare[id];
      if (from != address(0)) {
        pendingRewards[id][from] += balanceOf(from, id) * cumulative / 1e18 - rewardDebt[id][from];
      }
      if (to != address(0)) {
        pendingRewards[id][to] += balanceOf(to, id) * cumulative / 1e18 - rewardDebt[id][to];
      }
    }
    super._update(from, to, ids, values);
    for (uint256 i = 0; i < ids.length; i++) {
      uint256 id = ids[i];
      uint256 cumulative = cumulativeRewardsPerShare[id];
      if (from != address(0)) rewardDebt[id][from] = balanceOf(from, id) * cumulative / 1e18;
      if (to != address(0)) rewardDebt[id][to] = balanceOf(to, id) * cumulative / 1e18;
    }
  }

  /// @notice Claim accumulated rewards for one cohort.
  function claim(uint256 cohortId) external nonReentrant {
    uint256 cumulative = cumulativeRewardsPerShare[cohortId];
    uint256 balance = balanceOf(msg.sender, cohortId);
    uint256 total = balance * cumulative / 1e18 + pendingRewards[cohortId][msg.sender] - rewardDebt[cohortId][msg.sender];
    if (total == 0) revert ZeroAmount();
    pendingRewards[cohortId][msg.sender] = 0;
    rewardDebt[cohortId][msg.sender] = balance * cumulative / 1e18;
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
      uint256 amount = balance * cumulative / 1e18 + pendingRewards[cohortId][msg.sender] - rewardDebt[cohortId][msg.sender];
      if (amount > 0) {
        pendingRewards[cohortId][msg.sender] = 0;
        rewardDebt[cohortId][msg.sender] = balance * cumulative / 1e18;
        totalAmount += amount;
        emit Claimed(msg.sender, cohortId, amount);
      }
    }
    if (totalAmount == 0) revert ZeroAmount();
    token.safeTransfer(msg.sender, totalAmount);
  }

  /// @notice Believer burns shares from the active cohort and receives USDC 1:1.
  /// Only available for the current cohort — past cohorts are locked (exit via premarket).
  /// Any rewards accumulated before refund remain claimable via `claim`.
  function refund(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 cohortId = currentCohort;
    totalSharesInCohort[cohortId] -= amount;
    _burn(msg.sender, cohortId, amount);
    token.safeTransfer(msg.sender, amount);
    emit Refunded(msg.sender, cohortId, amount);
  }

  /// @notice Angel takes USDC from the pool. Opens a new cohort for future deposits.
  /// @param amount Amount of `token` to withdraw.
  function withdraw(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 newCohort = ++currentCohort;
    token.safeTransfer(angel, amount);
    emit Withdrawn(amount, newCohort);
  }

  /// @notice Angel returns funds to a single cohort.
  /// @param amount Amount of `token` to distribute.
  /// @param cohortId Target cohort.
  function returnFunds(uint256 amount, uint256 cohortId) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    token.safeTransferFrom(msg.sender, address(this), amount);
    cumulativeRewardsPerShare[cohortId] += amount * 1e18 / totalSharesInCohort[cohortId];
    emit FundsReturned(amount, cohortId);
  }

  /// @notice Angel returns funds distributed proportionally across multiple cohorts.
  /// Each cohort receives amount * cohortShares / totalShares across selected cohorts.
  /// @param amount Total amount of `token` to distribute.
  /// @param cohortIds List of cohorts to distribute to.
  function returnFundsBatch(uint256 amount, uint256[] calldata cohortIds) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 len = cohortIds.length;
    if (len == 0) revert ZeroAmount();

    uint256 totalShares = 0;
    for (uint256 i = 0; i < len; i++) {
      totalShares += totalSharesInCohort[cohortIds[i]];
    }

    token.safeTransferFrom(msg.sender, address(this), amount);

    uint256 distributed = 0;
    for (uint256 i = 0; i < len; i++) {
      uint256 cohortId = cohortIds[i];
      uint256 cohortShares = totalSharesInCohort[cohortId];
      if (cohortShares == 0) continue;
      // last cohort gets remainder to avoid dust from integer division
      uint256 cohortAmount = i == len - 1
        ? amount - distributed
        : amount * cohortShares / totalShares;
      distributed += cohortAmount;
      cumulativeRewardsPerShare[cohortId] += cohortAmount * 1e18 / cohortShares;
      emit FundsReturned(cohortAmount, cohortId);
    }
  }
}
