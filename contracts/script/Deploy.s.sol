// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { AgentEnsExecutor } from "../src/AgentEnsExecutor.sol";
import { TaskLog } from "../src/TaskLog.sol";

/// @notice Minimal Foundry cheatcode interface used by the deployment script.
/// @dev Keeping this local avoids requiring vendored forge-std for the MVP deploy path.
interface Vm {
    /// @notice Reads an address-valued environment variable.
    /// @param name Environment variable name.
    /// @return value Address parsed from the environment variable.
    function envAddress(string calldata name) external view returns (address value);

    /// @notice Starts broadcasting subsequent contract creations with Foundry's configured signer.
    function startBroadcast() external;

    /// @notice Stops broadcasting contract creations and calls.
    function stopBroadcast() external;
}

/// @title Deploy
/// @notice Deploys AgentEnsExecutor and TaskLog with ENS constructor arguments from the environment.
contract Deploy {
    /// @notice Emitted with the deployed addresses for updating environment files after a run.
    event DeploymentAddresses(address indexed executor, address indexed taskLog);

    /// @notice Foundry's deterministic cheatcode endpoint.
    Vm private constant FOUNDRY_VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice Deploys the executor first, then deploys TaskLog bound to that executor.
    /// @dev Requires ENS_REGISTRY and NAME_WRAPPER to be set in the Foundry environment.
    /// @return executorAddress Address of the deployed AgentEnsExecutor.
    /// @return taskLogAddress Address of the deployed TaskLog.
    function run() external returns (address executorAddress, address taskLogAddress) {
        address ensRegistry = FOUNDRY_VM.envAddress("ENS_REGISTRY");
        address nameWrapper = FOUNDRY_VM.envAddress("NAME_WRAPPER");

        FOUNDRY_VM.startBroadcast();
        AgentEnsExecutor executor = new AgentEnsExecutor(ensRegistry, nameWrapper);
        TaskLog taskLog = new TaskLog(address(executor));
        FOUNDRY_VM.stopBroadcast();

        executorAddress = address(executor);
        taskLogAddress = address(taskLog);
        emit DeploymentAddresses(address(executor), address(taskLog));
    }
}
