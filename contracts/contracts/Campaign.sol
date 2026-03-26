// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Campaign {
    address public creator;
    uint256 public floor;
    uint256 public ceil;
    IERC20 public token;
    bool public initialized;
    mapping(address => uint256) public invests;
    uint256 public totalRaised;
    uint256 public withdrawnAt;

    uint256 public returnedAmount;
    mapping(address => uint256) public claimed;

    event Deposited(address indexed investor, uint256 amount);
    event Withdrawn(uint256 amount, uint256 timestamp);
    event Refunded(address indexed investor, uint256 amount);
    event FundsReturned(uint256 amount);
    event Claimed(address indexed investor, uint256 amount);

    function initialize(address _creator, uint256 _floor, uint256 _ceil, address _token) external {
        require(!initialized, "Already initialized");
        initialized = true;

        creator = _creator;
        floor = _floor;
        ceil = _ceil;
        token = IERC20(_token);
    }

    function deposit(uint256 amount) external {
        require(withdrawnAt == 0, "Campaign closed");
        if(ceil > 0 && totalRaised + amount > ceil) amount = ceil - totalRaised;
        require(amount > 0, "Campaign fully funded");

        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        invests[msg.sender] += amount;
        totalRaised += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw() external {
        require(msg.sender == creator, "Not the creator");
        require(withdrawnAt == 0, "Already withdrawn");
        require(totalRaised > 0, "Nothing to withdraw");
        require(floor == 0 || totalRaised >= floor, "Floor not reached");

        withdrawnAt = block.timestamp;
        require(token.transfer(creator, totalRaised), "Transfer failed");
        emit Withdrawn(totalRaised, withdrawnAt);
    }

    function returnFunds(uint256 amount) external {
        require(msg.sender == creator, "Not the creator");
        require(withdrawnAt > 0, "Not yet withdrawn");
        require(amount > 0, "Zero amount");

        returnedAmount += amount;
        require(token.transferFrom(creator, address(this), amount), "Transfer failed");
        emit FundsReturned(amount);
    }

    function claim() external {
        require(invests[msg.sender] > 0, "Not an investor");

        uint256 total = returnedAmount * invests[msg.sender] / totalRaised;
        uint256 claimable = total - claimed[msg.sender];
        require(claimable > 0, "Nothing to claim");

        claimed[msg.sender] += claimable;
        require(token.transfer(msg.sender, claimable), "Transfer failed");
        emit Claimed(msg.sender, claimable);
    }

    function refund(uint256 amount) external {
        require(withdrawnAt == 0, "Creator took funds");
        require(amount <= invests[msg.sender], "Not enough invested");

        invests[msg.sender] -= amount;
        totalRaised -= amount;
        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit Refunded(msg.sender, amount);
    }
}
