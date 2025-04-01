import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing"
import { Wallet, createAztecNodeClient, createPXEClient, AztecAddress } from "@aztec/aztec.js"

export const getAztecWallet = async (): Promise<Wallet> => {
  const PXE_URL = process.env.PXE_URL || "http://localhost:8080"
  const pxe = createPXEClient(PXE_URL)
  const wallet = (await getDeployedTestAccountsWallets(pxe))[0]
  return wallet
}

type RegisterContractOptions = {
  wallet: Wallet
  artifact: any
}

export const registerContract = async (
  address: AztecAddress,
  { wallet, artifact }: RegisterContractOptions,
): Promise<void> => {
  const node = await createAztecNodeClient(process.env.PXE_URL || "http://localhost:8080")
  const contractInstance = await node.getContract(address)
  await wallet.registerContract({
    instance: contractInstance,
    artifact,
  })
}
