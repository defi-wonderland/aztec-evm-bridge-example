export default [
  {
    type: "constructor",
    inputs: [
      {
        name: "outbox",
        type: "address",
        internalType: "address",
      },
      {
        name: "aztecGateway",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "AZTEC_GATEWAY",
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
    name: "OUTBOX",
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
    name: "forwardSettleToAztec",
    inputs: [],
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
    name: "InvalidContent",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRecipient",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSender",
    inputs: [],
  },
]
