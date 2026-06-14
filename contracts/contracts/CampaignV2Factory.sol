// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./CampaignV2.sol";

/// @title CampaignV2Factory — minimal-proxy factory for CampaignV2 clones
/// @dev Creates the clone and initializes it atomically in a single transaction, so there is
/// no window for a third party to front-run `initialize` and hijack the `angel` role.
/// Uses the typed `CampaignV2(clone).initialize(...)` call so the initializer signature is
/// checked at compile time (a mismatch would fail the build, not silently revert on deploy).
contract CampaignV2Factory {
  using Clones for address;

  address public owner;
  address public implementation;
  address[] public campaigns;
  mapping(address => bool) public allowedTokens;

  event CampaignCreated(address indexed campaign, address indexed angel, address indexed token);
  event TokenAdded(address indexed token);
  event TokenDisabled(address indexed token);

  constructor(address _implementation) {
    require(_implementation != address(0), "Zero implementation");
    implementation = _implementation;
    owner = msg.sender;
  }

  /// @notice Deploy a new CampaignV2 clone for `token`, with the caller as angel.
  function createCampaign(address token) external returns (address) {
    require(allowedTokens[token], "Token not whitelisted");
    address clone = implementation.clone();
    CampaignV2(clone).initialize(msg.sender, token);
    campaigns.push(clone);
    emit CampaignCreated(clone, msg.sender, token);
    return clone;
  }

  function getCampaigns() external view returns (address[] memory) {
    return campaigns;
  }

  function campaignsCount() external view returns (uint256) {
    return campaigns.length;
  }

  function addToken(address token) external {
    require(msg.sender == owner, "Not owner");
    allowedTokens[token] = true;
    emit TokenAdded(token);
  }

  function disableToken(address token) external {
    require(msg.sender == owner, "Not owner");
    allowedTokens[token] = false;
    emit TokenDisabled(token);
  }
}
