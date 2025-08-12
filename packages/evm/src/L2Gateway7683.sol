// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasicSwap7683} from "./BasicSwap7683.sol";
import {StateValidator} from "./libs/StateValidator.sol";
import {BytesReader} from "./libs/BytesReader.sol";
import {IL2Gateway7683} from "./interfaces/IL2Gateway7683.sol";

contract L2Gateway7683 is IL2Gateway7683, BasicSwap7683, Ownable {
    using BytesReader for bytes;

    uint32 public constant AZTEC_CHAIN_ID = 999999;
    uint256 private constant FORWARDER_SETTLED_ORDERS_SLOT = 2;
    uint256 private constant FORWARDER_REFUNDED_ORDERS_SLOT = 3;
    bytes32 private constant SETTLE_ORDER_TYPE = sha256(abi.encodePacked("SETTLE_ORDER_TYPE"));
    bytes32 private constant REFUND_ORDER_TYPE = sha256(abi.encodePacked("REFUND_ORDER_TYPE"));
    address public forwarder;
    bytes32 public aztecGateway7683;

    constructor(address permit2) BasicSwap7683(permit2) Ownable(msg.sender) {}

    function settle(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external {
        // NOTE: At this point, I need to check if the order has been filled by reading the corresponding mapping inside the Forwarder.
        // When a solver fills the intent, a message is sent via the Portal from Aztec to Ethereum, reaching the Forwarder.
        // The data stored in the _settledOrders mapping must contain the necessary (and compatible) information required to call _handleSettleOrder.
        _verifyForwarderProof(message, stateProofParams, accountProofParams, FORWARDER_SETTLED_ORDERS_SLOT);
        bytes32 orderType = message.readBytes32(0);
        bytes32 orderId = message.readBytes32(32);
        bytes32 receiver = message.readBytes32(64); // filler data
        require(orderType == SETTLE_ORDER_TYPE, InvalidOrderType(orderType));
        // NOTE: Checking the source chain ID here is unnecessary because _checkOrderEligibility reads directly from storage.
        // If the order exists, it means it was resolved on its origin domain, and the originDomain field is already set correctly in _resolvedOrders.
        // As for the destination settler, we enforce that L2Gateway7683 stores the Aztec gateway address,
        // allowing us to validate destination orders by comparing against the known address of AztecGateway7683.
        _handleSettleOrder(AZTEC_CHAIN_ID, aztecGateway7683, orderId, receiver);
    }

    function refund(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external {
        // NOTE: At this point, I need to check if the order has been filled by reading the corresponding mapping inside the Forwarder.
        // When a solver fills the intent, a message is sent via the Portal from Aztec to Ethereum, reaching the Forwarder.
        // The data stored in the _refundedOrders mapping must contain the necessary (and compatible) information required to call _handleRefundOrder.
        _verifyForwarderProof(message, stateProofParams, accountProofParams, FORWARDER_REFUNDED_ORDERS_SLOT);
        bytes32 orderType = message.readBytes32(0);
        bytes32 orderId = message.readBytes32(32);
        require(orderType == REFUND_ORDER_TYPE, InvalidOrderType(orderId));
        // NOTE: same as within settle
        _handleRefundOrder(AZTEC_CHAIN_ID, aztecGateway7683, orderId);
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setAztecGateway7683(bytes32 aztecGateway7683_) external onlyOwner {
        // NOTE: use the same gateway stored in the Forwarder
        aztecGateway7683 = aztecGateway7683_;
        emit AztecGateway7683Set(aztecGateway7683_);
    }

    function _getStorageKeyByMessage(bytes memory message, uint256 slot) internal pure returns (bytes32) {
        return keccak256(abi.encode(sha256(message) >> 8, slot)); // Represent it as an Aztec field element (BN254 scalar, encoded as bytes32)
    }

    function _localDomain() internal view override returns (uint32) {
        return uint32(block.chainid);
    }

    function _bytesToBool(bytes memory data) internal pure returns (bool res) {
        assembly {
            let len := mload(data)
            res := mload(add(data, 0x20))
        }
    }

    function _verifyForwarderProof(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams,
        uint256 slot
    ) internal view {
        bytes32 storageKey = _getStorageKeyByMessage(message, slot);
        require(bytes32(accountProofParams.storageKey) == storageKey, InvalidStorageKey());
        require(_bytesToBool(accountProofParams.storageValue), InvalidStorageValue());
        require(StateValidator.validateState(forwarder, stateProofParams, accountProofParams), InvalidState());
    }
}
