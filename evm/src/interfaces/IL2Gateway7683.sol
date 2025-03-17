pragma solidity ^0.8.28;

import {StateValidator} from "../libs/StateValidator.sol";

interface IL2Gateway7683 {
    error InvalidStorageKey();
    error InvalidStorageValue();
    error InvalidState();
    error InvalidTargetChainId();
    error invalidOrderType();

    function settle(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external;
}
