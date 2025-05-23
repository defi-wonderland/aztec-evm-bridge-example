pragma solidity ^0.8.28;

import {StateValidator} from "../libs/StateValidator.sol";
import {IOriginSettler, IDestinationSettler} from "../ERC7683/IERC7683.sol";

interface IL2Gateway7683 is IOriginSettler, IDestinationSettler {
    error InvalidStorageKey();
    error InvalidStorageValue();
    error InvalidState();
    error invalidOrderType();

    event ForwarderSet(address forwarder);
    event AztecGateway7683Set(address aztecGateway7683);

    function settle(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external;

    function setForwarder(address forwarder) external;

    function setAztecGateway7683(address aztecGateway7683) external;
}
