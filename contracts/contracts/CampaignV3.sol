// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  CampaignV3 — pool-of-deposits with mint-on-withdrawal cohorts.

  MENTAL MODEL (matches the Akrenia whiteboard exactly)
  ─────────────────────────────────────────────────────
  • Believers deposit USDC into ONE shared pool. Their pool balance is fully
    refundable, any time, 1:1 — until the angel actually takes it.
  • When the angel WITHDRAWS `amount`, that is the moment cohort shares are born:
    a fraction  f = amount / poolTotal  of EVERY depositor's current pool balance
    is converted into shares of a brand-new cohort C_n. The un-taken remainder
    stays in the pool, still refundable. Nobody's un-withdrawn money is ever frozen.
  • The angel returns profit either to ONE cohort (returnFunds) or uniformly per
    share across ALL cohorts (returnFundsToAll). Believers claim it as USDC.

  WHY THIS IS CHEAP
  ─────────────────
  A withdrawal must convert a slice of thousands of balances at once. We never
  iterate holders. Instead each withdrawal stores one number — the conversion
  fraction f_n — and every believer's shares are computed lazily the next time
  they touch the contract (`_settle`), by replaying the fractions they missed:

        for each cohort n created since I last acted:
            myShares[n] = myPool * f_n      // my slice of that withdrawal
            myPool      = myPool - myShares[n]

  Rewards use a classic per-share accumulator (targeted) plus one global
  accumulator (uniform), so both distribution kinds are O(1).

  No external libraries: a minimal IERC20, an inline safe-transfer, a reentrancy
  latch and an init latch are all defined here on purpose.
*/

interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
  function balanceOf(address account) external view returns (uint256);
}

contract CampaignV3 {
  // ─────────────────────────── fixed-point ───────────────────────────
  // RAY = 1e27. Fractions (f_n) and reward-per-share accumulators are scaled by RAY.
  uint256 private constant RAY = 1e27;

  // ─────────────────────────── errors ───────────────────────────
  error AlreadyInitialized();
  error NotAngel();
  error ZeroAddress();
  error ZeroAmount();
  error Reentrancy();
  error InsufficientPool();      // angel tried to withdraw more than the refundable pool
  error InsufficientRefund();    // believer tried to refund more than their pool balance
  error EmptyCohort();           // distribute to a cohort / set with no shares
  error UnknownCohort();
  error TransferFailed();

  // ─────────────────────────── events ───────────────────────────
  event Initialized(address indexed angel, address indexed token);
  event Deposited(address indexed believer, uint256 amount);
  event Refunded(address indexed believer, uint256 amount);
  event Withdrawn(uint256 indexed cohortId, uint256 amount, uint256 fractionRay);
  event FundsReturned(uint256 indexed cohortId, uint256 amount);
  event FundsReturnedToAll(uint256 amount);
  event Claimed(address indexed believer, uint256 amount);

  // ─────────────────────────── config ───────────────────────────
  address public angel;
  IERC20 public token;
  bool private _initialized;
  uint256 private _lock;

  // ─────────────────────────── pool state ───────────────────────────
  /// @notice Total refundable USDC currently in the pool (source of truth for `f`).
  /// Maintained eagerly: += on deposit, -= on withdrawal, -= on refund.
  uint256 public poolTotal;

  /// @notice A believer's refundable pool balance AS OF `settledUpTo[user]`.
  /// Their true current balance is this minus the conversions from later cohorts,
  /// realised lazily in `_settle`.
  mapping(address => uint256) private _poolBalance;

  /// @notice Highest cohort id already applied to a believer's pool balance.
  mapping(address => uint256) public settledUpTo;

  // ─────────────────────────── cohort state ───────────────────────────
  /// @notice Number of withdrawals so far; also the id of the newest cohort (1-based).
  uint256 public currentCohort;

  /// @notice f_n — fraction (RAY) of the pool converted into cohort n at its withdrawal.
  mapping(uint256 => uint256) public cohortFractionRay;

  /// @notice Total shares in cohort n. Equals the USDC amount withdrawn to create it.
  mapping(uint256 => uint256) public totalCohortShares;

  /// @notice A believer's (materialised) shares of cohort n.
  mapping(uint256 => mapping(address => uint256)) private _cohortShares;

  /// @notice Sum of all cohorts' shares — denominator for `returnFundsToAll`.
  uint256 public totalShares;

  // ─────────────────────────── reward state ───────────────────────────
  /// @notice Per-share reward accumulator (RAY) for a single cohort (targeted returns).
  mapping(uint256 => uint256) public cohortAccRay;

  /// @notice Uniform per-share reward accumulator (RAY), shared by every cohort.
  uint256 public globalAccRay;

  /// @notice Snapshot of `globalAccRay` when a cohort was born, so it never earns
  /// uniform rewards distributed before it existed.
  mapping(uint256 => uint256) public globalAccAtBirthRay;

  /// @notice Reward already accounted for a believer in a cohort (accumulator debt).
  mapping(uint256 => mapping(address => uint256)) private _rewardDebt;

  /// @notice USDC earmarked for distributed-but-unclaimed rewards (angel can't take it).
  uint256 public rewardReserves;

  // ─────────────────────────── modifiers ───────────────────────────
  modifier onlyAngel() {
    if (msg.sender != angel) revert NotAngel();
    _;
  }

  modifier nonReentrant() {
    if (_lock == 1) revert Reentrancy();
    _lock = 1;
    _;
    _lock = 0;
  }

  // NOTE: when a clone factory is added, lock the implementation (`_initialized = true`
  // in the constructor) or restrict `initialize` to the factory, to prevent impl hijack.
  // Left open for now so V3 can be deployed and initialized directly while we iterate.

  function initialize(address _angel, address _token) external {
    if (_initialized) revert AlreadyInitialized();
    if (_angel == address(0) || _token == address(0)) revert ZeroAddress();
    _initialized = true;
    angel = _angel;
    token = IERC20(_token);
    emit Initialized(_angel, _token);
  }

  // ═══════════════════════════ believer actions ═══════════════════════════

  /// @notice Deposit USDC into the shared pool. Fully refundable until the angel
  /// withdraws it. Only future withdrawals convert this into cohort shares.
  function deposit(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    _settle(msg.sender);                 // fast-forward past cohorts (0 conversion if pool was 0)
    _poolBalance[msg.sender] += amount;
    poolTotal += amount;
    _pull(msg.sender, amount);
    emit Deposited(msg.sender, amount);
  }

  /// @notice Refund un-withdrawn pool balance 1:1. Available any time, for any
  /// amount up to the caller's current refundable balance. Cohort shares are untouched.
  function refund(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    _settle(msg.sender);
    if (amount > _poolBalance[msg.sender]) revert InsufficientRefund();
    _poolBalance[msg.sender] -= amount;
    poolTotal -= amount;
    _push(msg.sender, amount);
    emit Refunded(msg.sender, amount);
  }

  /// @notice Claim distributed rewards for the given cohorts (as USDC to the wallet).
  /// The caller passes the cohorts they hold shares in; gas stays caller-bounded.
  function claim(uint256[] calldata cohortIds) external nonReentrant {
    _settle(msg.sender);
    uint256 owed;
    for (uint256 i = 0; i < cohortIds.length; i++) {
      uint256 n = cohortIds[i];
      if (n == 0 || n > currentCohort) revert UnknownCohort();
      uint256 shares = _cohortShares[n][msg.sender];
      if (shares == 0) continue;
      uint256 accrued = shares * (cohortAccRay[n] + globalAccRay) / RAY;
      uint256 pending = accrued - _rewardDebt[n][msg.sender];
      if (pending > 0) {
        _rewardDebt[n][msg.sender] = accrued;
        owed += pending;
      }
    }
    if (owed == 0) revert ZeroAmount();
    rewardReserves -= owed;
    _push(msg.sender, owed);
    emit Claimed(msg.sender, owed);
  }

  // ═══════════════════════════ angel actions ═══════════════════════════

  /// @notice Take `amount` USDC out of the pool. This mints a new cohort: a
  /// fraction `amount / poolTotal` of every believer's pool balance becomes shares
  /// of it. Un-taken balance stays refundable.
  function withdraw(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 pool = poolTotal;
    if (amount > pool) revert InsufficientPool();

    uint256 n = ++currentCohort;
    // fraction of the whole pool being converted, in RAY
    uint256 f = amount * RAY / pool;
    cohortFractionRay[n] = f;
    totalCohortShares[n] = amount;       // shares minted == USDC taken (1:1)
    totalShares += amount;
    globalAccAtBirthRay[n] = globalAccRay;

    poolTotal = pool - amount;
    _push(angel, amount);
    emit Withdrawn(n, amount, f);
  }

  /// @notice Return `amount` USDC as reward to a single cohort, pro-rata to its shares.
  function returnFunds(uint256 amount, uint256 cohortId) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    if (cohortId == 0 || cohortId > currentCohort) revert UnknownCohort();
    uint256 shares = totalCohortShares[cohortId];
    if (shares == 0) revert EmptyCohort();
    _pull(msg.sender, amount);
    cohortAccRay[cohortId] += amount * RAY / shares;
    rewardReserves += amount;
    emit FundsReturned(cohortId, amount);
  }

  /// @notice Return `amount` USDC uniformly per share across EVERY cohort.
  /// Each share (regardless of cohort) receives `amount / totalShares`.
  function returnFundsToAll(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 shares = totalShares;
    if (shares == 0) revert EmptyCohort();
    _pull(msg.sender, amount);
    globalAccRay += amount * RAY / shares;
    rewardReserves += amount;
    emit FundsReturnedToAll(amount);
  }

  // ═══════════════════════════ settlement ═══════════════════════════

  /// @dev Realise a believer's cohort shares for every withdrawal that happened
  /// since they last acted, then advance their settle pointer. This is the whole
  /// trick: a withdrawal touches no balances; each believer catches up lazily here.
  function _settle(address user) internal {
    uint256 n = settledUpTo[user];
    uint256 last = currentCohort;
    if (n == last) return;

    uint256 bal = _poolBalance[user];
    // Nothing to convert if the believer has no pool balance — just fast-forward.
    if (bal == 0) {
      settledUpTo[user] = last;
      return;
    }

    for (uint256 k = n + 1; k <= last; k++) {
      uint256 conv = bal * cohortFractionRay[k] / RAY;   // my slice of withdrawal k
      if (conv != 0) {
        _cohortShares[k][user] = conv;
        // Debt is set to the birth-time accumulator so the believer still earns
        // any uniform reward distributed after this cohort was created.
        _rewardDebt[k][user] = conv * globalAccAtBirthRay[k] / RAY;
        bal -= conv;
      }
      if (bal == 0) { k = last; }        // fully converted — skip the rest cheaply
    }

    _poolBalance[user] = bal;
    settledUpTo[user] = last;
  }

  // ═══════════════════════════ views ═══════════════════════════

  /// @notice A believer's current refundable pool balance (simulates pending settles).
  function refundableOf(address user) public view returns (uint256 bal) {
    bal = _poolBalance[user];
    if (bal == 0) return 0;
    for (uint256 k = settledUpTo[user] + 1; k <= currentCohort; k++) {
      bal -= bal * cohortFractionRay[k] / RAY;
      if (bal == 0) break;
    }
  }

  /// @notice A believer's shares of cohort `n` (simulates a pending settle if needed).
  function cohortSharesOf(address user, uint256 n) public view returns (uint256) {
    if (n == 0 || n > currentCohort) return 0;
    if (n <= settledUpTo[user]) return _cohortShares[n][user];
    // replay conversions from the last settle up to cohort n
    uint256 bal = _poolBalance[user];
    for (uint256 k = settledUpTo[user] + 1; k < n; k++) {
      bal -= bal * cohortFractionRay[k] / RAY;
    }
    return bal * cohortFractionRay[n] / RAY;
  }

  /// @notice Unclaimed reward a believer can currently claim across the given cohorts.
  function pendingRewardOf(address user, uint256[] calldata cohortIds) external view returns (uint256 owed) {
    for (uint256 i = 0; i < cohortIds.length; i++) {
      uint256 n = cohortIds[i];
      if (n == 0 || n > currentCohort) continue;
      uint256 shares = cohortSharesOf(user, n);
      if (shares == 0) continue;
      uint256 accrued = shares * (cohortAccRay[n] + globalAccRay) / RAY;
      uint256 debt = n <= settledUpTo[user]
        ? _rewardDebt[n][user]
        : shares * globalAccAtBirthRay[n] / RAY;      // debt it WOULD get on settle
      if (accrued > debt) owed += accrued - debt;
    }
  }

  // ═══════════════════════════ token plumbing ═══════════════════════════

  function _pull(address from, uint256 amount) private {
    _call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
  }

  function _push(address to, uint256 amount) private {
    _call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
  }

  /// @dev Low-level ERC20 call that accepts both bool-returning and void tokens
  /// (USDC returns bool). Reverts on failure or an explicit `false`.
  function _call(bytes memory data) private {
    (bool ok, bytes memory ret) = address(token).call(data);
    if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
  }
}
