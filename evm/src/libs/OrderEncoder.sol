// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

struct OrderData {
    bytes32 sender;
    bytes32 recipient;
    bytes32 inputToken;
    bytes32 outputToken;
    uint256 amountIn;
    uint256 amountOut;
    uint256 senderNonce;
    uint32 originDomain;
    uint32 destinationDomain;
    bytes32 destinationSettler;
    uint32 fillDeadline;
}
// bytes data;

library OrderEncoder {
    error InvalidOrderLength();
    error OutOfRange();

    bytes constant ORDER_DATA_TYPE = abi.encodePacked(
        "OrderData(",
        "bytes32 sender,",
        "bytes32 recipient,",
        "bytes32 inputToken,",
        "bytes32 outputToken,",
        "uint256 amountIn,",
        "uint256 amountOut,",
        "uint256 senderNonce,",
        "uint32 originDomain,",
        "uint32 destinationDomain,",
        "bytes32 destinationSettler,",
        "uint32 fillDeadline)"
    );
    //"bytes data)"

    bytes32 constant ORDER_DATA_TYPE_HASH = keccak256(ORDER_DATA_TYPE);

    function orderDataType() internal pure returns (bytes32) {
        return ORDER_DATA_TYPE_HASH;
    }

    function id(OrderData memory order) internal pure returns (bytes32) {
        return sha256(encode(order));
    }

    function encode(OrderData memory order) internal pure returns (bytes memory) {
        return abi.encodePacked(
            order.sender,
            order.recipient,
            order.inputToken,
            order.outputToken,
            order.amountIn,
            order.amountOut,
            order.senderNonce,
            order.originDomain,
            order.destinationDomain,
            order.destinationSettler,
            order.fillDeadline
        );
    }

    function decode(bytes memory orderBytes) internal pure returns (OrderData memory order) {
        require(orderBytes.length == 268, InvalidOrderLength());

        order.sender = bytesToBytes32(orderBytes, 0);
        order.recipient = bytesToBytes32(orderBytes, 32);
        order.inputToken = bytesToBytes32(orderBytes, 64);
        order.outputToken = bytesToBytes32(orderBytes, 96);
        order.amountIn = bytesToUint256(orderBytes, 128);
        order.amountOut = bytesToUint256(orderBytes, 160);
        order.senderNonce = bytesToUint256(orderBytes, 192);
        order.originDomain = bytesToUint32(orderBytes, 224);
        order.destinationDomain = bytesToUint32(orderBytes, 228);
        order.destinationSettler = bytesToBytes32(orderBytes, 232);
        order.fillDeadline = bytesToUint32(orderBytes, 264);

        return order;
    }

    function bytesToBytes32(bytes memory data, uint256 offset) internal pure returns (bytes32 result) {
        require(data.length >= offset + 32, OutOfRange());
        assembly {
            result := mload(add(data, add(32, offset)))
        }
    }

    function bytesToUint256(bytes memory data, uint256 offset) internal pure returns (uint256 result) {
        require(data.length >= offset + 32, OutOfRange());
        assembly {
            result := mload(add(data, add(32, offset)))
        }
    }

    function bytesToUint32(bytes memory data, uint256 offset) internal pure returns (uint32 result) {
        require(data.length >= offset + 4, OutOfRange());
        assembly {
            let word := mload(add(data, add(32, offset)))
            result := shr(224, word) // shift down to get the top 4 bytes
        }
    }
}
