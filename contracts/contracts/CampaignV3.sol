// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  CampaignV3 — pool-of-deposits with mint-on-withdrawal cohorts + on-chain premarket.

  MENTAL MODEL (matches the Akrenia whiteboard exactly)
  ─────────────────────────────────────────────────────
  • Believers deposit USDC into ONE shared pool. Their pool balance is fully
    refundable, any time, 1:1 — until the angel actually takes it.
  • When the angel WITHDRAWS `amount`, cohort shares are born: a fraction
    f = amount / poolTotal of EVERY depositor's current pool balance converts into
    shares of a brand-new cohort C_n. The un-taken remainder stays refundable.
  • The angel returns profit to ONE cohort (returnFunds) or uniformly per share
    across ALL cohorts (returnFundsToAll). Believers claim it as USDC.
  • Cohort shares are transferable and tradeable on a built-in premarket:
    EIP-712 signed orders, filled peer-to-peer on-chain (partial fills supported).

  WHY IT SCALES
  ─────────────
  A withdrawal converts a slice of thousands of balances at once. We never iterate
  holders: each withdrawal stores one number f_n, and every believer's shares are
  realised lazily the next time they touch the contract (`_settle`). Rewards use a
  per-cohort accumulator (targeted) plus one global accumulator (uniform) — O(1).

  No external libraries: minimal IERC20, inline safe-transfer, reentrancy latch,
  init latch, and hand-rolled EIP-712 are all defined here on purpose.

  SOLVENCY
  ────────
  Contract USDC == poolTotal + rewardReserves at all times (two exact counters).
  Refunds decrement poolTotal; claims decrement rewardReserves; each underflow-
  reverts, so the two obligations can never raid one another. Integer flooring of
  conversions/rewards always rounds in the contract's favour.
*/

interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
  function balanceOf(address account) external view returns (uint256);
}

contract CampaignV3 {
  // ─────────────────────────── fixed-point ───────────────────────────
  uint256 private constant RAY = 1e27;
  // secp256k1 half-order, for EIP-2 low-s signature malleability protection
  uint256 private constant SECP_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

  // ─────────────────────────── errors ───────────────────────────
  error AlreadyInitialized();
  error NotAngel();
  error ZeroAddress();
  error ZeroAmount();
  error Reentrancy();
  error InsufficientPool();
  error InsufficientRefund();
  error InsufficientShares();
  error EmptyCohort();
  error UnknownCohort();
  error TransferFailed();
  error OrderExpired();
  error OrderInactive();
  error BadSignature();
  error Overfill();
  error NotMaker();

  // ─────────────────────────── events ───────────────────────────
  event Initialized(address indexed angel, address indexed token);
  event Deposited(address indexed believer, uint256 amount);
  event Refunded(address indexed believer, uint256 amount);
  event Withdrawn(uint256 indexed cohortId, uint256 amount, uint256 fractionRay);
  event FundsReturned(uint256 indexed cohortId, uint256 amount);
  event FundsReturnedToAll(uint256 amount);
  event Claimed(address indexed believer, uint256 amount);
  event SharesTransferred(uint256 indexed cohortId, address indexed from, address indexed to, uint256 amount);
  event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 cohortId, uint256 shares, uint256 usdc, bool makerIsSeller);
  event OrderCancelled(bytes32 indexed orderHash, address indexed maker);

  // ─────────────────────────── config ───────────────────────────
  address public angel;
  IERC20 public token;
  bool private _initialized;
  uint256 private _lock;
  bytes32 public DOMAIN_SEPARATOR;

  // ─────────────────────────── pool state ───────────────────────────
  uint256 public poolTotal;
  mapping(address => uint256) private _poolBalance;
  mapping(address => uint256) public settledUpTo;

  // ─────────────────────────── cohort state ───────────────────────────
  uint256 public currentCohort;
  mapping(uint256 => uint256) public cohortFractionRay;
  mapping(uint256 => uint256) public totalCohortShares;
  mapping(uint256 => mapping(address => uint256)) private _cohortShares;
  uint256 public totalShares;

  // ─────────────────────────── reward state ───────────────────────────
  mapping(uint256 => uint256) public cohortAccRay;
  uint256 public globalAccRay;
  mapping(uint256 => uint256) public globalAccAtBirthRay;
  mapping(uint256 => mapping(address => uint256)) private _rewardDebt;
  mapping(address => uint256) private _accruedReward; // realised, unclaimed USDC
  uint256 public rewardReserves;

  // ─────────────────────────── premarket state ───────────────────────────
  bytes32 private constant ORDER_TYPEHASH =
    keccak256("Order(address maker,bool isSell,uint256 cohortId,uint256 shareAmount,uint256 usdcAmount,uint256 nonce,uint256 deadline)");
  struct Order {
    address maker;
    bool isSell;        // true: maker sells cohort shares for USDC; false: maker buys shares with USDC
    uint256 cohortId;
    uint256 shareAmount;
    uint256 usdcAmount; // total USDC for the full shareAmount
    uint256 nonce;
    uint256 deadline;
  }
  mapping(bytes32 => uint256) public orderFilled;   // shares filled per order hash
  mapping(bytes32 => bool) public orderCancelled;

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

  // NOTE: implementation is locked in the constructor; campaigns are initialized clones.
  constructor() {
    _initialized = true;
  }

  function initialize(address _angel, address _token) external {
    if (_initialized) revert AlreadyInitialized();
    if (_angel == address(0) || _token == address(0)) revert ZeroAddress();
    _initialized = true;
    angel = _angel;
    token = IERC20(_token);
    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("CampaignV3"),
        keccak256("1"),
        block.chainid,
        address(this)
      )
    );
    emit Initialized(_angel, _token);
  }

  // ═══════════════════════════ believer actions ═══════════════════════════

  function deposit(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    _settle(msg.sender);
    _poolBalance[msg.sender] += amount;
    poolTotal += amount;
    _pull(msg.sender, amount);
    emit Deposited(msg.sender, amount);
  }

  function refund(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    _settle(msg.sender);
    if (amount > _poolBalance[msg.sender]) revert InsufficientRefund();
    _poolBalance[msg.sender] -= amount;
    poolTotal -= amount;                 // underflow-reverts: refunds can never exceed pool USDC
    _push(msg.sender, amount);
    emit Refunded(msg.sender, amount);
  }

  function claim(uint256[] calldata cohortIds) external nonReentrant {
    _settle(msg.sender);
    for (uint256 i = 0; i < cohortIds.length; i++) {
      uint256 n = cohortIds[i];
      if (n == 0 || n > currentCohort) revert UnknownCohort();
      _realizeReward(msg.sender, n);
      _resyncDebt(msg.sender, n);
    }
    uint256 owed = _accruedReward[msg.sender];
    if (owed == 0) revert ZeroAmount();
    _accruedReward[msg.sender] = 0;
    rewardReserves -= owed;              // underflow-reverts: claims can never exceed reserves
    _push(msg.sender, owed);
    emit Claimed(msg.sender, owed);
  }

  /// @notice Transfer cohort shares directly (premarket settlement uses the same path).
  function transferShares(uint256 cohortId, address to, uint256 amount) external nonReentrant {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    _moveShares(cohortId, msg.sender, to, amount);
  }

  // ═══════════════════════════ angel actions ═══════════════════════════

  function withdraw(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 pool = poolTotal;
    if (amount > pool) revert InsufficientPool();

    uint256 n = ++currentCohort;
    uint256 f = amount * RAY / pool;
    cohortFractionRay[n] = f;
    totalCohortShares[n] = amount;       // shares minted == USDC taken (1:1)
    totalShares += amount;
    globalAccAtBirthRay[n] = globalAccRay;

    poolTotal = pool - amount;
    _push(angel, amount);
    emit Withdrawn(n, amount, f);
  }

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

  function returnFundsToAll(uint256 amount) external onlyAngel nonReentrant {
    if (amount == 0) revert ZeroAmount();
    uint256 shares = totalShares;
    if (shares == 0) revert EmptyCohort();
    _pull(msg.sender, amount);
    globalAccRay += amount * RAY / shares;
    rewardReserves += amount;
    emit FundsReturnedToAll(amount);
  }

  // ═══════════════════════════ premarket (EIP-712) ═══════════════════════════

  function hashOrder(Order calldata o) public view returns (bytes32) {
    bytes32 structHash = keccak256(
      abi.encode(ORDER_TYPEHASH, o.maker, o.isSell, o.cohortId, o.shareAmount, o.usdcAmount, o.nonce, o.deadline)
    );
    return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
  }

  /// @notice Fill (part of) a maker's signed order. Taker is msg.sender.
  /// USDC moves peer-to-peer; both sides must have approved this contract for USDC.
  function fillOrder(Order calldata o, bytes calldata signature, uint256 fillShares) external nonReentrant {
    if (fillShares == 0) revert ZeroAmount();
    if (block.timestamp > o.deadline) revert OrderExpired();
    if (o.cohortId == 0 || o.cohortId > currentCohort) revert UnknownCohort();

    bytes32 h = hashOrder(o);
    if (orderCancelled[h]) revert OrderInactive();
    uint256 filled = orderFilled[h];
    if (filled + fillShares > o.shareAmount) revert Overfill();
    if (!_validSig(o.maker, h, signature)) revert BadSignature();

    orderFilled[h] = filled + fillShares;

    // maker-protective rounding: seller never receives less-than-rate; buyer never pays more-than-rate
    uint256 usdc = o.isSell
      ? _ceilDiv(fillShares * o.usdcAmount, o.shareAmount)
      : (fillShares * o.usdcAmount) / o.shareAmount;

    if (o.isSell) {
      _moveShares(o.cohortId, o.maker, msg.sender, fillShares); // shares maker -> taker
      _pullTo(msg.sender, o.maker, usdc);                       // USDC taker -> maker
    } else {
      _moveShares(o.cohortId, msg.sender, o.maker, fillShares); // shares taker -> maker
      _pullTo(o.maker, msg.sender, usdc);                       // USDC maker -> taker
    }
    emit OrderFilled(h, o.maker, msg.sender, o.cohortId, fillShares, usdc, o.isSell);
  }

  function cancelOrder(Order calldata o) external {
    if (msg.sender != o.maker) revert NotMaker();
    bytes32 h = hashOrder(o);
    orderCancelled[h] = true;
    emit OrderCancelled(h, msg.sender);
  }

  // ═══════════════════════════ settlement internals ═══════════════════════════

  function _settle(address user) internal {
    uint256 from = settledUpTo[user];
    uint256 last = currentCohort;
    if (from == last) return;

    uint256 bal = _poolBalance[user];
    if (bal == 0) { settledUpTo[user] = last; return; }

    for (uint256 k = from + 1; k <= last; k++) {
      uint256 conv = bal * cohortFractionRay[k] / RAY;
      if (conv != 0) {
        _cohortShares[k][user] += conv;
        _rewardDebt[k][user] += conv * globalAccAtBirthRay[k] / RAY;
        bal -= conv;
      }
      if (bal == 0) break;
    }
    _poolBalance[user] = bal;
    settledUpTo[user] = last;
  }

  function _moveShares(uint256 n, address fromAddr, address toAddr, uint256 amount) internal {
    if (n == 0 || n > currentCohort) revert UnknownCohort();
    _settle(fromAddr);
    _settle(toAddr);
    _realizeReward(fromAddr, n);
    _realizeReward(toAddr, n);
    uint256 fromShares = _cohortShares[n][fromAddr];
    if (amount > fromShares) revert InsufficientShares();
    _cohortShares[n][fromAddr] = fromShares - amount;
    _cohortShares[n][toAddr] += amount;
    _resyncDebt(fromAddr, n);
    _resyncDebt(toAddr, n);
    emit SharesTransferred(n, fromAddr, toAddr, amount);
  }

  // realise a user's pending reward for cohort n into their unclaimed bucket
  function _realizeReward(address user, uint256 n) internal {
    uint256 earned = _cohortShares[n][user] * (cohortAccRay[n] + globalAccRay) / RAY;
    uint256 debt = _rewardDebt[n][user];
    if (earned > debt) _accruedReward[user] += earned - debt;
  }

  function _resyncDebt(address user, uint256 n) internal {
    _rewardDebt[n][user] = _cohortShares[n][user] * (cohortAccRay[n] + globalAccRay) / RAY;
  }

  // ═══════════════════════════ signature / math ═══════════════════════════

  function _validSig(address signer, bytes32 digest, bytes calldata sig) internal pure returns (bool) {
    if (sig.length != 65) return false;
    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly {
      r := calldataload(sig.offset)
      s := calldataload(add(sig.offset, 32))
      v := byte(0, calldataload(add(sig.offset, 64)))
    }
    if (uint256(s) > SECP_HALF_N) return false; // low-s only (EIP-2)
    if (v != 27 && v != 28) return false;
    address rec = ecrecover(digest, v, r, s);
    return rec != address(0) && rec == signer;
  }

  function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
    return (a + b - 1) / b;
  }

  // ═══════════════════════════ views ═══════════════════════════

  function refundableOf(address user) public view returns (uint256 bal) {
    bal = _poolBalance[user];
    if (bal == 0) return 0;
    for (uint256 k = settledUpTo[user] + 1; k <= currentCohort; k++) {
      bal -= bal * cohortFractionRay[k] / RAY;
      if (bal == 0) break;
    }
  }

  function cohortSharesOf(address user, uint256 n) public view returns (uint256) {
    if (n == 0 || n > currentCohort) return 0;
    if (n <= settledUpTo[user]) return _cohortShares[n][user];
    uint256 bal = _poolBalance[user];
    for (uint256 k = settledUpTo[user] + 1; k < n; k++) {
      bal -= bal * cohortFractionRay[k] / RAY;
    }
    return _cohortShares[n][user] + bal * cohortFractionRay[n] / RAY;
  }

  function pendingRewardOf(address user, uint256[] calldata cohortIds) external view returns (uint256 owed) {
    owed = _accruedReward[user];
    for (uint256 i = 0; i < cohortIds.length; i++) {
      uint256 n = cohortIds[i];
      if (n == 0 || n > currentCohort) continue;
      uint256 shares = cohortSharesOf(user, n);
      if (shares == 0) continue;
      uint256 accrued = shares * (cohortAccRay[n] + globalAccRay) / RAY;
      uint256 debt = n <= settledUpTo[user]
        ? _rewardDebt[n][user]
        : shares * globalAccAtBirthRay[n] / RAY;
      if (accrued > debt) owed += accrued - debt;
    }
  }

  // ═══════════════════════════ token plumbing ═══════════════════════════

  function _pull(address from, uint256 amount) private {
    _call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
  }

  function _pullTo(address from, address to, uint256 amount) private {
    if (amount != 0) _call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
  }

  function _push(address to, uint256 amount) private {
    _call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
  }

  function _call(bytes memory data) private {
    (bool ok, bytes memory ret) = address(token).call(data);
    if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
  }
}
