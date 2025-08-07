import { describe, it, expect } from "vitest"
import { createAztecNodeClient, waitForPXE } from "@aztec/aztec.js"
import { createStore } from "@aztec/kv-store/lmdb"
import { getPXEServiceConfig } from "@aztec/pxe/config"
import { createPXEService } from "@aztec/pxe/server"
import { baseSepolia } from "viem/chains"
import { Chain, Hex, isHex, padHex } from "viem"
import { AzguardClient } from "@azguardwallet/client"
import { privateKeyToAddress } from "viem/accounts"

import { Bridge } from "../src"
import { aztecSepolia } from "../src/constants"

const setup = async () => {
  const node = await createAztecNodeClient("https://aztec-alpha-testnet-fullnode.zkv.xyz")
  const fullConfig = {
    ...getPXEServiceConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: true,
  }
  const store = await createStore("pxe", {
    dataDirectory: "store",
    dataStoreMapSizeKB: 1e6,
  })
  const pxe = await createPXEService(node, fullConfig, {
    store,
    useLogSuffix: true,
  })
  await waitForPXE(pxe)

  return {
    pxe,
    node,
  }
}

describe("Bridge", () => {
  /*describe("initialization", () => {
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
      const { pxe, node } = await setup()
      const createBridge = () =>
        new Bridge({
          evmPrivateKey: process.env.EVM_PK as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecPxe: pxe,
          aztecNode: node,
          azguardClient: {} as AzguardClient,
        })
      expect(createBridge).to.throw("Cannot specify both aztecSecretKey, aztecKeySalt, pxe and azguardClient")
    })

    it("cannot initialize bridge using aztecSecretKey and aztecNode without aztecKeySalt", async () => {
      const { node } = await setup()
      const createBridge = () =>
        new Bridge({
          aztecNode: node,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify both aztecSecretKey and aztecKeySalt")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt and aztecNode without aztecKeyPxe", async () => {
      const { node } = await setup()
      const createBridge = () =>
        new Bridge({
          aztecNode: node,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify the aztecPxe when using aztecSecretKey and aztecKeySalt")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt and aztecKeyPxe without aztecNode", async () => {
      const { pxe } = await setup()
      const createBridge = () =>
        new Bridge({
          aztecPxe: pxe,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify the aztecNode when using aztecSecretKey and aztecKeySalt")
    })
  })*/

  describe("aztec -> Base", () => {
    it("should create a public order from Aztec to Base", async () => {
      const { pxe, node } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe: pxe,
        aztecNode: node,
      })
      const result = await bridge.createOrder(
        {
          chainIn: aztecSepolia as Chain,
          chainOut: baseSepolia,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: "0x143c799188d6881bff72012bebb100d19b51ce0c90b378bfa3ba57498b5ddeeb", // WETH on Aztec Sepolia
          tokenOut: "0x1BDD24840e119DC2602dCC587Dd182812427A5Cc", // WETH on Base Sepolia
          mode: "public",
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderCreated: (txHash) => expect(isHex(txHash)).toBe(true),
          onOrderFilled: (txHash) => expect(isHex(txHash)).toBe(true),
        },
      )
      expect(isHex(result.orderCreatedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
    })

    /*it("should create a private order from Aztec to Base", async () => {
      const { pxe, node } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecPxe: pxe,
        aztecNode: node,
      })
      const result = await bridge.createOrder(
        {
          chainIn: aztecSepolia as Chain,
          chainOut: baseSepolia,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: "0x143c799188d6881bff72012bebb100d19b51ce0c90b378bfa3ba57498b5ddeeb", // WETH on Aztec Sepolia
          tokenOut: "0x1BDD24840e119DC2602dCC587Dd182812427A5Cc", // WETH on Base Sepolia
          mode: "private", // or public,
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderCreated: (txHash) => expect(isHex(txHash)).toBe(true),
          onOrderFilled: (txHash) => expect(isHex(txHash)).toBe(true),
        },
      )
      expect(isHex(result.orderCreatedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
    })*/
  })
})
