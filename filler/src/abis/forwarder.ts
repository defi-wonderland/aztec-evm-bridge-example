export default [
  {
    type: "constructor",
    inputs: [
      {
        name: "l2Gateway",
        type: "address",
        internalType: "address",
      },
      {
        name: "aztecInbox",
        type: "address",
        internalType: "address",
      },
      {
        name: "aztecOutbox",
        type: "address",
        internalType: "address",
      },
      {
        name: "anchorStateRegistry",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ANCHOR_STATE_REGISTRY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "AZTEC_GATEWAY_7683",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "AZTEC_INBOX",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "AZTEC_OUTBOX",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "L2_GATEWAY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SECRET_HASH",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "forwardRefundToAztec",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "originData",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "accountProofParams",
        type: "tuple",
        internalType: "struct StateValidator.AccountProofParameters",
        components: [
          {
            name: "storageKey",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "storageValue",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "accountProof",
            type: "bytes[]",
            internalType: "bytes[]",
          },
          {
            name: "storageProof",
            type: "bytes[]",
            internalType: "bytes[]",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forwardRefundToL2",
    inputs: [
      {
        name: "l2ToL1Message",
        type: "tuple",
        internalType: "struct DataStructures.L2ToL1Msg",
        components: [
          {
            name: "sender",
            type: "tuple",
            internalType: "struct DataStructures.L2Actor",
            components: [
              {
                name: "actor",
                type: "bytes32",
                internalType: "bytes32",
              },
              {
                name: "version",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "recipient",
            type: "tuple",
            internalType: "struct DataStructures.L1Actor",
            components: [
              {
                name: "actor",
                type: "address",
                internalType: "address",
              },
              {
                name: "chainId",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "content",
            type: "bytes32",
            internalType: "bytes32",
          },
        ],
      },
      {
        name: "message",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "aztecBlockNumber",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "leafIndex",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "path",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forwardSettleToAztec",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "originData",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "fillerData",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "accountProofParams",
        type: "tuple",
        internalType: "struct StateValidator.AccountProofParameters",
        components: [
          {
            name: "storageKey",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "storageValue",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "accountProof",
            type: "bytes[]",
            internalType: "bytes[]",
          },
          {
            name: "storageProof",
            type: "bytes[]",
            internalType: "bytes[]",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forwardSettleToL2",
    inputs: [
      {
        name: "l2ToL1Message",
        type: "tuple",
        internalType: "struct DataStructures.L2ToL1Msg",
        components: [
          {
            name: "sender",
            type: "tuple",
            internalType: "struct DataStructures.L2Actor",
            components: [
              {
                name: "actor",
                type: "bytes32",
                internalType: "bytes32",
              },
              {
                name: "version",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "recipient",
            type: "tuple",
            internalType: "struct DataStructures.L1Actor",
            components: [
              {
                name: "actor",
                type: "address",
                internalType: "address",
              },
              {
                name: "chainId",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "content",
            type: "bytes32",
            internalType: "bytes32",
          },
        ],
      },
      {
        name: "message",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "aztecBlockNumber",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "leafIndex",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "path",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAztecGateway7683",
    inputs: [
      {
        name: "aztecGateway7683",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RefundForwardedToAztec",
    inputs: [
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RefundForwardedToL2",
    inputs: [
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SettleForwardedToAztec",
    inputs: [
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SettleForwardedToL2",
    inputs: [
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ContentLengthMismatch",
    inputs: [],
  },
  {
    type: "error",
    name: "EmptyItem",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAccountRLP",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAccountStorage",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidContent",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDataRemainder",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidFilledOrderCommitment",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidHeader",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRecipient",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRefundedOrderCommitment",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSender",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidStorageKey",
    inputs: [],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnexpectedList",
    inputs: [],
  },
  {
    type: "error",
    name: "UnexpectedString",
    inputs: [],
  },
]
