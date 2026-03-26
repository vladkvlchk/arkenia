// contracts/mocks/MockUSDC.sol                                                   
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";                           
                
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6); // мінтиш собі мільйон
    }

    function decimals() public pure override returns (uint8) {
        return 6; // як справжній USDC
    }
}