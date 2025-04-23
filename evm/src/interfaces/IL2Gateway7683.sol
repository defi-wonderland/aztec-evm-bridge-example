pragma solidity ^0.8.28;

import {StateValidator} from "../libs/StateValidator.sol";
import {IOriginSettler, IDestinationSettler} from "../ERC7683/IERC7683.sol";

interface IL2Gateway7683 is IOriginSettler, IDestinationSettler {
    error InvalidStorageKey();
    error InvalidStorageValue();
    error InvalidState();
    error invalidOrderType();

    event ForwarderSet(address forwarder);

    function settle(
        bytes calldata message,
        StateValidator.StateProofParameters memory stateProofParams,
        StateValidator.AccountProofParameters memory accountProofParams
    ) external;

    function setForwarder(address forwarder) external;
}
