import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing"
import { createAztecNodeClient, createPXEClient, AztecAddress, waitForPXE } from "@aztec/aztec.js"

import type { AztecNode, ContractInstanceWithAddress, PXE, Wallet } from "@aztec/aztec.js"

export const getAztecWallet = async (): Promise<Wallet> => {
  const pxe = await getPxe()
  const wallet = (await getDeployedTestAccountsWallets(pxe))[0]
  return wallet as Wallet
}

type RegisterContractOptions = {
  wallet: Wallet
  artifact: any
}

export const getPxe = async (): Promise<PXE> => {
  const pxe = createPXEClient(process.env.PXE_URL || "http://localhost:8080")
  await waitForPXE(pxe)
  return pxe
}

export const getAztecNode = async (): Promise<AztecNode> => {
  return await createAztecNodeClient(process.env.PXE_URL || "http://localhost:8080")
}

export const registerContract = async (
  address: AztecAddress,
  { wallet, artifact }: RegisterContractOptions,
): Promise<void> => {
  const node = await getAztecNode()
  const contractInstance = await node.getContract(address)
  await wallet.registerContract({
    instance: contractInstance as ContractInstanceWithAddress,
    artifact,
  })
}
