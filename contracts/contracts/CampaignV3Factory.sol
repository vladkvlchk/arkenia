// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CampaignV3.sol";

/// @title CampaignV3Factory — minimal-proxy (EIP-1167) factory for CampaignV3.
/// @dev Clone + initialize happen atomically in one tx, so there is no window to
/// front-run initialization and hijack the `angel` role. No external libraries:
/// the minimal-proxy creation code is written inline.
contract CampaignV3Factory {
  address public owner;
  address public pendingOwner;
  address public immutable implementation;
  address[] public campaigns;
  mapping(address => bool) public allowedTokens;

  event CampaignCreated(address indexed campaign, address indexed angel, address indexed token);
  event TokenAllowed(address indexed token, bool allowed);
  event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  error NotOwner();
  error NotPendingOwner();
  error TokenNotAllowed();
  error ZeroAddress();
  error CloneFailed();

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  constructor(address _implementation) {
    if (_implementation == address(0)) revert ZeroAddress();
    implementation = _implementation;
    owner = msg.sender;
  }

  function createCampaign(address token) external returns (address campaign) {
    if (!allowedTokens[token]) revert TokenNotAllowed();
    campaign = _clone(implementation);
    CampaignV3(campaign).initialize(msg.sender, token);
    campaigns.push(campaign);
    emit CampaignCreated(campaign, msg.sender, token);
  }

  function getCampaigns() external view returns (address[] memory) {
    return campaigns;
  }

  function campaignsCount() external view returns (uint256) {
    return campaigns.length;
  }

  function setToken(address token, bool allowed) external onlyOwner {
    if (token == address(0)) revert ZeroAddress();
    allowedTokens[token] = allowed;
    emit TokenAllowed(token, allowed);
  }

  /// @notice Step 1/2: nominate a new owner. The transfer only completes when they call
  /// `acceptOwnership`, so ownership can never be sent to a wrong or dead address by mistake.
  function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroAddress();
    pendingOwner = newOwner;
    emit OwnershipTransferStarted(owner, newOwner);
  }

  /// @notice Step 2/2: the nominated owner accepts and becomes the owner.
  function acceptOwnership() external {
    if (msg.sender != pendingOwner) revert NotPendingOwner();
    address previous = owner;
    owner = pendingOwner;
    pendingOwner = address(0);
    emit OwnershipTransferred(previous, msg.sender);
  }

  /// @dev Standard EIP-1167 minimal proxy deploy.
  function _clone(address impl) private returns (address instance) {
    assembly {
      let ptr := mload(0x40)
      mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
      mstore(add(ptr, 0x14), shl(0x60, impl))
      mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
      instance := create(0, ptr, 0x37)
    }
    if (instance == address(0)) revert CloneFailed();
  }
}
