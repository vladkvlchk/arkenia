// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestUSDC — a faucet-enabled 6-decimal USDC stand-in for public TESTNET only.
/// @notice Anyone can mint free tokens. NEVER deploy this to mainnet.
contract TestUSDC is ERC20 {
  uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6; // 10,000 USDC per drip

  constructor() ERC20("Test USD Coin", "tUSDC") {}

  function decimals() public pure override returns (uint8) {
    return 6;
  }

  /// @notice Mint yourself the standard drip. Call as many times as you like — it's testnet.
  function faucet() external {
    _mint(msg.sender, FAUCET_AMOUNT);
  }

  /// @notice Mint an arbitrary amount to any address (scripts / seeding).
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
