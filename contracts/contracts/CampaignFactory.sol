// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";

contract CampaignFactory {
    using Clones for address;

    address public owner;
    address public implementation;
    address[] public campaigns;
    mapping(address => bool) public allowedTokens;

    event CampaignCreated(address indexed campaign, address indexed creator, uint256 floor, uint256 ceil);
    event TokenAdded(address indexed token);
    event TokenDisabled(address indexed token);

    constructor(address _implementation) {
        implementation = _implementation;
        owner = msg.sender;
    }

    function createCampaign(uint256 floor, uint256 ceil, address token) external returns (address) {
        require(allowedTokens[token], "Token not whitelisted");
        address clone = implementation.clone();

        (bool ok, ) = clone.call(
            abi.encodeWithSignature(
                "initialize(address,uint256,uint256,address)",
                msg.sender,
                floor,
                ceil,
                token
            )
        );
        require(ok, "Campaign initialization failed");

        campaigns.push(clone);
        emit CampaignCreated(clone, msg.sender, floor, ceil);
        return clone;
    }

    function getCampaigns() external view returns (address[] memory) {
        return campaigns;
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