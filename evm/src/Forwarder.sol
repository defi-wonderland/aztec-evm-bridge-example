// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IOutbox} from "@aztec/contracts/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/contracts/core/libraries/DataStructures.sol";
import {IForwarder} from "./interfaces/IForwarder.sol";

contract Forwarder is IForwarder {
    address public immutable OUTBOX;
    bytes32 public immutable AZTEC_GATEWAY;

    mapping(bytes32 => bool) private _settledOrders;

    constructor(address outbox, bytes32 aztecGateway) {
        AZTEC_GATEWAY = aztecGateway;
        OUTBOX = outbox;
    }

    function forwardSettleToAztec() external {}

    function forwardSettleToL2(
        DataStructures.L2ToL1Msg memory l2ToL1Message,
        bytes calldata message,
        uint256 aztecBlockNumber,
        uint256 leafIndex,
        bytes32[] calldata path
    ) external {
        bytes32 messageHash = sha256(message);
        require(messageHash == l2ToL1Message.content, InvalidContent());
        require(l2ToL1Message.sender.actor == AZTEC_GATEWAY, InvalidSender()); // TODO: version?
        // NOTE: recipient correctness is checked by Outbox

        IOutbox(OUTBOX).consume(l2ToL1Message, aztecBlockNumber, leafIndex, path);

        _settledOrders[messageHash] = true;

        emit SettleForwardedToL2(message);
    }
}
