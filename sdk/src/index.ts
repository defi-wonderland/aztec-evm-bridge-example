import {
  AbiEvent,
  Chain,
  createClient,
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  Hex,
  hexToBytes,
  http,
  padHex,
} from "viem"
import { AztecAddress, Fr, PXE, AztecNode, TxHash, sleep, TxReceipt } from "@aztec/aztec.js"
import { AzguardClient } from "@azguardwallet/client"
import { OkResult, SendTransactionResult } from "@azguardwallet/types"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { getSchnorrAccount, SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"
import { poseidon2Hash } from "@aztec/foundation/crypto"
import { waitForTransactionReceipt } from "viem/actions"
import { privateKeyToAccount } from "viem/accounts"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"

import { OrderData, getAztecAddressFromAzguardAccount } from "./utils"
import {
  aztecSepolia,
  gatewayAddresses,
  ORDER_DATA_TYPE,
  PRIVATE_ORDER,
  PRIVATE_ORDER_WITH_HOOK,
  PRIVATE_SENDER,
  PUBLIC_ORDER,
  PUBLIC_ORDER_WITH_HOOK,
} from "./constants"
import {
  AztecGateway7683Contract,
  AztecGateway7683ContractArtifact,
} from "./utils/artifacts/AztecGateway7683/AztecGateway7683"
import l2Gateway7683Abi from "./utils/abi/l2Gateway7683"
import { getSponsoredFPCInstance, getSponsporedFeePaymentMethod } from "./utils/fpc"
import { getResolvedOrdersByLogs } from "./utils/gateway"

type SwapMode = "private" | "public" | "privateWithHook" | "publicWithHook"

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

interface OrderResult {
  orderCreatedTxHash: Hex
  orderFilledTxHash: Hex
}

interface OrderCallbacks {
  onSecret?: (secret: Hex) => void
  onOrderCreated?: (txHash: Hex) => void
  onOrderFilled?: (txHash: Hex) => void
}

interface BridgeConfigs {
  azguardClient?: AzguardClient
  aztecNode?: AztecNode
  aztecPxe?: PXE
  aztecKeySalt?: Hex
  aztecSecretKey?: Hex
  evmPrivateKey?: Hex
  evmProvider?: any
}

export class Bridge {
  #azguardClient?: AzguardClient
  #aztecNode?: AztecNode
  #aztecPxe?: PXE
  #aztecKeySalt?: Hex
  #aztecSecretKey?: Hex
  #evmPrivateKey?: Hex
  #evmProvider?: any
  #walletAccountRegistered = false

  constructor(configs: BridgeConfigs) {
    const { azguardClient, aztecNode, aztecPxe, aztecKeySalt, aztecSecretKey, evmPrivateKey, evmProvider } = configs

    if (!aztecSecretKey && !aztecKeySalt && !azguardClient) {
      throw new Error("You must specify aztecSecretKey and aztecKeySalt or azguardClient")
    }

    if (evmPrivateKey && evmProvider) {
      throw new Error("Cannot specify both evmPrivateKey and evmProvider")
    }

    if (azguardClient && aztecSecretKey && aztecKeySalt && aztecPxe) {
      throw new Error("Cannot specify both aztecSecretKey, aztecKeySalt, pxe and azguardClient")
    }

    if ((aztecSecretKey && !aztecKeySalt) || (!aztecSecretKey && aztecKeySalt)) {
      throw new Error("You must specify both aztecSecretKey and aztecKeySalt")
    }

    if (aztecSecretKey && aztecKeySalt && !aztecPxe) {
      throw new Error("You must specify the aztecPxe when using aztecSecretKey and aztecKeySalt")
    }

    if (aztecSecretKey && aztecKeySalt && !aztecNode) {
      throw new Error("You must specify the aztecNode when using aztecSecretKey and aztecKeySalt")
    }

    this.#azguardClient = azguardClient
    this.#aztecNode = aztecNode
    this.#aztecPxe = aztecPxe
    this.#aztecKeySalt = aztecKeySalt
    this.#aztecSecretKey = aztecSecretKey
    this.#evmPrivateKey = evmPrivateKey
    this.#evmProvider = evmProvider
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

  async #aztecToEvm(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    if (this.#azguardClient) return this.#aztecToEvmAzguard(order, callbacks)
    return this.#aztecToEvmDefault(order, callbacks)
  }

  async #aztecToEvmAzguard(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = order
    const { onOrderCreated } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    // NOTE: Azguard currently doesn't expose the actively selected account.
    // As a workaround, we default to using accounts[0], assuming it's the connected one.
    const selectedAccount = this.#azguardClient!.accounts[0]
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

    const response = await this.#azguardClient!.execute([
      {
        kind: "register_contract",
        chain: "aztec:11155111",
        address: gatewayIn,
        artifact: AztecGateway7683ContractArtifact,
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
                fill_deadline: orderData.fillDeadline,
                order_data: Array.from(hexToBytes(orderData.encode())),
                order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
              },
            ],
          },
        ],
      },
    ])
    for (const res of response) {
      if (res.status === "failed") {
        throw new Error(res.error)
      }
    }
    const orderCreatedTxHash = (response[1] as OkResult<SendTransactionResult>).result as Hex

    const waitForReceipt = async (txHash: string): Promise<TxReceipt> => {
      while (true) {
        const receipt = await this.#aztecNode!.getTxReceipt(TxHash.fromString(txHash))
        if (receipt.status === "success") return receipt
        if (receipt.status === "pending") {
          await sleep(5000)
          continue
        }
        throw new Error("Aztec transaction failed")
      }
    }
    const orderCreatedReceipt = await waitForReceipt(orderCreatedTxHash)
    onOrderCreated?.(orderCreatedTxHash)

    const orderFilledTxHash = await this.#monitorAztecToEvmOrder(order, orderCreatedReceipt, callbacks)
    return {
      orderCreatedTxHash,
      orderFilledTxHash,
    }
  }

  async #aztecToEvmDefault(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = order
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)
    const wallet = await this.#getAztecWallet()

    await this.#aztecPxe?.registerContract({
      instance: (await this.#aztecNode!.getContract(AztecAddress.fromString(gatewayIn)))!,
      artifact: AztecGateway7683ContractArtifact,
    })
    await this.#aztecPxe?.registerContract({
      instance: (await this.#aztecNode!.getContract(AztecAddress.fromString(tokenIn)))!,
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
      orderCreatedTxHash: receipt.txHash.toString(),
      orderFilledTxHash,
    }
  }

  async #evmToAztec(order: Order, callbacks?: OrderCallbacks): Promise<OrderResult> {
    const { amountIn, amountOut, chainIn, chainOut, data, mode, recipient, tokenIn, tokenOut } = order
    const { onSecret } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = order.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")
    const secret = isPrivate ? Fr.random() : null
    if (secret) onSecret?.(secret.toString())

    const walletClient = this.#getEvmWalletClient(chainIn as Chain)

    let sender
    if (walletClient.account) {
      // privateKeyToAccount
      sender = walletClient.account.address
    } else {
      // window.ethereum
      ;[sender] = await walletClient.getAddresses()
    }

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

    const evmPublicClient = createClient({
      chain: chainIn as Chain,
      transport: http(),
    })
    let txHash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: chainIn as Chain,
      address: tokenIn,
      functionName: "approve",
      args: [gatewayIn, amountIn],
      abi: erc20Abi,
    })
    await waitForTransactionReceipt(evmPublicClient, { hash: txHash })
    txHash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: chainIn as Chain,
      address: gatewayIn,
      functionName: "open",
      args: [
        {
          fillDeadline,
          orderDataType: ORDER_DATA_TYPE,
          orderData: orderData.encode(),
        },
      ],
      abi: l2Gateway7683Abi,
    })

    return {
      orderCreatedTxHash: txHash,
      orderFilledTxHash: "0xtodo",
    }
  }

  async #monitorAztecToEvmOrder(order: Order, receipt: TxReceipt, callbacks?: OrderCallbacks): Promise<Hex> {
    const { chainIn, chainOut } = order
    const { onOrderFilled } = callbacks || {}
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const { logs } = await this.#aztecNode!.getPublicLogs({
      fromBlock: receipt.blockNumber! - 1,
      toBlock: receipt.blockNumber! + 1,
      contractAddress: AztecAddress.fromString(gatewayIn),
    })
    // TODO: handle multiple orders in the same tx
    const [resolvedOrder] = getResolvedOrdersByLogs(logs)

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
    onOrderFilled?.(orderFilledTxHash)
    return orderFilledTxHash
  }

  async #monitorEvmToAztecOrder(order: Order, receipt: TxReceipt, callbacks?: OrderCallbacks): Promise<Hex> {
    return "0x"
  }

  async #getAztecWallet() {
    const secretKey = Fr.fromHexString(this.#aztecSecretKey!)
    const salt = Fr.fromHexString(this.#aztecKeySalt!)
    const signingKey = deriveSigningKey(secretKey)
    const account = await getSchnorrAccount(this.#aztecPxe!, secretKey, signingKey, salt)
    if (!this.#walletAccountRegistered) {
      await this.#aztecPxe?.registerAccount(secretKey, (await account.getCompleteAddress()).partialAddress)
      await this.#aztecPxe?.registerContract({
        instance: account.getInstance(),
        artifact: SchnorrAccountContractArtifact,
      })
      await this.#aztecPxe?.registerContract({
        instance: await getSponsoredFPCInstance(),
        artifact: SponsoredFPCContractArtifact,
      })
      this.#walletAccountRegistered = true
    }

    return await account.getWallet()
  }

  #getEvmWalletClient(chain: Chain) {
    return this.#evmProvider
      ? createWalletClient({
          chain,
          transport: custom(this.#evmProvider),
        })
      : createWalletClient({
          chain,
          account: privateKeyToAccount(this.#evmPrivateKey!),
          transport: http(),
        })
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
}
