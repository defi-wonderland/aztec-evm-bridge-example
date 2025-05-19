import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing"
import {
  AccountWalletWithSecretKey,
  AztecAddress,
  createAztecNodeClient,
  createPXEClient,
  type PXE,
} from "@aztec/aztec.js"
import { TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

import { AztecGateway7683ContractArtifact } from "./artifacts/AztecGateway7683/AztecGateway7683"
import { AZTEC_7683_CHAIN_ID } from "../settings/constants"
import settings from "../settings"

const PXE_URL = "http://localhost:8080"

export interface RegisterContractParams {
  wallet: AccountWalletWithSecretKey
  artifact: any
}

export const registerAztecContracts = async () => {
  console.log("registering aztec contracts ...")
  const wallet = await getAztecWallet()
  const pxe = await getPxe()
  await Promise.all([
    ...settings.assets.map(({ sourceAddress }) => {
      return registerContract(AztecAddress.fromString(sourceAddress), {
        wallet,
        artifact: TokenContractArtifact,
      })
    }),
    registerContract(AztecAddress.fromString(settings.contractAddresses[AZTEC_7683_CHAIN_ID].gateway), {
      wallet,
      artifact: AztecGateway7683ContractArtifact,
    }),
    pxe.registerSender(AztecAddress.fromString(settings.contractAddresses[AZTEC_7683_CHAIN_ID].gateway))
  ])
}

export const registerContract = async (address: AztecAddress, { wallet, artifact }: RegisterContractParams) => {
  const node = await createAztecNodeClient(PXE_URL)
  const contractInstance = await node.getContract(address)
  await wallet.registerContract({
    instance: contractInstance!,
    artifact,
  })
}

export const getPxe = (): PXE => {
  return createPXEClient(PXE_URL)
}

export const getAztecWallet = async (): Promise<AccountWalletWithSecretKey> => {
  const pxe = createPXEClient(PXE_URL)
  const wallet = (await getDeployedTestAccountsWallets(pxe))[0]
  if (!wallet) throw new Error("Failed to get deployed test account wallets")
  return wallet
}

export type ParsedFilledLog = {
  orderId: `0x${string}`
  fillerData: `0x${string}`
  originData: `0x${string}`
}
export const parseFilledLog = (log: any): ParsedFilledLog => {
  let orderId = log[0].toString()
  let fillerData = log[11].toString()
  const residualBytes = log[12].toString()
  const originData = ("0x" +
    log[1].toString().slice(4) +
    residualBytes.slice(6, 8) +
    log[2].toString().slice(4) +
    residualBytes.slice(8, 10) +
    log[3].toString().slice(4) +
    residualBytes.slice(10, 12) +
    log[4].toString().slice(4) +
    residualBytes.slice(12, 14) +
    log[5].toString().slice(4) +
    residualBytes.slice(14, 16) +
    log[6].toString().slice(4) +
    residualBytes.slice(16, 18) +
    log[7].toString().slice(4) +
    residualBytes.slice(18, 20) +
    log[8].toString().slice(4) +
    residualBytes.slice(20, 22) +
    log[9].toString().slice(4) +
    residualBytes.slice(22, 24) +
    log[10].toString().slice(4, 30)) as `0x${string}`

  orderId = "0x" + orderId.slice(4) + residualBytes.slice(4, 6)
  fillerData = "0x" + fillerData.slice(4) + residualBytes.slice(24, 26)

  return {
    orderId,
    fillerData,
    originData,
  }
}
