import {
  AccountWallet,
  createLogger,
  Fr,
  PXE,
  waitForPXE,
  createPXEClient,
  Logger,
  EthAddress,
} from "@aztec/aztec.js"
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing"
import { spawn } from "child_process"
import { SponsoredFeePaymentMethod } from "./utils/sponsored_fee_payment_method.js"
import { L1FeeJuicePortalManager } from "@aztec/aztec.js"
import { createEthereumChain, createL1Clients } from "@aztec/ethereum"
import { encodePacked, hexToBytes, sha256 } from "viem"

import {  AztecGateway7683Contract } from "../../artifacts/AztecGateway7683.js"
import { TokenContract } from "../../artifacts/Token.js"

const setupSandbox = async () => {
  const { PXE_URL = "http://localhost:8080" } = process.env
  const pxe = createPXEClient(PXE_URL)
  await waitForPXE(pxe)
  return pxe
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("AztecGateway7683", () => {
  let pxe: PXE
  let wallets: AccountWallet[] = []
  let logger: Logger
  let sandboxInstance
  let sponsoredPaymentMethod: SponsoredFeePaymentMethod
  let l1PortalManager: L1FeeJuicePortalManager
  let skipSandbox: boolean

  beforeAll(async () => {
    skipSandbox = process.env.SKIP_SANDBOX === "true"
    /*if (!skipSandbox) {
      sandboxInstance = spawn("aztec", ["start", "--sandbox"], {
        detached: true,
        stdio: "ignore",
      })
      await sleep(15000)
    }*/

    logger = createLogger("aztec:aztec-starter:voting")
    logger.info("Aztec-Starter tests running.")

    pxe = await setupSandbox()

    wallets = await getInitialTestAccountsWallets(pxe)
    sponsoredPaymentMethod = await SponsoredFeePaymentMethod.new(pxe)

    const nodeInfo = await pxe.getNodeInfo()
    const chain = createEthereumChain(["http://localhost:8545"], nodeInfo.l1ChainId)
    const DefaultMnemonic = "test test test test test test test test test test test junk"
    const { publicClient, walletClient } = createL1Clients(chain.rpcUrls, DefaultMnemonic, chain.chainInfo)
    l1PortalManager = await L1FeeJuicePortalManager.new(pxe, publicClient, walletClient, logger)
  })

  afterAll(async () => {
    if (!skipSandbox) {
      sandboxInstance!.kill("SIGINT")
    }
  })

  it("should fill a public intent and send the settlement message to the forwarder via portal", async () => {
    const [admin, filler, recipient] = wallets

    const gateway = await AztecGateway7683Contract.deploy(admin, EthAddress.ZERO).send().deployed()
    const token = await TokenContract.deploy(
      admin,
      admin.getAddress(),
      "TestToken0000000000000000000000",
      "TT00000000000000000000000000000",
      18,
    )
      .send()
      .deployed()
    await token.withWallet(admin).methods.mint_to_public(filler.getAddress(), 1000000000n).send().wait()

    const amount = 100n
    const nonce = new Fr(0)
    
    const originData = encodePacked(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint32",
        "uint32",
        "bytes32",
        "uint32",
      ],
      [
        "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90",
        recipient.getAddress().toString(),
        "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90",
        token.address.toString(),
        1n,
        amount,
        0n, // nonce
        1,
        999999,
        "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90",
        2 ** 32 - 1,
      ],
    )

    const orderId = sha256(originData)
    const fillerData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // keep it 0 for now

    await (
      await filler.setPublicAuthWit(
        {
          caller: gateway.address,
          action: token
            .withWallet(filler)
            .methods.transfer_in_public(filler.getAddress(), recipient.getAddress(), amount, nonce),
        },
        true,
      )
    )
      .send()
      .wait()

    await gateway
      .withWallet(filler)
      .methods.fill(Array.from(hexToBytes(orderId)), Array.from(hexToBytes(originData)), fillerData)
      .send()
      .wait()
  })
})
