pragma solidity ^0.8.28;

import {DataStructures} from "@aztec/contracts/core/libraries/DataStructures.sol";
import {StateValidator} from "../libs/StateValidator.sol";

interface IForwarder {
    error InvalidAccountStorage();
    error InvalidContent();
    error InvalidRecipient();
    error InvalidSender();
    error InvalidStorageKey();

    event SettleForwardedToL2(bytes message);
    event SettleForwardedToAztec(bytes message);

    function forwardSettleToAztec(bytes32 orderId, StateValidator.AccountProofParameters memory accountProofParams)
        external;

    function forwardSettleToL2(
        DataStructures.L2ToL1Msg memory l2ToL1Message,
        bytes calldata message,
        uint256 aztecBlockNumber,
        uint256 leafIndex,
        bytes32[] calldata path
    ) external;
}
