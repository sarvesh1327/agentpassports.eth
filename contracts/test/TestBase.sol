// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal subset of Foundry cheatcodes used by these tests.
interface Vm {
    /// @notice Derives an address from a private key.
    /// @param privateKey Private key used for deterministic test accounts.
    /// @return Derived account address.
    function addr(uint256 privateKey) external returns (address);

    /// @notice Sets an account ETH balance.
    /// @param account Account to fund.
    /// @param balance New wei balance.
    function deal(address account, uint256 balance) external;

    /// @notice Expects the next call to revert with a selector.
    /// @param revertData Expected revert selector.
    function expectRevert(bytes4 revertData) external;

    /// @notice Sets msg.sender for the next call.
    /// @param sender Sender address to impersonate.
    function prank(address sender) external;

    /// @notice Signs a digest with a test private key.
    /// @param privateKey Private key used for signing.
    /// @param digest Digest to sign.
    /// @return v Recovery id.
    /// @return r Signature r value.
    /// @return s Signature s value.
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);

    /// @notice Sets tx.gasprice for the next transaction.
    /// @param gasPrice Gas price to expose through tx.gasprice.
    function txGasPrice(uint256 gasPrice) external;

    /// @notice Sets block.timestamp in the test VM.
    /// @param timestamp Timestamp to use.
    function warp(uint256 timestamp) external;
}

/// @title TestBase
/// @notice Lightweight assertion and cheatcode helpers for Foundry tests.
contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice Asserts two addresses are equal.
    /// @param actual Observed address.
    /// @param expected Expected address.
    /// @param message Revert reason if values differ.
    function assertEq(address actual, address expected, string memory message) internal pure {
        if (actual != expected) revert(message);
    }

    /// @notice Asserts two bytes32 values are equal.
    /// @param actual Observed value.
    /// @param expected Expected value.
    /// @param message Revert reason if values differ.
    function assertEq(bytes32 actual, bytes32 expected, string memory message) internal pure {
        if (actual != expected) revert(message);
    }

    /// @notice Asserts two bytes4 values are equal.
    /// @param actual Observed value.
    /// @param expected Expected value.
    /// @param message Revert reason if values differ.
    function assertEq(bytes4 actual, bytes4 expected, string memory message) internal pure {
        if (actual != expected) revert(message);
    }

    /// @notice Asserts two uint256 values are equal.
    /// @param actual Observed value.
    /// @param expected Expected value.
    /// @param message Revert reason if values differ.
    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        if (actual != expected) revert(message);
    }

    /// @notice Asserts a condition is true.
    /// @param condition Observed condition.
    /// @param message Revert reason if condition is false.
    function assertTrue(bool condition, string memory message) internal pure {
        if (!condition) revert(message);
    }

    /// @notice Asserts a uint256 value is less than or equal to a maximum.
    /// @param actual Observed value.
    /// @param maximum Inclusive maximum.
    /// @param message Revert reason if actual exceeds maximum.
    function assertLe(uint256 actual, uint256 maximum, string memory message) internal pure {
        if (actual > maximum) revert(message);
    }

    /// @notice Asserts a uint256 value is greater than a minimum.
    /// @param actual Observed value.
    /// @param minimum Exclusive minimum.
    /// @param message Revert reason if actual is not greater than minimum.
    function assertGt(uint256 actual, uint256 minimum, string memory message) internal pure {
        if (actual <= minimum) revert(message);
    }
}
