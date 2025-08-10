import {
  AbiEvent,
  bytesToHex,
  Chain,
  createClient,
  createPublicClient,
  createWalletClient,
  custom,
  decodeAbiParameters,
  erc20Abi,
  Hex,
  hexToBytes,
  http,
  Log,
  padHex,
} from "viem"
import { AztecAddress, Fr, PXE, AztecNode, TxHash, sleep, TxReceipt, EthAddress } from "@aztec/aztec.js"
import { AzguardClient } from "@azguardwallet/client"
import { OkResult, SendTransactionResult, SimulateViewsResult } from "@azguardwallet/types"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { getSchnorrAccount, SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"
import { poseidon2Hash, sha256ToField } from "@aztec/foundation/crypto"
import { waitForTransactionReceipt } from "viem/actions"
import { privateKeyToAccount } from "viem/accounts"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"

import { OrderData, getAztecAddressFromAzguardAccount } from "./utils"
import {
  AZTEC_VERSION,
  aztecRollupContractL1Addresses,
  aztecSepolia,
  FILLED,
  FILLED_PRIVATELY,
  forwarderAddresses,
  gatewayAddresses,
  OPENED,
  ORDER_DATA_TYPE,
  PRIVATE_ORDER,
  PRIVATE_ORDER_WITH_HOOK,
  PRIVATE_SENDER,
  PUBLIC_ORDER,
  PUBLIC_ORDER_WITH_HOOK,
  REFUND_ORDER_TYPE,
} from "./constants"
import {
  AztecGateway7683Contract,
  AztecGateway7683ContractArtifact,
} from "./utils/artifacts/AztecGateway7683/AztecGateway7683"
import l2Gateway7683Abi from "./utils/abi/l2Gateway7683"
import rollupAbi from "./utils/abi/rollup"
import forwarderAbi from "./utils/abi/forwarder"
import { getSponsoredFPCInstance, getSponsporedFeePaymentMethod } from "./utils/fpc"
import { FilledLog, getParsedOpenLogs, ParsedOpenLog, parseFilledLog } from "./utils/gateway"

type SwapMode = "private" | "public" | "privateWithHook" | "publicWithHook"

type LogWithTopics = Log & {
  topics: string[]
}

interface Order {
  chainIn: Chain | { id: number; name: string }
  chainOut: Chain | { id: number; name: string }
  amountIn: bigint
  amountOut: bigint
  tokenIn: Hex
  tokenOut: Hex
  recipient: Hex
  mode: SwapMode
  data: Hex
  fillDeadline?: number
}

interface RefundOrderDetails {
  orderId: Hex
  chainIn: Chain | { id: number; name: string }
  chainOut: Chain | { id: number; name: string }
  chainForwarder?: Chain
}

interface OrderResult {
  orderOpenedTxHash: Hex
  // NOTE: on aztec we cannot get the filled transaction hash where a given log has been emitted
  orderFilledTxHash?: Hex
  orderClaimedTxHash?: Hex
}

interface OrderCallbacks {
  onSecret?: (orderId: Hex, secret: Hex) => void
  onOrderOpened?: (orderId: Hex, txHash: Hex) => void
  onOrderFilled?: (orderId: Hex, txHash?: Hex) => void
  onOrderClaimed?: (orderId: Hex, txHash: Hex) => void
}

interface BridgeConfigs {
  azguardClient?: AzguardClient
  aztecNode: AztecNode
  aztecPxe?: PXE
  aztecKeySalt?: Hex
  aztecSecretKey?: Hex
  evmPrivateKey?: Hex
  evmProvider?: any
}

export class Bridge {
  azguardClient?: AzguardClient
  aztecNode: AztecNode
  aztecPxe?: PXE
  aztecKeySalt?: Hex
  aztecSecretKey?: Hex
  evmPrivateKey?: Hex
  evmProvider?: any
  #walletAccountRegistered = false
  #aztecGatewayRegistered = false

  constructor(configs: BridgeConfigs) {
    const { azguardClient, aztecNode, aztecPxe, aztecKeySalt, aztecSecretKey, evmPrivateKey, evmProvider } = configs

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
    this.aztecNode = aztecNode
    this.aztecPxe = aztecPxe
    this.aztecKeySalt = aztecKeySalt
    this.aztecSecretKey = aztecSecretKey
    this.evmPrivateKey = evmPrivateKey
    this.evmProvider = evmProvider
  }

  async claimEvmToAztecPrivateOrder(orderId: Hex, secret: Hex): Promise<Hex> {
    if (this.azguardClient) {
      return this.#claimEvmToAztecPrivateOrderAzguard(orderId, secret)
    }
    return this.#claimEvmToAztecPrivateOrderDefault(orderId, secret)
  }

  async createOrder(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainIn, chainOut, mode, data } = order

    if (chainIn.id === chainOut.id) throw new Error("Invalid chains: source and destination must differ")

    const validModes = ["private", "public", "privateWithHook", "publicWithHook"]
    if (!validModes.includes(mode)) throw new Error(`Invalid mode: ${mode}`)

    if (data.length !== 66) throw new Error("Invalid data: must be 32 bytes")

    if (chainIn.id === aztecSepolia.id) {
      return this.#aztecToEvm(order, callbacks)
    } else if (chainOut.id === aztecSepolia.id) {
      return this.#evmToAztec(order, callbacks)
    } else {
      throw new Error("Neither chain is Aztec")
    }
  }

  async forwardRefundOrder(details: RefundOrderDetails): Promise<Hex> {
    const { chainIn } = details
    if (chainIn.id === aztecSepolia.id) {
      return this.#forwardRefundOrderToL2(details)
    }
    return this.#forwardRefundOrderToAztec(details)
  }

  async refundOrder(details: RefundOrderDetails): Promise<Hex> {
    const { chainIn } = details
    if (chainIn.id === aztecSepolia.id) {
      return this.#refundAztecToEvmOrder(details)
    }
    return this.#refundEvmToAztecOrder(details)
  }

  async #aztecToEvm(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    if (this.azguardClient) return this.#aztecToEvmAzguard(order, callbacks)
    return this.#aztecToEvmDefault(order, callbacks)
  }

  async #aztecToEvmAzguard(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = order
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    // NOTE: Azguard currently doesn't expose the actively selected account.
    // As a workaround, we default to using accounts[0], assuming it's the connected one.
    const selectedAccount = this.azguardClient!.accounts[0]
    const isPrivate = mode.includes("private")

    const orderData = new OrderData({
      sender: isPrivate ? PRIVATE_SENDER : getAztecAddressFromAzguardAccount(selectedAccount),
      recipient: padHex(recipient),
      inputToken: padHex(tokenIn),
      outputToken: padHex(tokenOut),
      amountIn,
      amountOut,
      senderNonce: nonce.toBigInt(),
      originDomain: chainIn.id,
      destinationDomain: chainOut.id,
      destinationSettler: padHex(gatewayOut),
      fillDeadline,
      orderType: this.#getOrderType(mode),
      data: data || padHex("0x"),
    })

    await this.#maybeRegisterAztecGateway()
    const [response] = await this.azguardClient!.execute([
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
                fill_deadline: orderData.fillDeadline,
                order_data: Array.from(hexToBytes(orderData.encode())),
                order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
              },
            ],
          },
        ],
      },
    ])
    if (response.status === "failed") throw new Error(response.error)
    const orderOpenedTxHash = (response as OkResult<SendTransactionResult>).result as Hex

    const waitForReceipt = async (txHash: string): Promise<TxReceipt> => {
      while (true) {
        const receipt = await this.aztecNode.getTxReceipt(TxHash.fromString(txHash))
        if (receipt.status === "success") return receipt
        if (receipt.status === "pending") {
          await sleep(5000)
          continue
        }
        throw new Error("Aztec transaction failed")
      }
    }
    const orderCreatedReceipt = await waitForReceipt(orderOpenedTxHash)

    const orderFilledTxHash = await this.#monitorAztecToEvmOrder(order, orderCreatedReceipt, callbacks)
    return {
      orderOpenedTxHash,
      orderFilledTxHash,
    }
  }

  async #aztecToEvmDefault(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = order
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)
    const wallet = await this.#getAztecWallet()

    await this.#maybeRegisterAztecGateway()
    await this.aztecPxe?.registerContract({
      instance: (await this.aztecNode.getContract(AztecAddress.fromString(tokenIn)))!,
      artifact: TokenContractArtifact,
    })

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")

    const orderData = new OrderData({
      sender: isPrivate ? PRIVATE_SENDER : wallet.getAddress().toString(),
      recipient: padHex(recipient),
      inputToken: padHex(tokenIn),
      outputToken: padHex(tokenOut),
      amountIn,
      amountOut,
      senderNonce: nonce.toBigInt(),
      originDomain: chainIn.id,
      destinationDomain: chainOut.id,
      destinationSettler: padHex(gatewayOut),
      fillDeadline,
      orderType: this.#getOrderType(mode),
      data: data || padHex("0x"),
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
          timeout: 120000,
        })
    }

    const receipt = await gateway.methods[isPrivate ? "open_private" : "open"]({
      fill_deadline: fillDeadline,
      order_data: Array.from(hexToBytes(orderData.encode())),
      order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
    })
      .with({
        authWitnesses: witness ? [witness] : [],
      })
      .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
      .wait({
        timeout: 120000,
      })

    const orderFilledTxHash = await this.#monitorAztecToEvmOrder(order, receipt, callbacks)
    return {
      orderOpenedTxHash: receipt.txHash.toString(),
      orderFilledTxHash,
    }
  }

  async #claimEvmToAztecPrivateOrderAzguard(orderId: Hex, secret: Hex): Promise<Hex> {
    const gateway = gatewayAddresses[aztecSepolia.id]
    // NOTE: Azguard currently doesn't expose the actively selected account.
    // As a workaround, we default to using accounts[0], assuming it's the connected one.
    const selectedAccount = this.azguardClient!.accounts[0]
    await this.#maybeRegisterAztecGateway()

    const log = await this.#getAztecFilledLogByOrderId(orderId)
    if (!log) throw new Error(`Log not found for the specified order id ${orderId}`)

    const [response] = await this.azguardClient!.execute([
      {
        kind: "send_transaction",
        account: selectedAccount,
        actions: [
          {
            kind: "call",
            contract: gateway,
            method: "claim_private",
            args: [
              secret,
              Array.from(hexToBytes(orderId)),
              Array.from(hexToBytes(log.originData as Hex)),
              Array.from(hexToBytes(log.fillerData as Hex)),
            ],
          },
        ],
      },
    ])
    if (response.status === "failed") throw new Error(response.error)
    return (response as OkResult<SendTransactionResult>).result as Hex
  }

  async #claimEvmToAztecPrivateOrderDefault(orderId: Hex, secret: Hex): Promise<Hex> {
    const wallet = await this.#getAztecWallet()
    await this.#maybeRegisterAztecGateway()

    const log = await this.#getAztecFilledLogByOrderId(orderId)
    if (!log) throw new Error(`Log not found for the specified order id ${orderId}`)

    const gateway = await AztecGateway7683Contract.at(
      AztecAddress.fromString(gatewayAddresses[aztecSepolia.id]),
      wallet,
    )

    const receipt = await gateway.methods
      .claim_private(
        Fr.fromString(secret),
        Array.from(hexToBytes(orderId)),
        Array.from(hexToBytes(log.originData as Hex)),
        Array.from(hexToBytes(log.fillerData as Hex)),
      )
      .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
      .wait({
        timeout: 120000,
      })

    return receipt.txHash.toString()
  }

  async #evmToAztec(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { amountIn, amountOut, chainIn, chainOut, data, mode, recipient, tokenIn, tokenOut } = order
    const { onSecret, onOrderOpened, onOrderClaimed } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")
    const secret = isPrivate ? Fr.random() : null
    const { walletClient, address: sender } = await this.#getEvmWalletClientAndAddress(chainIn as Chain)

    const orderData = new OrderData({
      sender: padHex(sender),
      recipient: secret ? (await poseidon2Hash([secret])).toString() : padHex(recipient),
      inputToken: padHex(tokenIn),
      outputToken: padHex(tokenOut),
      amountIn,
      amountOut,
      senderNonce: nonce.toBigInt(),
      originDomain: chainIn.id,
      destinationDomain: chainOut.id,
      destinationSettler: padHex(gatewayOut),
      fillDeadline,
      orderType: isPrivate ? PRIVATE_ORDER : PUBLIC_ORDER,
      data: data || padHex("0x"),
    })

    const evmClient = createClient({
      chain: chainIn as Chain,
      transport: http(),
    })
    const evmPublicClient = createPublicClient({
      chain: chainIn as Chain,
      transport: http(),
    })

    const accountNonce = await evmPublicClient.getTransactionCount({
      address: walletClient.account!.address,
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
          orderData: orderData.encode(),
          orderDataType: ORDER_DATA_TYPE,
        },
      ],
      chain: chainIn as Chain,
      functionName: "open",
      nonce: accountNonce + 1,
    })
    const receipt = await waitForTransactionReceipt(evmClient, { hash: txHash! })

    const log = (receipt.logs as LogWithTopics[]).find(
      ({ topics }) => topics[0] === "0x3448bbc2203c608599ad448eeb1007cea04b788ac631f9f558e8dd01a3c27b3d", // Open
    )
    const orderId = Fr.fromBufferReduce(Buffer.from(log!.topics[1].slice(2), "hex")).toString()

    if (secret) onSecret?.(orderId, secret.toString())
    onOrderOpened?.(orderId, txHash)

    await this.#monitorEvmToAztecOrder(order, orderId, callbacks)

    // NOTE: if private
    if (secret) {
      const orderClaimedTxHash = await this.claimEvmToAztecPrivateOrder(orderId, secret.toString())
      onOrderClaimed?.(orderId, orderClaimedTxHash)
      return {
        orderOpenedTxHash: txHash!,
        orderClaimedTxHash,
      }
    }

    return {
      orderOpenedTxHash: txHash!,
    }
  }

  async #forwardRefundOrderToL2(details: RefundOrderDetails): Promise<Hex> {
    const { orderId, chainIn, chainOut, chainForwarder } = details
    if (!chainForwarder) throw new Error("You must specify a forwarder chain")
    const { gatewayIn } = this.#getGatewaysByChains(chainIn, chainOut)
    const rollupAddress = aztecRollupContractL1Addresses[chainForwarder.id]
    const forwarderAddress = forwarderAddresses[chainForwarder.id]
    if (!rollupAddress || forwarderAddress) throw new Error("Forwarder chain not supported")

    const message = [Buffer.from(REFUND_ORDER_TYPE.slice(2), "hex"), Buffer.from(orderId.slice(2), "hex")]
    const messageHash = sha256ToField(message)
    const l2ToL1Message = sha256ToField([
      Buffer.from(gatewayIn, "hex"),
      new Fr(AZTEC_VERSION).toBuffer(),
      EthAddress.fromString(forwarderAddress).toBuffer32(),
      new Fr(chainForwarder.id).toBuffer(),
      messageHash.toBuffer(),
    ])

    await this.#maybeRegisterAztecGateway()
    const getOrderSettlementBlockNumber = async (): Promise<bigint> => {
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
                method: "get_order_settlement_block_number",
                args: [orderId],
              },
            ],
          },
        ])
        if (response.status === "failed") throw new Error(response.error)
        return BigInt((response as OkResult<SimulateViewsResult>).result.encoded[0][0])
      }

      const wallet = await this.#getAztecWallet()
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayIn), wallet)
      return (await gateway.methods
        .get_order_settlement_block_number(Fr.fromBufferReduce(Buffer.from(orderId.slice(2), "hex")))
        .simulate()) as bigint
    }

    const orderSettlementBlockNumber = await getOrderSettlementBlockNumber()
    const provenBlockNumber = (await createPublicClient({
      chain: chainForwarder,
      transport: http(),
    }).readContract({
      address: aztecRollupContractL1Addresses[chainForwarder.id],
      args: [],
      abi: rollupAbi,
      functionName: "getProvenBlockNumber",
    })) as bigint
    if (orderSettlementBlockNumber > provenBlockNumber) {
      throw new Error(
        `cannot forward settlement to L2 for order ${orderId} because the corresponding block number ${orderSettlementBlockNumber} is > than the last proven ${provenBlockNumber}!`,
      )
    }

    const [l2ToL1MessageIndex, siblingPath] = await this.aztecPxe!.getL2ToL1MembershipWitness(
      parseInt(orderSettlementBlockNumber.toString()),
      l2ToL1Message,
    )

    const { walletClient, address } = await this.#getEvmWalletClientAndAddress(chainForwarder)
    const forwardSettleTxHash = await walletClient.writeContract({
      abi: forwarderAbi,
      account: this.evmPrivateKey ? walletClient.account! : address,
      address: forwarderAddress,
      args: [
        [[gatewayIn, AZTEC_VERSION], [forwarderAddress, chainForwarder.id], messageHash.toString()],
        bytesToHex(Buffer.concat([...message])),
        orderSettlementBlockNumber,
        l2ToL1MessageIndex,
        siblingPath.toBufferArray().map((buff) => "0x" + buff.toString("hex")),
      ],
      chain: chainForwarder,
      functionName: "forwardSettleToL2",
    })

    return forwardSettleTxHash
  }

  async #forwardRefundOrderToAztec(details: RefundOrderDetails): Promise<Hex> {
    throw new Error("Not implemented")
  }

  async #monitorAztecToEvmOrder(order: Order, receipt: TxReceipt, callbacks?: OrderCallbacks): Promise<Hex> {
    const { chainIn, chainOut } = order
    const { onOrderOpened, onOrderFilled } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const { logs } = await this.aztecNode.getPublicLogs({
      fromBlock: receipt.blockNumber! - 1,
      toBlock: receipt.blockNumber! + 1,
      contractAddress: AztecAddress.fromString(gatewayIn),
    })
    // TODO: handle multiple orders in the same tx
    const [resolvedOrder] = getParsedOpenLogs(logs)
    onOrderOpened?.(resolvedOrder.orderId, receipt.txHash.toString())

    const evmPublicClient = createPublicClient({
      chain: chainOut as Chain,
      transport: http(),
    })
    const waitForFilledOrder = async (orderId: Hex): Promise<Hex> => {
      while (true) {
        const result: any = await evmPublicClient.readContract({
          address: gatewayOut,
          abi: l2Gateway7683Abi,
          functionName: "filledOrders",
          args: [orderId],
        })
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
    onOrderFilled?.(resolvedOrder.orderId, orderFilledTxHash)
    return orderFilledTxHash
  }

  async #monitorEvmToAztecOrder(order: Order, orderId: Hex, callbacks?: OrderCallbacks) {
    if (this.azguardClient) {
      await this.#monitorEvmToAztecOrderAzguard(order, orderId, callbacks)
    } else {
      await this.#monitorEvmToAztecOrderDefault(order, orderId, callbacks)
    }
  }

  async #monitorEvmToAztecOrderAzguard(order: Order, orderId: Hex, callbacks?: OrderCallbacks): Promise<void> {
    const { chainIn, chainOut } = order
    const { onOrderFilled } = callbacks || {}
    const { gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)
    // NOTE: Azguard currently doesn't expose the actively selected account.
    // As a workaround, we default to using accounts[0], assuming it's the connected one.
    const selectedAccount = this.azguardClient!.accounts[0]

    await this.#maybeRegisterAztecGateway()

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
        onOrderFilled?.(orderId)
        return
      }
      await sleep(3000)
    }
  }

  async #monitorEvmToAztecOrderDefault(order: Order, orderId: Hex, callbacks?: OrderCallbacks): Promise<void> {
    const { chainIn, chainOut } = order
    const { onOrderFilled } = callbacks || {}
    const { gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)
    const wallet = await this.#getAztecWallet!()

    await this.#maybeRegisterAztecGateway()

    while (true) {
      const gateway = await AztecGateway7683Contract.at(AztecAddress.fromString(gatewayOut), wallet)
      const status = parseInt(await gateway.methods.get_order_status(Fr.fromString(orderId)).simulate())
      if (status === FILLED_PRIVATELY || status === FILLED) {
        onOrderFilled?.(orderId)
        return
      }
      await sleep(3000)
    }
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

  #getGatewaysByChains(
    chainIn: Order["chainIn"],
    chainOut: Order["chainOut"],
  ): {
    gatewayIn: Hex
    gatewayOut: Hex
  } {
    const gatewayIn = gatewayAddresses[chainIn.id]
    if (!gatewayIn) throw new Error("Unsupported source chain")
    const gatewayOut = gatewayAddresses[chainOut.id]
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
    const { logs } = await this.aztecNode.getPublicLogs({
      contractAddress: AztecAddress.fromString(gateway),
    })
    const parsedLogs = logs.map(({ log }) => parseFilledLog(log.fields))
    return parsedLogs.find((log) => log.orderId === orderId)
  }

  async #getAztecOpenLogByOrderId(orderId: Hex): Promise<ParsedOpenLog | undefined> {
    // TODO: understand why if i use fromBlock and toBlock i always receive the penultimante log.
    // Basically i never receive the last one even if block numbers are up to date
    const gateway = gatewayAddresses[aztecSepolia.id]
    const { logs } = await this.aztecNode.getPublicLogs({
      contractAddress: AztecAddress.fromString(gateway),
    })
    const parsedOpenLogs = getParsedOpenLogs(logs)
    return parsedOpenLogs.find((order) => order.orderId === orderId)
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
          instance: (await this.aztecNode?.getContract(AztecAddress.fromString(gateway)))!,
          artifact: AztecGateway7683ContractArtifact,
        })
      }
      this.#aztecGatewayRegistered = true
    }
  }

  async #refundAztecToEvmOrder(details: RefundOrderDetails): Promise<Hex> {
    const { orderId, chainIn, chainOut } = details

    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

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

    const txHash = await walletClient.writeContract({
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

    return txHash
  }

  async #refundEvmToAztecOrder(details: RefundOrderDetails): Promise<Hex> {
    const { orderId, chainIn, chainOut } = details
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const order: any = await createPublicClient({
      chain: chainIn as Chain,
      transport: http(),
    }).readContract({
      address: gatewayIn,
      abi: l2Gateway7683Abi,
      functionName: "openOrders",
      args: [orderId],
    })
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
              args: [Array.from(hexToBytes(orderId)), Array.from(hexToBytes(orderData))],
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
        .refund(Array.from(hexToBytes(orderId)), Array.from(hexToBytes(orderData)))
        .send({
          fee: {
            paymentMethod: await getSponsporedFeePaymentMethod(),
          },
        })
        .wait({
          timeout: 120000,
        })

      return receipt.txHash.toString()
    }
  }
}
