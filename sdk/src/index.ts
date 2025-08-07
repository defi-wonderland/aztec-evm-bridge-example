import { Chain, createClient, createWalletClient, custom, erc20Abi, Hex, hexToBytes, http, padHex } from "viem"
import { AztecAddress, Fr, PXE, AztecNode } from "@aztec/aztec.js"
import { AzguardClient } from "@azguardwallet/client"
import { OkResult, SendTransactionResult } from "@azguardwallet/types"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { getSchnorrAccount, SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"
import { poseidon2Hash } from "@aztec/foundation/crypto"
import { waitForTransactionReceipt } from "viem/actions"
import { privateKeyToAccount } from "viem/accounts"

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
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"

type SwapMode = "private" | "public" | "privateWithHook" | "publicWithHook"

interface SwapOptions {
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
  onSecret?: (secret: Hex) => void
}

interface AztecEvmConfigs {
  azguardClient?: AzguardClient
  aztecNode?: AztecNode
  aztecPxe?: PXE
  aztecSalt?: Hex
  aztecSecretKey?: Hex
  evmPrivateKey?: Hex
  evmProvider?: any
}

export class AztecEvmSwapper {
  #azguardClient?: AzguardClient
  #aztecNode?: AztecNode
  #aztecPxe?: PXE
  #aztecSalt?: Hex
  #aztecSecretKey?: Hex
  #evmPrivateKey?: Hex
  #evmProvider?: any
  #walletAccountRegistered = false

  constructor(configs: AztecEvmConfigs) {
    const { azguardClient, aztecNode, aztecPxe, aztecSalt, aztecSecretKey, evmPrivateKey, evmProvider } = configs

    if (evmPrivateKey && evmProvider) {
      throw new Error("Cannot specify both private key and provider")
    }

    if (azguardClient && aztecSecretKey && aztecSalt && aztecPxe) {
      throw new Error("Cannot specify both private key, salt, pxe and Azguard client")
    }

    if ((aztecSecretKey && !aztecSalt) || (!aztecSecretKey && aztecSalt)) {
      throw new Error("You must specify both private key and salt for Aztec")
    }

    if (aztecSecretKey && aztecSalt && !aztecPxe) {
      throw new Error("You must specify the pxe when using aztecSecretKey and aztecSalt")
    }

    if (aztecSecretKey && aztecSalt && !aztecNode) {
      throw new Error("You must specify the Aztec node when using aztecSecretKey and aztecSalt")
    }

    if (azguardClient && aztecPxe) {
      throw new Error("Cannot specify both pxe and Azguard client")
    }

    this.#azguardClient = azguardClient
    this.#aztecNode = aztecNode
    this.#aztecPxe = aztecPxe
    this.#aztecSalt = aztecSalt
    this.#aztecSecretKey = aztecSecretKey
    this.#evmPrivateKey = evmPrivateKey
    this.#evmProvider = evmProvider
  }

  async swap(options: SwapOptions): Promise<Hex> {
    const { chainIn, chainOut, mode, data } = options

    if (chainIn.id === chainOut.id) throw new Error("Invalid chains: source and destination must differ")

    const validModes = ["private", "public", "privateWithHook", "publicWithHook"]
    if (!validModes.includes(mode)) throw new Error(`Invalid mode: ${mode}`)

    if (data.length !== 66) throw new Error("Invalid data: must be 32 bytes")

    if (chainIn.id === aztecSepolia.id) {
      return this.#aztecToEvm(options)
    } else if (chainOut.id === aztecSepolia.id) {
      return this.#evmToAztec(options)
    } else {
      throw new Error("Neither chain is Aztec")
    }
  }

  async #aztecToEvm(options: SwapOptions): Promise<Hex> {
    if (this.#azguardClient) return this.#aztecToEvmAzguard(options)
    return this.#aztecToEvmDefault(options)
  }

  async #aztecToEvmAzguard(options: SwapOptions): Promise<Hex> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = options
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = options.fillDeadline ?? 2 ** 32 - 1
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

    const txHash = (response[1] as OkResult<SendTransactionResult>).result
    return txHash as Hex
  }

  async #aztecToEvmDefault(options: SwapOptions): Promise<Hex> {
    const { chainOut, mode, data, amountIn, amountOut, tokenIn, tokenOut, chainIn, recipient } = options
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

    const fillDeadline = options.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")

    const orderData = new OrderData({
      sender: isPrivate ? PRIVATE_SENDER : padHex(wallet.getAddress().toString()),
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
    const witness = await wallet.createAuthWit({
      caller: AztecAddress.fromString(gatewayIn),
      action: token.methods.transfer_to_public(
        wallet.getAddress(),
        AztecAddress.fromString(gatewayIn),
        amountIn,
        nonce,
      ),
    })

    const receipt = await gateway.methods
      .open_private({
        fill_deadline: fillDeadline,
        order_data: Array.from(hexToBytes(orderData.encode())),
        order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
      })
      .with({
        authWitnesses: [witness],
      })
      .send({ fee: { paymentMethod: await getSponsporedFeePaymentMethod() } })
      .wait()

    return receipt.txHash.toString()
  }

  async #evmToAztec(options: SwapOptions): Promise<Hex> {
    const { amountIn, amountOut, chainIn, chainOut, data, mode, onSecret, recipient, tokenIn, tokenOut } = options
    const { gatewayIn, gatewayOut } = this.#getGatewaysByChains(chainIn, chainOut)

    const fillDeadline = options.fillDeadline ?? 2 ** 32 - 1
    const nonce = Fr.random()
    const isPrivate = mode.includes("private")
    const secret = isPrivate ? Fr.random() : null
    if (secret && onSecret) onSecret(secret.toString())

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

    return txHash
  }

  async #getAztecWallet() {
    const secretKey = Fr.fromHexString(this.#aztecSecretKey!)
    const salt = Fr.fromHexString(this.#aztecSalt!)
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

  #getOrderType(mode: SwapOptions["mode"]): number {
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
    chainIn: SwapOptions["chainIn"],
    chainOut: SwapOptions["chainOut"],
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
