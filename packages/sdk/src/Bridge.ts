import {
  AbiEvent,
  bytesToHex,
  Chain,
  createClient,
  createPublicClient,
  createWalletClient,
  custom,
  decodeAbiParameters,
  encodeAbiParameters,
  erc20Abi,
  Hex,
  http,
  keccak256,
  padHex,
} from "viem"
import * as evmChains from "viem/chains"
import { computeL2ToL1MessageHash } from "@aztec/stdlib/hash"
import { AztecAddress, Fr, PXE, TxHash, sleep, TxReceipt, EthAddress, createAztecNodeClient } from "@aztec/aztec.js"
import { AzguardClient } from "@azguardwallet/client"
import { OkResult, SendTransactionResult, SimulateViewsResult } from "@azguardwallet/types"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { getSchnorrAccount, SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"
import { poseidon2Hash, sha256ToField } from "@aztec/foundation/crypto"
import { waitForTransactionReceipt } from "viem/actions"
import { privateKeyToAccount } from "viem/accounts"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"
import { hexToBuffer } from "@aztec/foundation/string"
import { ssz } from "@lodestar/types"
const { SignedBeaconBlock } = ssz.electra

import {
  getAztecAddressFromAzguardAccount,
  getExecutionStateRootProof,
  getResolvedOrderAndOrderIdEvmByReceipt,
  getResolvedOrderByAztecLogs,
  getSponsoredFPCInstance,
  getSponsporedFeePaymentMethod,
  hexToUintArray,
  OrderDataEncoder,
  parseFilledLog,
} from "./utils"
import {
  AZTEC_VERSION,
  aztecRollupContractL1Addresses,
  aztecSepolia,
  FILLED,
  FILLED_PRIVATELY,
  FORWARDER_REFUNDED_ORDERS_SLOT,
  FORWARDER_SETTLE_ORDER_SLOT,
  forwarderAddresses,
  gatewayAddresses,
  L2_GATEWAY_FILLED_ORDERS_SLOT,
  L2_GATEWAY_REFUNDED_ORDERS_SLOT,
  OPENED,
  opStackAnchorRegistryAddresses,
  ORDER_DATA_TYPE,
  PRIVATE_ORDER,
  PRIVATE_ORDER_WITH_HOOK,
  PRIVATE_SENDER,
  PUBLIC_ORDER,
  PUBLIC_ORDER_WITH_HOOK,
  REFUND_ORDER_TYPE,
  SETTLE_ORDER_TYPE,
} from "./constants"
import {
  AztecGateway7683Contract,
  AztecGateway7683ContractArtifact,
} from "./utils/artifacts/AztecGateway7683/AztecGateway7683"
import l2Gateway7683Abi from "./utils/abi/l2Gateway7683"
import rollupAbi from "./utils/abi/rollup"
import forwarderAbi from "./utils/abi/forwarder"
import anchorRegistryAbi from "./utils/abi/anchorRegistry"

import type {
  BridgeConfigs,
  FilledLog,
  FillOrderDetails,
  ForwardDetails,
  ForwardDetailsInternal,
  InternalChain,
  Order,
  OrderCallbacks,
  OrderData,
  OrderResult,
  RefundOrderDetails,
  ResolvedOrder,
} from "./types"

const AZTEC_WAIT_TIMEOUT = 120000

export class Bridge {
  azguardClient?: AzguardClient
  aztecPxe?: PXE
  aztecKeySalt?: Hex
  aztecSecretKey?: Hex
  beaconApiUrl?: string
  evmPrivateKey?: Hex
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  evmProvider?: any
  #walletAccountRegistered = false
  #aztecGatewayRegistered = false

  constructor(configs: BridgeConfigs) {
    const { azguardClient, aztecPxe, aztecKeySalt, aztecSecretKey, beaconApiUrl, evmPrivateKey, evmProvider } = configs

    if (!aztecSecretKey && !aztecKeySalt && !azguardClient) {
      throw new Error("You must specify aztecSecretKey and aztecKeySalt or azguardClient")
    }

    if (evmPrivateKey && evmProvider) {
      throw new Error("Cannot specify both evmPrivateKey and evmProvider")
    }

    if (azguardClient && aztecSecretKey && aztecKeySalt && aztecPxe) {
      throw new Error("Cannot specify both aztecSecretKey, aztecKeySalt, aztecPxe and azguardClient")
    }

    if ((aztecSecretKey && !aztecKeySalt) || (!aztecSecretKey && aztecKeySalt)) {
      throw new Error("You must specify both aztecSecretKey and aztecKeySalt")
    }

    if (aztecSecretKey && aztecKeySalt && !aztecPxe) {
      throw new Error("You must specify the aztecPxe when using aztecSecretKey and aztecKeySalt")
    }

    this.azguardClient = azguardClient
    this.aztecPxe = aztecPxe
    this.aztecKeySalt = aztecKeySalt
    this.aztecSecretKey = aztecSecretKey
    this.beaconApiUrl = beaconApiUrl
    this.evmPrivateKey = evmPrivateKey
    this.evmProvider = evmProvider
  }

  async claimEvmToAztecPrivateOrder(orderId: Hex, secret: Hex): Promise<Hex> {
    const gatewayOut = gatewayAddresses[aztecSepolia.id]
    const log = await this.#getAztecFilledLogByOrderId(orderId)
    if (!log) throw new Error(`Log not found for the specified order id ${orderId}`)
    await this.#maybeRegisterAztecGateway()

    if (this.azguardClient) {
      // NOTE: Azguard currently doesn't expose the actively selected account.
      // As a workaround, we default to using accounts[0], assuming it's the connected one.
      const selectedAccount = this.azguardClient!.accounts[0]
      const [response] = await this.azguardClient!.execute([
        {
          kind: "send_transaction",
          account: selectedAccount,
          actions: [
            {
              kind: "call",
              contract: gatewayOut,
              method: "claim_private",
              args: [
                secret,
                hexToUintArray(orderId),
                hexToUintArray(log.originData as Hex),
                hexToUintArray(log.fillerData as Hex),
              ],
            },
          ],
        },
      ])
      if (response.status === "failed") throw new Error(response.error)
      return (response as OkResult<SendTransactionResult>).result as Hex
    }

    const wallet = await this.#getAztecWallet()
    const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet)
    const receipt = await gateway.methods
      .claim_private(
        Fr.fromString(secret),
        hexToUintArray(orderId),
        hexToUintArray(log.originData as Hex),
        hexToUintArray(log.fillerData as Hex),
      )
      .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
      .wait({
        timeout: AZTEC_WAIT_TIMEOUT,
      })

    return receipt.txHash.toString()
  }

  async fillOrder(details: FillOrderDetails): Promise<Hex> {
    const { orderData } = details
    if (orderData.fillDeadline <= Math.floor(Date.now() / 1000)) throw new Error("Order expired")

    if (orderData.originDomain === aztecSepolia.id) {
      return this.#fillAztecToEvmOrder(details)
    } else if (orderData.destinationDomain === aztecSepolia.id) {
      return this.#fillEvmToAztecOrder(details)
    }
    throw new Error("Neither chain is Aztec")
  }

  async finalizeForwardRefundOrder(details: ForwardDetails): Promise<Hex> {
    const { chainIdIn, chainIdOut } = details
    if (chainIdOut === aztecSepolia.id) {
      return this.#finalizeForwardToL2({
        ...details,
        type: "forwardRefundToL2",
      })
    } else if (chainIdIn === aztecSepolia.id) {
      return this.#finalizeForwardRefundOrderToAztec(details)
    }
    throw new Error("Neither chain is Aztec")
  }

  async finalizeForwardSettleOrder(details: ForwardDetails): Promise<Hex> {
    const { chainIdIn, chainIdOut } = details
    if (chainIdOut === aztecSepolia.id) {
      return this.#finalizeForwardToL2({
        ...details,
        type: "forwardSettleToL2",
      })
    } else if (chainIdIn === aztecSepolia.id) {
      return this.#finalizeForwardSettleOrderToAztec(details)
    }
    throw new Error("Neither chain is Aztec")
  }

  async forwardRefundOrder(details: ForwardDetails): Promise<Hex> {
    const { chainIdIn, chainIdOut } = details
    if (chainIdOut === aztecSepolia.id) {
      return this.#forwardToL2({ ...details, type: "forwardRefundToL2" })
    } else if (chainIdIn === aztecSepolia.id) {
      return this.#forwardToAztec({ ...details, type: "forwardRefundToAztec" })
    }
    throw new Error("Neither chain is Aztec")
  }

  async forwardSettleOrder(details: ForwardDetails): Promise<Hex> {
    const { chainIdIn, chainIdOut } = details
    if (chainIdOut === aztecSepolia.id) {
      return this.#forwardToL2({ ...details, type: "forwardSettleToL2" })
    } else if (chainIdIn === aztecSepolia.id) {
      return this.#forwardToAztec({ ...details, type: "forwardSettleToAztec" })
    }
    throw new Error("Neither chain is Aztec")
  }

  async openOrder(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainIdIn, chainIdOut, mode, data } = order
    if (chainIdIn === chainIdOut) throw new Error("Invalid chains: source and destination must differ")
    const validModes = ["private", "public", "privateWithHook", "publicWithHook"]
    if (!validModes.includes(mode)) throw new Error(`Invalid mode: ${mode}`)

    if (data.length !== 66) throw new Error("Invalid data: must be 32 bytes")

    if (chainIdIn === aztecSepolia.id) {
      return this.#openAztecToEvmOrder(order, callbacks)
    } else if (chainIdOut === aztecSepolia.id) {
      return this.#openEvmToAztecOrder(order, callbacks)
    } else {
      throw new Error("Neither chain is Aztec")
    }
  }

  async refundOrder(details: RefundOrderDetails): Promise<Hex> {
    const { chainIdIn, chainIdOut } = details
    if (chainIdIn === aztecSepolia.id) {
      return this.#refundAztecToEvmOrder(details)
    } else if (chainIdOut === aztecSepolia.id) {
      return this.#refundEvmToAztecOrder(details)
    }
    throw new Error("Neither chain is Aztec")
  }

  async #fillAztecToEvmOrder(details: FillOrderDetails): Promise<Hex> {
    const { orderId, orderData } = details
    const chainOut = Object.values(evmChains).find((chain: Chain) => chain.id === orderData.destinationDomain)
    if (!chainOut) throw new Error("ChainOut not supported")
    const gatewayOut = gatewayAddresses[chainOut.id]

    const { address, walletClient } = await this.#getEvmWalletClientAndAddress(chainOut)
    const fillerData = padHex(address)

    const accountNonce = await createPublicClient({
      chain: chainOut as Chain,
      transport: http(),
    }).getTransactionCount({
      address: this.evmPrivateKey ? walletClient.account!.address : address,
    })
    await waitForTransactionReceipt(
      createClient({
        chain: chainOut as Chain,
        transport: http(),
      }),
      {
        hash: await walletClient.writeContract({
          abi: erc20Abi,
          account: this.evmPrivateKey ? walletClient.account! : address,
          address: `0x${orderData.outputToken.slice(26)}`,
          args: [gatewayOut, orderData.amountOut],
          chain: chainOut as Chain,
          functionName: "approve",
          nonce: accountNonce,
        }),
      },
    )
    const orderDataEncoder = new OrderDataEncoder(orderData)
    return await walletClient.writeContract({
      abi: l2Gateway7683Abi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: gatewayOut,
      args: [
        orderId,
        orderDataEncoder.encode(),
        fillerData, // NOTE: needed for the settlement
      ],
      chain: chainOut as Chain,
      functionName: "fill",
      nonce: accountNonce + 1,
    })
  }

  async #fillEvmToAztecOrder(details: FillOrderDetails): Promise<Hex> {
    const { orderId, orderData } = details
    const chainOut = aztecSepolia
    const gatewayOut = gatewayAddresses[chainOut.id]
    const orderType = orderData.orderType
    const isPrivate = orderType === PRIVATE_ORDER || orderType === PRIVATE_ORDER_WITH_HOOK
    const orderDataEncoder = new OrderDataEncoder(orderData)
    await this.#maybeRegisterAztecGateway()

    if (this.azguardClient) {
      const selectedAccount = this.azguardClient.accounts[0]
      const fillerData = getAztecAddressFromAzguardAccount(selectedAccount)
      const response = await this.azguardClient.execute([
        {
          kind: "register_contract",
          chain: `aztec:11155111`,
          address: orderData.outputToken,
          artifact: TokenContractArtifact,
        },
        {
          kind: "send_transaction",
          account: selectedAccount,
          actions: [
            {
              kind: isPrivate ? "add_private_authwit" : "add_public_authwit",
              content: {
                kind: "call",
                caller: gatewayOut,
                contract: orderData.outputToken,
                method: isPrivate ? "transfer_to_public" : "transfer_in_public",
                args: isPrivate
                  ? [
                      getAztecAddressFromAzguardAccount(selectedAccount),
                      AztecAddress.fromString(gatewayOut), // NOTE: private orders must be claimed by the user
                      orderData.amountOut,
                      orderData.senderNonce,
                    ]
                  : [
                      getAztecAddressFromAzguardAccount(selectedAccount),
                      AztecAddress.fromString(orderData.recipient),
                      orderData.amountOut,
                      orderData.senderNonce,
                    ],
              },
            },
            {
              kind: "call",
              contract: gatewayOut,
              method: isPrivate ? "fill_private" : "fill",
              args: [hexToUintArray(orderId), hexToUintArray(orderDataEncoder.encode()), hexToUintArray(fillerData)],
            },
          ],
        },
      ])
      for (const res of response) if (res.status === "failed") throw new Error(res.error)
      return (response[1] as OkResult<SendTransactionResult>).result as Hex
    }

    const wallet = await this.#getAztecWallet()
    const fillerData = wallet.getAddress().toString()

    await this.aztecPxe?.registerContract({
      instance: (await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getContract(
        AztecAddress.fromString(orderData.outputToken),
      ))!,
      artifact: TokenContractArtifact,
    })
    const [token, aztecGateway] = await Promise.all([
      TokenContract.at(AztecAddress.fromString(orderData.outputToken), wallet),
      AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet),
    ])

    let witness
    if (isPrivate) {
      witness = await wallet.createAuthWit({
        caller: AztecAddress.fromString(gatewayOut),
        action: token.methods.transfer_to_public(
          wallet.getAddress(),
          AztecAddress.fromString(gatewayOut), // NOTE: private orders must be claimed by the user
          orderData.amountOut,
          orderData.senderNonce,
        ),
      })
    } else {
      ;(
        await wallet.setPublicAuthWit(
          {
            caller: AztecAddress.fromString(gatewayOut),
            action: token.methods.transfer_in_public(
              wallet.getAddress(),
              AztecAddress.fromString(orderData.recipient),
              orderData.amountOut,
              orderData.senderNonce,
            ),
          },
          true,
        )
      )
        .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
        .wait({
          timeout: AZTEC_WAIT_TIMEOUT,
        })
    }

    const receipt = await aztecGateway.methods[isPrivate ? "fill_private" : "fill"](
      hexToUintArray(orderId),
      hexToUintArray(orderDataEncoder.encode()),
      hexToUintArray(fillerData),
    )
      .with({
        authWitnesses: witness ? [witness] : [],
      })
      .send({
        fee: { paymentMethod: await getSponsporedFeePaymentMethod() },
      })
      .wait({
        timeout: AZTEC_WAIT_TIMEOUT,
      })

    return receipt.txHash.toString()
  }

  async #finalizeForwardRefundOrderToAztec(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented")
  }

  async #finalizeForwardSettleOrderToAztec(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented")
  }

  async #finalizeForwardToL2(details: ForwardDetailsInternal): Promise<Hex> {
    const { chainIdForwarder, chainIdIn, chainIdOut, fillerData, orderId, type } = details
    if (!chainIdForwarder) throw new Error("You must specify a forwarder chain")
    const chainForwarder = this.#getChainByChainId(chainIdForwarder)
    const { chainIn, chainOut } = this.#getChainInAndOutByChainIds(chainIdIn, chainIdOut)
    const { gatewayIn } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)
    const forwarderAddress = forwarderAddresses[chainForwarder.id]
    if (!forwarderAddress) throw new Error("Forwarder chain not supported")

    const message =
      type === "forwardRefundToL2"
        ? [hexToBuffer(REFUND_ORDER_TYPE), hexToBuffer(orderId)]
        : [hexToBuffer(SETTLE_ORDER_TYPE), hexToBuffer(orderId), hexToBuffer(padHex(fillerData!))]
    const messageHash = sha256ToField(message)

    const { parentBeaconBlockRoot: beaconRoot, timestamp: beaconOracleTimestamp } = await createPublicClient({
      chain: chainOut as Chain,
      transport: http(),
    }).getBlock()

    if (!this.beaconApiUrl) throw new Error("Beacon api url not specified")
    const resp = await fetch(`${this.beaconApiUrl}/eth/v2/beacon/blocks/${beaconRoot}`, {
      headers: { Accept: "application/octet-stream" },
    })

    const beaconBlock = SignedBeaconBlock.deserialize(new Uint8Array(await resp.arrayBuffer())).message
    const l1BlockNumber = BigInt(beaconBlock.body.executionPayload.blockNumber)

    const stateRootInclusionProof = getExecutionStateRootProof(beaconBlock)
    const storageKey = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [
          messageHash.toString(),
          type === "forwardRefundToL2" ? FORWARDER_REFUNDED_ORDERS_SLOT : FORWARDER_SETTLE_ORDER_SLOT,
        ],
      ),
    )
    const proof = await createPublicClient({
      chain: chainForwarder as Chain,
      transport: http(),
    }).getProof({
      address: forwarderAddress,
      storageKeys: [storageKey],
      blockNumber: l1BlockNumber,
    })

    const accountProofParameters = {
      storageKey: proof.storageProof[0]!.key,
      storageValue: proof.storageProof[0]!.value === 1n ? "0x01" : "0x00",
      accountProof: proof.accountProof,
      storageProof: proof.storageProof[0]!.proof,
    }
    if (accountProofParameters.storageValue === "0x00") {
      throw new Error(`Storage value not up to date yet for order ${orderId} or order not forwarded yet`)
    }

    const stateRootParameters = {
      beaconRoot,
      beaconOracleTimestamp,
      executionStateRoot: stateRootInclusionProof.leaf,
      stateRootProof: stateRootInclusionProof.proof,
    }

    const { address, walletClient } = await this.#getEvmWalletClientAndAddress(chainIn as Chain)
    return await walletClient.writeContract({
      abi: l2Gateway7683Abi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: gatewayIn,
      args: [bytesToHex(Buffer.concat([...message])), stateRootParameters, accountProofParameters],
      chain: chainIn as Chain,
      functionName: type === "forwardRefundToL2" ? "refund" : "settle",
    })
  }

  async #forwardToAztec(details: ForwardDetailsInternal): Promise<Hex> {
    const { chainIdForwarder, chainIdIn, chainIdOut, fillerData, fillTransactionHash, orderId, originData, type } =
      details
    if (!originData || !fillerData || !fillTransactionHash) {
      // TODO: add indexed to Filled.orderId log and search the Filled log by the orderId
      throw new Error("You must specify originData, fillerData and fillTransactionHash")
    }
    if (!chainIdForwarder) throw new Error("You must set a value for chainForwarder")
    const chainForwarder = this.#getChainByChainId(chainIdForwarder) as Chain
    const chainOut = this.#getChainByChainId(chainIdOut) as Chain
    const { gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)

    const forwarderAddress = forwarderAddresses[chainForwarder.id]
    if (!forwarderAddress) throw new Error("Forwarder chain not supported")
    const opStackAnchorRegistryAddress = opStackAnchorRegistryAddresses[chainIdForwarder]
    if (!opStackAnchorRegistryAddress) throw new Error("Invalid chainForwarder")

    const [_, l2EvmAnchorRootblockNumber] = (await createPublicClient({
      chain: chainForwarder,
      transport: http(),
    }).readContract({
      abi: anchorRegistryAbi,
      functionName: "getAnchorRoot",
      args: [],
      address: opStackAnchorRegistryAddress,
    })) as [Hex, bigint]

    const l2EvmClient = createPublicClient({
      chain: chainOut,
      transport: http(),
    })

    const receipt = await l2EvmClient.getTransactionReceipt({ hash: fillTransactionHash })
    if (receipt.blockNumber > l2EvmAnchorRootblockNumber) {
      throw new Error(
        `cannot forward to Aztec for order ${orderId} because the corresponding block number ${receipt.blockNumber} is > than the anchor root one ${l2EvmAnchorRootblockNumber} ...`,
      )
    }

    const storageKey = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [orderId, type === "forwardSettleToAztec" ? L2_GATEWAY_FILLED_ORDERS_SLOT : L2_GATEWAY_REFUNDED_ORDERS_SLOT],
      ),
    )
    const proof = await l2EvmClient.request({
      method: "eth_getProof",
      params: [gatewayOut, [storageKey], `0x${l2EvmAnchorRootblockNumber.toString(16)}`],
    })

    const accountProofParameters = {
      storageKey: proof.storageProof[0]!.key,
      storageValue: proof.storageProof[0]!.value,
      accountProof: proof.accountProof,
      storageProof: proof.storageProof[0]!.proof,
    }

    const { walletClient, address } = await this.#getEvmWalletClientAndAddress(chainForwarder)
    return await walletClient.writeContract({
      abi: forwarderAbi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: forwarderAddress,
      args: [orderId, originData, fillerData, accountProofParameters],
      chain: chainForwarder,
      functionName: type === "forwardSettleToAztec" ? "forwardSettleToAztec" : "forwardRefundToAztec",
    })
  }

  async #forwardToL2(details: ForwardDetailsInternal): Promise<Hex> {
    const { chainIdForwarder, chainIdIn, chainIdOut, fillerData, orderId, type } = details
    if (!chainIdForwarder) throw new Error("You must specify a forwarder chain")
    const chainForwarder = this.#getChainByChainId(chainIdForwarder) as Chain
    const { gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)

    const rollupAddress = aztecRollupContractL1Addresses[chainForwarder.id]
    const forwarderAddress = forwarderAddresses[chainForwarder.id]
    if (!rollupAddress || !forwarderAddress) throw new Error("Forwarder chain not supported")

    const message =
      type === "forwardRefundToL2"
        ? [hexToBuffer(REFUND_ORDER_TYPE), hexToBuffer(orderId)]
        : [hexToBuffer(SETTLE_ORDER_TYPE), hexToBuffer(orderId), hexToBuffer(padHex(fillerData!))]
    const messageHash = sha256ToField(message)

    const l2ToL1MessageHash = computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromString(gatewayOut),
      l1Recipient: EthAddress.fromString(forwarderAddress),
      content: messageHash,
      rollupVersion: Fr.fromString(AZTEC_VERSION.toString()),
      chainId: Fr.fromString(chainForwarder.id.toString()),
    })

    await this.#maybeRegisterAztecGateway()
    const getRefundOrSettlementBlockNumber = async (): Promise<bigint> => {
      const wallet = await this.#getAztecWallet()
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet)
      return (await gateway.methods[
        type === "forwardRefundToL2" ? "get_order_refund_block_number" : "get_order_settlement_block_number"
      ](Fr.fromBufferReduce(hexToBuffer(orderId))).simulate()) as bigint
    }

    const aztecMessageBlockNumber = await getRefundOrSettlementBlockNumber()
    if (aztecMessageBlockNumber === 0n)
      throw new Error(`Order ${type === "forwardRefundToL2" ? "refund" : "settlement"} block number not found`)
    const aztecProvenBlockNumber = (await createPublicClient({
      chain: chainForwarder,
      transport: http(),
    }).readContract({
      address: rollupAddress,
      args: [],
      abi: rollupAbi,
      functionName: "getProvenBlockNumber",
    })) as bigint
    if (aztecMessageBlockNumber > aztecProvenBlockNumber) {
      throw new Error(
        `cannot forward to L2 for order ${orderId} because the corresponding block number ${aztecMessageBlockNumber} is > than the last proven ${aztecProvenBlockNumber}!`,
      )
    }

    const [l2ToL1MessageIndex, siblingPath] = await this.aztecPxe!.getL2ToL1MembershipWitness(
      parseInt(aztecMessageBlockNumber.toString()),
      l2ToL1MessageHash,
    )

    const { walletClient, address } = await this.#getEvmWalletClientAndAddress(chainForwarder)
    return await walletClient.writeContract({
      abi: forwarderAbi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: forwarderAddress,
      args: [
        {
          sender: {
            actor: gatewayOut,
            version: AZTEC_VERSION,
          },
          recipient: {
            actor: forwarderAddress,
            chainId: chainForwarder.id,
          },
          content: messageHash.toString(),
        },
        bytesToHex(Buffer.concat([...message])),
        BigInt(aztecMessageBlockNumber),
        BigInt(l2ToL1MessageIndex),
        siblingPath.toBufferArray().map((buf) => padHex(bytesToHex(buf))),
      ],
      chain: chainForwarder,
      functionName: type === "forwardRefundToL2" ? "forwardRefundToL2" : "forwardSettleToL2",
    })
  }

  async #getAztecWallet() {
    const secretKey = Fr.fromHexString(this.aztecSecretKey!)
    const salt = Fr.fromHexString(this.aztecKeySalt!)
    const signingKey = deriveSigningKey(secretKey)
    const account = await getSchnorrAccount(this.aztecPxe!, secretKey, signingKey, salt)
    if (!this.#walletAccountRegistered) {
      await this.aztecPxe?.registerAccount(secretKey, (await account.getCompleteAddress()).partialAddress)
      await this.aztecPxe?.registerContract({
        instance: account.getInstance(),
        artifact: SchnorrAccountContractArtifact,
      })
      await this.aztecPxe?.registerContract({
        instance: await getSponsoredFPCInstance(),
        artifact: SponsoredFPCContractArtifact,
      })
      this.#walletAccountRegistered = true
    }
    return await account.getWallet()
  }

  #getChainInAndOutByChainIds(
    chainIdIn: Order["chainIdIn"],
    chainIdOut: Order["chainIdOut"],
  ): {
    chainIn: InternalChain
    chainOut: InternalChain
  } {
    return {
      chainIn: this.#getChainByChainId(chainIdIn),
      chainOut: this.#getChainByChainId(chainIdOut),
    }
  }

  #getChainByChainId(chainId: number): InternalChain {
    const chains = [...Object.values(evmChains), aztecSepolia] as InternalChain[]
    const chain = chains.find((c) => c.id === chainId)
    if (!chain) throw new Error("Chain not found")
    return chain
  }

  async #getEvmWalletClientAndAddress(chain: Chain) {
    const walletClient = this.evmProvider
      ? createWalletClient({
          chain,
          transport: custom(this.evmProvider),
        })
      : createWalletClient({
          chain,
          account: privateKeyToAccount(this.evmPrivateKey!),
          transport: http(),
        })

    let address
    if (walletClient.account) {
      // privateKeyToAccount
      address = walletClient.account.address
    } else {
      // window.ethereum
      ;[address] = await walletClient.getAddresses()
    }
    return {
      walletClient,
      address,
    }
  }

  #getOrderType(mode: Order["mode"]): number {
    switch (mode) {
      case "private":
        return PRIVATE_ORDER
      case "privateWithHook":
        return PRIVATE_ORDER_WITH_HOOK
      case "public":
        return PUBLIC_ORDER
      case "publicWithHook":
        return PUBLIC_ORDER_WITH_HOOK
      default:
        throw new Error("Invalid mode")
    }
  }

  #getGatewaysByChainIds(
    chainIdIn: Order["chainIdIn"],
    chainIdOut: Order["chainIdOut"],
  ): {
    gatewayIn: Hex
    gatewayOut: Hex
  } {
    const gatewayIn = gatewayAddresses[chainIdIn]
    if (!gatewayIn) throw new Error("Unsupported source chain")
    const gatewayOut = gatewayAddresses[chainIdOut]
    if (!gatewayOut) throw new Error("Unsupported destination chain")
    return {
      gatewayIn,
      gatewayOut,
    }
  }

  async #getAztecFilledLogByOrderId(orderId: Hex): Promise<FilledLog | undefined> {
    // TODO: understand why if i use fromBlock and toBlock i always receive the penultimante log.
    // Basically i never receive the last one even if block numbers are up to date
    const gateway = gatewayAddresses[aztecSepolia.id]
    const { logs } = await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getPublicLogs({
      contractAddress: AztecAddress.fromString(gateway),
    })
    const parsedLogs = logs.map(({ log }) => parseFilledLog(log.fields))
    return parsedLogs.find((log) => log.orderId === orderId)
  }

  async #getAztecOpenLogByOrderId(orderId: Hex): Promise<ResolvedOrder | undefined> {
    // TODO: understand why if i use fromBlock and toBlock i always receive the penultimante log.
    // Basically i never receive the last one even if block numbers are up to date
    const gateway = gatewayAddresses[aztecSepolia.id]
    const { logs } = await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getPublicLogs({
      contractAddress: AztecAddress.fromString(gateway),
    })
    const parsedOpenLogs = getResolvedOrderByAztecLogs(logs)
    return parsedOpenLogs.find((order) => order.orderId === orderId)
  }

  async #monitorAztecToEvmOrder(
    order: Order,
    receipt: TxReceipt,
    callbacks?: OrderCallbacks,
  ): Promise<{ transactionHash: Hex; resolvedOrder: ResolvedOrder }> {
    const { chainIdIn, chainIdOut } = order
    const { onOrderOpened, onOrderFilled } = callbacks || {}
    const { chainIn, chainOut } = this.#getChainInAndOutByChainIds(chainIdIn, chainIdOut)
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)

    if (chainIdIn !== aztecSepolia.id) throw new Error("Chain in is not Aztec")
    const { logs } = await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getPublicLogs({
      fromBlock: receipt.blockNumber! - 1,
      toBlock: receipt.blockNumber! + 1,
      contractAddress: AztecAddress.fromString(gatewayIn),
    })
    // TODO: handle multiple orders in the same tx
    const [resolvedOrder] = getResolvedOrderByAztecLogs(logs)
    onOrderOpened?.({ orderId: resolvedOrder.orderId, transactionHash: receipt.txHash.toString(), resolvedOrder })

    const evmPublicClient = createPublicClient({
      chain: chainOut as Chain,
      transport: http(),
    })
    const waitForFilledOrder = async (orderId: Hex): Promise<Hex> => {
      while (true) {
        const result = (await evmPublicClient.readContract({
          address: gatewayOut,
          abi: l2Gateway7683Abi,
          functionName: "filledOrders",
          args: [orderId],
        })) as [Hex, Hex]
        if (result[0] !== "0x" && result[1] !== "0x") break
        await sleep(5000)
      }

      const currentBlock = await evmPublicClient.getBlockNumber()
      const [log] = await evmPublicClient.getLogs({
        address: gatewayOut,
        event: l2Gateway7683Abi.find((el) => el.type === "event" && el.name === "Filled") as AbiEvent,
        args: {
          orderId,
        },
        fromBlock: currentBlock - 100n,
        toBlock: currentBlock,
      })
      return log.transactionHash
    }
    const orderFilledTxHash = await waitForFilledOrder(resolvedOrder.orderId)
    onOrderFilled?.({ orderId: resolvedOrder.orderId, transactionHash: orderFilledTxHash })
    return { transactionHash: orderFilledTxHash, resolvedOrder }
  }

  async #monitorEvmToAztecOrder(order: Order, orderId: Hex, callbacks?: OrderCallbacks) {
    const { chainIdIn, chainIdOut } = order
    const { onOrderFilled } = callbacks || {}
    const { chainIn, chainOut } = this.#getChainInAndOutByChainIds(chainIdIn, chainIdOut)
    const { gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)
    await this.#maybeRegisterAztecGateway()

    if (this.azguardClient) {
      // NOTE: Azguard currently doesn't expose the actively selected account.
      // As a workaround, we default to using accounts[0], assuming it's the connected one.
      const selectedAccount = this.azguardClient!.accounts[0]
      while (true) {
        const [response] = await this.azguardClient!.execute([
          {
            kind: "simulate_views",
            account: selectedAccount,
            calls: [
              {
                kind: "call",
                contract: gatewayOut,
                method: "get_order_status",
                args: [orderId],
              },
            ],
          },
        ])
        if (response.status === "failed") throw new Error(response.error)
        const status = parseInt(BigInt((response as OkResult<SimulateViewsResult>).result.encoded[0][0]).toString())
        if (status === FILLED_PRIVATELY || status === FILLED) {
          onOrderFilled?.({ orderId })
          return
        }
        await sleep(3000)
      }
    }

    const wallet = await this.#getAztecWallet!()
    while (true) {
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet)
      const status = parseInt(await gateway.methods.get_order_status(Fr.fromString(orderId)).simulate())
      if (status === FILLED_PRIVATELY || status === FILLED) {
        onOrderFilled?.({ orderId })
        return
      }
      await sleep(3000)
    }
  }

  async #maybeRegisterAztecGateway(): Promise<void> {
    const gateway = gatewayAddresses[aztecSepolia.id]
    if (!this.#aztecGatewayRegistered) {
      if (this.azguardClient) {
        await this.azguardClient!.execute([
          {
            kind: "register_contract",
            chain: `aztec:11155111`,
            address: gateway,
            artifact: AztecGateway7683ContractArtifact,
          },
        ])
      } else {
        await this.aztecPxe?.registerContract({
          instance: (await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getContract(
            AztecAddress.fromString(gateway),
          ))!,
          artifact: AztecGateway7683ContractArtifact,
        })
      }
      this.#aztecGatewayRegistered = true
    }
  }

  async #openAztecToEvmOrder(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { amountIn, amountOut, chainIdIn, chainIdOut, data, mode, recipient, tokenIn, tokenOut } = order
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)
    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")
    const baseOrderData = {
      recipient: padHex(recipient),
      inputToken: padHex(tokenIn),
      outputToken: padHex(tokenOut),
      amountIn,
      amountOut,
      senderNonce: nonce.toBigInt(),
      originDomain: chainIdIn,
      destinationDomain: chainIdOut,
      destinationSettler: padHex(gatewayOut),
      fillDeadline,
      orderType: this.#getOrderType(mode),
      data: data || padHex("0x"),
    }
    await this.#maybeRegisterAztecGateway()

    let orderOpenedReceipt
    if (this.azguardClient) {
      // NOTE: Azguard currently doesn't expose the actively selected account.
      // As a workaround, we default to using accounts[0], assuming it's the connected one.
      const selectedAccount = this.azguardClient!.accounts[0]

      const orderDataEncoder = new OrderDataEncoder({
        ...baseOrderData,
        sender: isPrivate ? PRIVATE_SENDER : getAztecAddressFromAzguardAccount(selectedAccount),
      })
      const response = await this.azguardClient!.execute([
        {
          kind: "register_contract",
          chain: `aztec:11155111`,
          address: tokenIn,
          artifact: TokenContractArtifact,
        },
        {
          kind: "send_transaction",
          account: selectedAccount,
          actions: [
            {
              kind: isPrivate ? "add_private_authwit" : "add_public_authwit",
              content: {
                kind: "call",
                caller: gatewayIn,
                contract: tokenIn,
                method: isPrivate ? "transfer_to_public" : "transfer_in_public",
                args: [getAztecAddressFromAzguardAccount(selectedAccount), gatewayIn, amountIn, nonce],
              },
            },
            {
              kind: "call",
              contract: gatewayIn,
              method: isPrivate ? "open_private" : "open",
              args: [
                {
                  fill_deadline: fillDeadline,
                  order_data: hexToUintArray(orderDataEncoder.encode()),
                  order_data_type: hexToUintArray(ORDER_DATA_TYPE),
                },
              ],
            },
          ],
        },
      ])
      for (const res of response) if (res.status === "failed") throw new Error(res.error)
      const orderOpenedTxHash = (response[1] as OkResult<SendTransactionResult>).result as Hex

      const waitForReceipt = async (txHash: string): Promise<TxReceipt> => {
        while (true) {
          const receipt = await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getTxReceipt(
            TxHash.fromString(txHash),
          )
          if (receipt.status === "success") return receipt
          if (receipt.status === "pending") {
            await sleep(5000)
            continue
          }
          throw new Error("Aztec transaction failed")
        }
      }
      orderOpenedReceipt = await waitForReceipt(orderOpenedTxHash)
    } else {
      const wallet = await this.#getAztecWallet()
      await this.aztecPxe?.registerContract({
        instance: (await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getContract(
          AztecAddress.fromString(tokenIn),
        ))!,
        artifact: TokenContractArtifact,
      })
      const orderDataEncoder = new OrderDataEncoder({
        ...baseOrderData,
        sender: isPrivate ? PRIVATE_SENDER : wallet.getAddress().toString(),
      })

      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayIn), wallet)
      const token = await TokenContract.at(AztecAddress.fromString(tokenIn), wallet)
      let witness
      if (isPrivate) {
        witness = await wallet.createAuthWit({
          caller: AztecAddress.fromString(gatewayIn),
          action: token.methods.transfer_to_public(
            wallet.getAddress(),
            AztecAddress.fromString(gatewayIn),
            amountIn,
            nonce,
          ),
        })
      } else {
        await (
          await wallet.setPublicAuthWit(
            {
              caller: AztecAddress.fromString(gatewayIn),
              action: token.methods.transfer_in_public(
                wallet.getAddress(),
                AztecAddress.fromString(gatewayIn),
                amountIn,
                nonce,
              ),
            },
            true,
          )
        )
          .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
          .wait({
            timeout: AZTEC_WAIT_TIMEOUT,
          })
      }

      orderOpenedReceipt = await gateway.methods[isPrivate ? "open_private" : "open"]({
        fill_deadline: fillDeadline,
        order_data: hexToUintArray(orderDataEncoder.encode()),
        order_data_type: hexToUintArray(ORDER_DATA_TYPE),
      })
        .with({
          authWitnesses: witness ? [witness] : [],
        })
        .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
        .wait({
          timeout: AZTEC_WAIT_TIMEOUT,
        })
    }

    const { transactionHash: orderFilledTxHash, resolvedOrder } = await this.#monitorAztecToEvmOrder(
      order,
      orderOpenedReceipt,
      callbacks,
    )
    return {
      orderOpenedTxHash: orderOpenedReceipt.txHash.toString(),
      orderFilledTxHash,
      resolvedOrder,
    }
  }

  async #openEvmToAztecOrder(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { amountIn, amountOut, chainIdIn, chainIdOut, data, mode, recipient, tokenIn, tokenOut } = order
    const { onSecret, onOrderOpened, onOrderClaimed } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)
    const chainIn = this.#getChainByChainId(chainIdIn)
    const { walletClient, address: sender } = await this.#getEvmWalletClientAndAddress(chainIn as Chain)

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")
    const secret = isPrivate ? Fr.random() : null

    const orderData: OrderData = {
      sender: padHex(sender),
      recipient: secret ? (await poseidon2Hash([secret])).toString() : padHex(recipient),
      inputToken: padHex(tokenIn),
      outputToken: padHex(tokenOut),
      amountIn,
      amountOut,
      senderNonce: nonce.toBigInt(),
      originDomain: chainIdIn,
      destinationDomain: chainIdOut,
      destinationSettler: padHex(gatewayOut),
      fillDeadline,
      orderType: isPrivate ? PRIVATE_ORDER : PUBLIC_ORDER,
      data: data || padHex("0x"),
    }
    const orderDataEncoder = new OrderDataEncoder(orderData)

    const evmClient = createClient({
      chain: chainIn as Chain,
      transport: http(),
    })
    const accountNonce = await createPublicClient({
      chain: chainIn as Chain,
      transport: http(),
    }).getTransactionCount({
      address: this.evmPrivateKey ? walletClient.account!.address : sender,
    })
    let txHash = await walletClient.writeContract({
      abi: erc20Abi,
      account: this.evmPrivateKey ? walletClient.account! : sender,
      address: tokenIn,
      args: [gatewayIn, amountIn],
      chain: chainIn as Chain,
      functionName: "approve",
      nonce: accountNonce,
    })
    await waitForTransactionReceipt(evmClient, { hash: txHash })
    txHash = await walletClient.writeContract({
      abi: l2Gateway7683Abi,
      account: this.evmPrivateKey ? walletClient.account! : sender,
      address: gatewayIn,
      args: [
        {
          fillDeadline,
          orderData: orderDataEncoder.encode(),
          orderDataType: ORDER_DATA_TYPE,
        },
      ],
      chain: chainIn as Chain,
      functionName: "open",
      nonce: accountNonce + 1,
    })
    const receipt = await waitForTransactionReceipt(evmClient, { hash: txHash! })
    const { orderId, resolvedOrder } = getResolvedOrderAndOrderIdEvmByReceipt(receipt)

    if (secret)
      onSecret?.({
        orderId,
        secret: secret.toString(),
      })
    onOrderOpened?.({
      orderId,
      resolvedOrder,
      transactionHash: txHash,
    })

    await this.#monitorEvmToAztecOrder(order, orderId, callbacks)

    // NOTE: if private
    if (secret) {
      const orderClaimedTxHash = await this.claimEvmToAztecPrivateOrder(orderId, secret.toString())
      onOrderClaimed?.({ orderId, transactionHash: orderClaimedTxHash })
      return {
        orderOpenedTxHash: txHash!,
        orderClaimedTxHash,
        resolvedOrder,
      }
    }

    return {
      orderOpenedTxHash: txHash!,
      resolvedOrder,
    }
  }

  async #refundAztecToEvmOrder(details: RefundOrderDetails): Promise<Hex> {
    const { orderId, chainIdIn, chainIdOut } = details
    const chainOut = this.#getChainByChainId(chainIdOut)
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)

    let status = 0
    if (this.azguardClient) {
      const selectedAccount = this.azguardClient.accounts[0]
      const [response] = await this.azguardClient!.execute([
        {
          kind: "simulate_views",
          account: selectedAccount,
          calls: [
            {
              kind: "call",
              contract: gatewayIn,
              method: "get_order_status",
              args: [orderId],
            },
          ],
        },
      ])

      if (response.status === "failed") throw new Error(response.error)
      status = parseInt(BigInt((response as OkResult<SimulateViewsResult>).result.encoded[0][0]).toString())
    } else {
      const wallet = await this.#getAztecWallet()
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayIn), wallet)
      status = parseInt(await gateway.methods.get_order_status(Fr.fromString(orderId)).simulate())
    }

    if (status !== OPENED) throw new Error("Cannot find an opened order for the specified order id")
    // NOTE: opened on Aztec -> trigger refund on EVM

    const { walletClient, address } = await this.#getEvmWalletClientAndAddress(chainOut as Chain)
    const log = await this.#getAztecOpenLogByOrderId(orderId)

    return await walletClient.writeContract({
      abi: l2Gateway7683Abi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: gatewayOut,
      args: [
        [
          {
            fillDeadline: log?.fillDeadline,
            orderDataType: ORDER_DATA_TYPE,
            orderData: log?.fillInstructions[0].originData,
          },
        ],
      ],
      chain: chainOut as Chain,
      functionName: "refund",
    })
  }

  async #refundEvmToAztecOrder(details: RefundOrderDetails): Promise<Hex> {
    const { orderId, chainIdIn, chainIdOut } = details
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChainIds(chainIdIn, chainIdOut)
    const chainIn = this.#getChainByChainId(chainIdIn)

    const order = (await createPublicClient({
      chain: chainIn as Chain,
      transport: http(),
    }).readContract({
      address: gatewayIn,
      abi: l2Gateway7683Abi,
      functionName: "openOrders",
      args: [orderId],
    })) as Hex
    if (!order || order === "0x") throw new Error("Cannot find an opened order for the specified order id")
    // NOTE opened on EVM -> trigger refund on Aztec

    const [, orderData] = decodeAbiParameters(
      [
        { type: "bytes32", name: "orderType" },
        { type: "bytes", name: "orderData" },
      ],
      order,
    )

    await this.#maybeRegisterAztecGateway()

    if (this.azguardClient) {
      const selectedAccount = this.azguardClient.accounts[0]
      const [response] = await this.azguardClient.execute([
        {
          kind: "send_transaction",
          account: selectedAccount,
          actions: [
            {
              kind: "call",
              contract: gatewayOut,
              method: "refund",
              args: [hexToUintArray(orderId), hexToUintArray(orderData)],
            },
          ],
        },
      ])
      if (response.status === "failed") throw new Error(response.error)
      return (response as OkResult<SendTransactionResult>).result as Hex
    } else {
      const wallet = await this.#getAztecWallet()
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet)
      const receipt = await gateway.methods
        .refund(hexToUintArray(orderId), hexToUintArray(orderData))
        .send({
          fee: {
            paymentMethod: await getSponsporedFeePaymentMethod(),
          },
        })
        .wait({
          timeout: AZTEC_WAIT_TIMEOUT,
        })

      return receipt.txHash.toString()
    }
  }
}
