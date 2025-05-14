// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {OrderEncoder, OrderData} from "./libs/OrderEncoder.sol";
import {IHook7683Recipient} from "./interfaces/IHook7683Recipient.sol";
import {IOriginSettler, OnchainCrossChainOrder} from "./interfaces/IERC7683.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vault is IHook7683Recipient {
    address public immutable GATEWAY;

    mapping(bytes32 => uint256) public finalizableDeposits;
    mapping(address => mapping(address => uint256)) public amounts;

    event NewDepositToFinalize(bytes32 commitment, address token, uint256 amount);
    event Deposited(address owner, address token, uint256 amount);
    event Withdrawn(address owner, address token, uint256 amount);

    constructor(address gateway) {
        GATEWAY = gateway;
    }

    function finalizeDeposit(bytes calldata proof, address owner, address token) external {
        bytes32 commitment = sha256(abi.encodePacked(token, sha256(abi.encodePacked(owner, proof))));
        uint256 amount = finalizableDeposits[commitment];
        require(amount > 0, "deposit not finalizable");
        // TODO: verify zk passport proof
        amounts[token][owner] += amount;
        emit Deposited(owner, token, amount);
    }

    function onFilledOrder(OrderData calldata orderData) external {
        require(msg.sender == GATEWAY, "not gateway");
        address token = _bytes32ToAddress(orderData.outputToken);
        bytes32 commitment = sha256(abi.encodePacked(token, orderData.data));
        require(finalizableDeposits[commitment] == 0, "commitment already used");
        // NOTE: Only the user who owns the full zkPassport proof can call `claim` by providing the proof.
        // The proof commitment must also include `msg.sender` to prevent others from stealing the proof
        // and using it to fraudulently claim the amount.
        finalizableDeposits[commitment] = orderData.amountOut;
        emit NewDepositToFinalize(commitment, token, orderData.amountOut);
    }

    function withdraw(OnchainCrossChainOrder calldata order) external {
        OrderData memory orderData = OrderEncoder.decode(order.orderData);
        address token = _bytes32ToAddress(orderData.inputToken);
        uint256 amount = orderData.amountIn;
        require(amounts[token][msg.sender] - amount > 0, "insufficent balance");
        amounts[token][msg.sender] -= amount;
        IERC20(token).approve(GATEWAY, amount);
        IOriginSettler(GATEWAY).open(order);
        emit Withdrawn(msg.sender, token, amount);
    }

    function _bytes32ToAddress(bytes32 buf) internal pure returns (address) {
        return address(uint160(uint256(buf)));
    }
}
