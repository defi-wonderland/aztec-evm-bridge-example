// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {BasicSwap7683} from "./BasicSwap7683.sol";
import {StateValidator} from "./libs/StateValidator.sol";
import {BytesReader} from "./libs/BytesReader.sol";
import {IL2Gateway7683} from "./interfaces/IL2Gateway7683.sol";

contract L2Gateway7683 is IL2Gateway7683, BasicSwap7683, Ownable {
    using BytesReader for bytes;

    uint256 private constant FORWARDER_SETTLED_ORDERS_SLOT = 0;
    bytes32 private constant SETTLE_ORDER_TYPE = sha256(abi.encodePacked("SETTLE_ORDER_TYPE"));
    address public forwarder;

    constructor(address permit2) BasicSwap7683(permit2) Ownable(msg.sender) {}

    function settle(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external {
        // NOTE: At this point, I need to check if the order has been filled by reading the corresponding mapping inside the forwarder.
        // When a solver fills the intent, a message is sent via the Portal from Aztec to Ethereum, reaching the forwarder.
        // The data stored in the _settledOrders mapping must contain the necessary (and compatible) information required to call _handleSettleOrder.

        bytes32 storageKey = _getStorageKeyByMessage(message);
        require(bytes32(accountProofParams.storageKey) == storageKey, InvalidStorageKey());
        require(_bytesToBool(accountProofParams.storageValue), InvalidStorageValue());
        require(StateValidator.validateState(forwarder, stateProofParams, accountProofParams), InvalidState());

        bytes32 orderType = message.readBytes32(0);
        bytes32 orderId = message.readBytes32(32);
        bytes32 receiver = message.readBytes32(64); // filler data
        require(orderType == SETTLE_ORDER_TYPE, invalidOrderType());

        // NOTE: No need to check the sender, as the forwarder verifies
        // that the message is sent from AztecGateway7683 before storing the value.
        _handleSettleOrder(orderId, receiver);
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function _getStorageKeyByMessage(bytes memory message) internal pure returns (bytes32) {
        return keccak256(abi.encode(sha256(message) >> 8, FORWARDER_SETTLED_ORDERS_SLOT)); // Represent it as an Aztec field element (BN254 scalar, encoded as bytes32)
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
}
