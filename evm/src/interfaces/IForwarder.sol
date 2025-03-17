pragma solidity ^0.8.28;

import {DataStructures} from "@aztec/contracts/core/libraries/DataStructures.sol";

interface IForwarder {
    error InvalidContent();
    error InvalidRecipient();
    error InvalidSender();

    event SettleForwardedToL2(bytes message);

    function forwardSettleToAztec() external;

    function forwardSettleToL2(
        DataStructures.L2ToL1Msg memory l2ToL1Message,
        bytes calldata message,
        uint256 aztecBlockNumber,
        uint256 leafIndex,
        bytes32[] calldata path
    ) external;
}
