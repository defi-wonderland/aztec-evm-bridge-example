import { describe, it, expect } from "vitest"
import { AccountManager, AztecAddress, createAztecNodeClient, Fr, waitForPXE } from "@aztec/aztec.js"
import { createStore } from "@aztec/kv-store/lmdb"
import { getPXEServiceConfig } from "@aztec/pxe/config"
import { createPXEService } from "@aztec/pxe/server"
import { baseSepolia } from "viem/chains"
import { Hex, isHex, padHex } from "viem"
import { AzguardClient } from "@azguardwallet/client"
import { privateKeyToAddress } from "viem/accounts"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { getSchnorrAccount } from "@aztec/accounts/schnorr"
import { TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

import { Bridge, aztecSepolia, ResolvedOrder, OrderDataEncoder } from "../src"

const WETH_ON_AZTEC_SEPOLIA_ADDRESS = "0x143c799188d6881bff72012bebb100d19b51ce0c90b378bfa3ba57498b5ddeeb"
const WETH_ON_BASE_SEPOLIA_ADDRESS = "0x1BDD24840e119DC2602dCC587Dd182812427A5Cc"

const setup = async () => {
  const aztecNode = await createAztecNodeClient("https://aztec-alpha-testnet-fullnode.zkv.xyz")
  const fullConfig = {
    ...getPXEServiceConfig(),
    l1Contracts: await aztecNode.getL1ContractAddresses(),
    proverEnabled: true,
  }
  const store = await createStore("aztecPxe", {
    dataDirectory: "store",
    dataStoreMapSizeKB: 1e6,
  })
  const aztecPxe = await createPXEService(aztecNode, fullConfig, {
    store,
    useLogSuffix: true,
  })
  await waitForPXE(aztecPxe)

  let aztecAccount: AccountManager | undefined
  if (process.env.AZTEC_SECRET_KEY && process.env.AZTEC_KEY_SALT) {
    const secretKey = Fr.fromHexString(process.env.AZTEC_SECRET_KEY)
    const salt = Fr.fromHexString(process.env.AZTEC_KEY_SALT)
    const signingKey = deriveSigningKey(secretKey)
    aztecAccount = await getSchnorrAccount(aztecPxe, secretKey, signingKey, salt)
  }

  return {
    aztecAccount,
    aztecPxe,
    aztecNode,
  }
}

/**
 * ⚠️ IMPORTANT:
 * Be sure to use accounts that own WETH on both Base Sepolia and Aztec Sepolia
 * and that a filler is up and running.
 *
 * If your account doesn't have WETH on Aztec Sepolia, you can:
 * - Use our bridge: https://aztec-evm-bridge.substancelabs.xyz/
 * - Or use the integrated faucet within the bridge interface.
 */
describe("Bridge", () => {
  describe("Initialization", () => {
    it("cannot initialize bridge without aztecSecretKey and aztecKeySalt or azguardClient", async () => {
      const createBridge = () =>
        new Bridge({
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify aztecSecretKey and aztecKeySalt or azguardClient")
    })

    it("cannot specify evmPrivateKey and evmProvider", async () => {
      const createBridge = () =>
        new Bridge({
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
          evmProvider: {},
        })
      expect(createBridge).to.throw("Cannot specify both evmPrivateKey and evmProvider")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt, aztecPxe, aztecNode and azguardClient", async () => {
      const { aztecPxe } = await setup()
      const createBridge = () =>
        new Bridge({
          evmPrivateKey: process.env.EVM_PK as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecPxe,
          azguardClient: {} as AzguardClient,
        })
      expect(createBridge).to.throw("Cannot specify both aztecSecretKey, aztecKeySalt, aztecPxe and azguardClient")
    })

    it("cannot initialize bridge using aztecSecretKey and aztecNode without aztecKeySalt", async () => {
      const createBridge = () =>
        new Bridge({
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify both aztecSecretKey and aztecKeySalt")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt and aztecNode without aztecKeyPxe", async () => {
      const createBridge = () =>
        new Bridge({
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify the aztecPxe when using aztecSecretKey and aztecKeySalt")
    })
  })

  describe("Aztec -> Base", () => {
    it("should create a public order from Aztec to Base", async () => {
      const { aztecPxe, aztecNode } = await setup()

      await aztecPxe.registerContract({
        instance: (await aztecNode.getContract(AztecAddress.fromString(WETH_ON_AZTEC_SEPOLIA_ADDRESS)))!,
        artifact: TokenContractArtifact,
      })

      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })
      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: aztecSepolia.id,
          chainIdOut: baseSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
          mode: "public",
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
    })

    it("should be able to open a private order from Aztec to Base", async () => {
      const { aztecPxe } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })
      const result = await bridge.openOrder(
        {
          chainIdIn: aztecSepolia.id,
          chainIdOut: baseSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
          mode: "private", // or public,
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderOpened: (txHash) => expect(isHex(txHash)).toBe(true),
          onOrderFilled: (txHash) => expect(isHex(txHash)).toBe(true),
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
    })

    it("should be able to open a private order from Aztec to Base and then ask for a refund", async () => {
      const { aztecPxe } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })
      const openOrder = (): Promise<Hex> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: aztecSepolia.id,
              chainIdOut: baseSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
              mode: "private", // or public,
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
              fillDeadline: 10,
            },
            {
              onOrderOpened: ({ orderId }) => resolve(orderId),
            },
          )
        })
      const orderId = await openOrder()
      const txHash = await bridge.refundOrder({
        orderId,
        chainIdIn: aztecSepolia.id,
        chainIdOut: baseSepolia.id,
      })
      expect(isHex(txHash)).toBe(true)
    })

    it("should be able to open a private order from Aztec to Base and fill it", async () => {
      const { aztecPxe } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })
      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: aztecSepolia.id,
              chainIdOut: baseSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })
  })

  describe("Base -> Aztec", () => {
    it("should be able to open a private order from Base to Aztec", async () => {
      const { aztecPxe, aztecNode, aztecAccount } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })

      await aztecPxe.registerContract({
        instance: (await aztecNode.getContract(AztecAddress.fromString(WETH_ON_AZTEC_SEPOLIA_ADDRESS)))!,
        artifact: TokenContractArtifact,
      })

      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      let onSecretCalled = false
      let onOrderClaimedCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: baseSepolia.id,
          chainIdOut: aztecSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          mode: "private",
          data: padHex("0x"),
          recipient: aztecAccount!.getAddress().toString(),
        },
        {
          onSecret: () => {
            onSecretCalled = true
          },
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
          onOrderClaimed: () => {
            onOrderClaimedCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderClaimedTxHash)).toBe(true)
      expect(onSecretCalled).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
      expect(onOrderClaimedCalled).toBe(true)
    })

    it("should be able to open a public order from Base to Aztec", async () => {
      const { aztecPxe, aztecAccount } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })

      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: baseSepolia.id,
          chainIdOut: aztecSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          mode: "public",
          data: padHex("0x"),
          recipient: aztecAccount!.getAddress().toString(),
        },
        {
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
    })

    it("should be able to open a private order from Base to Aztec and then ask for a refund", async () => {
      const { aztecPxe, aztecNode } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })

      await aztecPxe.registerContract({
        instance: (await aztecNode.getContract(AztecAddress.fromString(WETH_ON_AZTEC_SEPOLIA_ADDRESS)))!,
        artifact: TokenContractArtifact,
      })

      const openOrder = (): Promise<Hex> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "private", // or public,
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
              fillDeadline: 10,
            },
            {
              onOrderOpened: ({ orderId }) => resolve(orderId),
            },
          )
        })
      const orderId = await openOrder()
      const txHash = await bridge.refundOrder({
        orderId,
        chainIdIn: baseSepolia.id,
        chainIdOut: aztecSepolia.id,
      })
      expect(isHex(txHash)).toBe(true)
    })

    it("should be able to open a private order from Base to Aztec and then fill it", async () => {
      const { aztecPxe, aztecNode } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })

      await aztecPxe.registerContract({
        instance: (await aztecNode.getContract(AztecAddress.fromString(WETH_ON_AZTEC_SEPOLIA_ADDRESS)))!,
        artifact: TokenContractArtifact,
      })

      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })

    it("should be able to open a private order from Base to Aztec and then fill it", async () => {
      const { aztecPxe, aztecNode } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe,
      })

      await aztecPxe.registerContract({
        instance: (await aztecNode.getContract(AztecAddress.fromString(WETH_ON_AZTEC_SEPOLIA_ADDRESS)))!,
        artifact: TokenContractArtifact,
      })

      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "public",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })
  })
})
