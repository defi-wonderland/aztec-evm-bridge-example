// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IOutbox} from "@aztec/contracts/core/interfaces/messagebridge/IOutbox.sol";
import {IInbox, DataStructures} from "@aztec/contracts/core/interfaces/messagebridge/IInbox.sol";
import {DataStructures} from "@aztec/contracts/core/libraries/DataStructures.sol";
import {IAnchorStateRegistry} from "@optimism/contracts/interfaces/dispute/IAnchorStateRegistry.sol";
import {Hash} from "@optimism/contracts/src/dispute/lib/Types.sol";
import {StateValidator} from "./libs/StateValidator.sol";
import {IForwarder} from "./interfaces/IForwarder.sol";
import {Base7683} from "./Base7683.sol";

contract Forwarder is IForwarder {
    uint256 private constant L2_GATEWAY_FILLED_ORDERS_SLOT = 2;
    uint256 private constant AZTEC_VERSION = 1;
    bytes32 private constant SETTLE_ORDER_TYPE = sha256(abi.encodePacked("SETTLE_ORDER_TYPE"));

    address public immutable L2_GATEWAY;
    address public immutable AZTEC_INBOX;
    address public immutable AZTEC_OUTBOX;
    bytes32 public immutable AZTEC_GATEWAY;
    address public immutable ANCHOR_STATE_REGISTRY;

    mapping(bytes32 => bool) private _settledOrders;

    constructor(
        address l2Gateway,
        address aztecInbox,
        address aztecOutbox,
        bytes32 aztecGateway,
        address anchorStateRegistry
    ) {
        L2_GATEWAY = l2Gateway;
        AZTEC_GATEWAY = aztecGateway;
        AZTEC_INBOX = aztecInbox;
        AZTEC_OUTBOX = aztecOutbox;
        ANCHOR_STATE_REGISTRY = anchorStateRegistry;
    }

    function forwardSettleToAztec(bytes32 orderId, StateValidator.AccountProofParameters memory accountProofParams)
        external
    {
        bytes32 storageKey = _getStorageKeyByOrderId(orderId);
        require(bytes32(accountProofParams.storageKey) == storageKey, InvalidStorageKey());

        (Hash stateRoot,) = IAnchorStateRegistry(ANCHOR_STATE_REGISTRY).getAnchorRoot();
        require(StateValidator.validateAccountStorage(L2_GATEWAY, stateRoot.raw(), accountProofParams), InvalidAccountStorage());

        Base7683.FilledOrder memory order = abi.decode(accountProofParams.storageValue, (Base7683.FilledOrder));

        // NOTE: The filler data is currently only 32 bytes and contains the address of the filler on Aztec, where the funds will be received.
        bytes memory message = abi.encodePacked(SETTLE_ORDER_TYPE, orderId, bytes32(order.fillerData));
        bytes32 messageHash = sha256(message);
        IInbox(AZTEC_INBOX).sendL2Message(
            DataStructures.L2Actor({actor: AZTEC_GATEWAY, version: AZTEC_VERSION}), messageHash, bytes32(0)
        ); // TODO: understand what to use as _secretHash
        emit SettleForwardedToAztec(message);
    }

    function forwardSettleToL2(
        DataStructures.L2ToL1Msg memory l2ToL1Message,
        bytes calldata message,
        uint256 aztecBlockNumber,
        uint256 leafIndex,
        bytes32[] calldata path
    ) external {
        bytes32 messageHash = sha256(message) >> 8; // Represent it as an Aztec field element (BN254 scalar, encoded as bytes32)
        require(messageHash == l2ToL1Message.content, InvalidContent());
        require(l2ToL1Message.sender.actor == AZTEC_GATEWAY, InvalidSender());
        // TODO: version?

        // NOTE: recipient correctness is checked by Outbox
        IOutbox(AZTEC_OUTBOX).consume(l2ToL1Message, aztecBlockNumber, leafIndex, path);
        _settledOrders[messageHash] = true;
        emit SettleForwardedToL2(message);
    }

    function _getStorageKeyByOrderId(bytes32 orderId) internal pure returns (bytes32) {
        return keccak256(abi.encode(orderId, L2_GATEWAY_FILLED_ORDERS_SLOT));
    }
}
