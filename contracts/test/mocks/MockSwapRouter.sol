// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { MockERC20 } from "./MockERC20.sol";

contract MockSwapRouter {
    event Swapped(address indexed caller, address indexed tokenIn, address indexed tokenOut, address recipient, uint256 amountIn, uint256 amountOut);

    /// @notice Pulls tokenIn from caller and mints tokenOut to recipient to simulate a swap.
    function swapExactInput(address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)
        external
        returns (uint256)
    {
        require(MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull failed");
        MockERC20(tokenOut).mint(recipient, amountOut);
        emit Swapped(msg.sender, tokenIn, tokenOut, recipient, amountIn, amountOut);
        return amountOut;
    }
}
