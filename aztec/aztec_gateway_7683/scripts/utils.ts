import { createAztecNodeClient, PXE, waitForPXE, Fr, FeePaymentMethod } from "@aztec/aztec.js"
import { createStore } from "@aztec/kv-store/lmdb"
import { createPXEService, getPXEServiceConfig } from "@aztec/pxe/server"
import { getSchnorrAccount } from "@aztec/accounts/schnorr"
import { deriveSigningKey } from "@aztec/stdlib/keys"

export const getPXEs = async (names: string[]): Promise<PXE[]> => {
  const url = process.env.PXE_URL ?? "http://localhost:8080"
  const node = createAztecNodeClient(url)

  const fullConfig = {
    ...getPXEServiceConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: false,
  }

  const svcs: PXE[] = []
  for (const name of names) {
    const store = await createStore(name, {
      dataDirectory: "store",
      dataStoreMapSizeKB: 1e6,
    })
    const pxe = await createPXEService(node, fullConfig, true, store)
    await waitForPXE(pxe)
    svcs.push(pxe)
  }
  return svcs
}

export const getWallet = async ({ paymentMethod, pxe }: { paymentMethod: FeePaymentMethod; pxe: PXE }) => {
  const secretKey = Fr.random()
  const salt = Fr.random()
  const schnorrAccount = await getSchnorrAccount(pxe, secretKey, deriveSigningKey(secretKey), salt)
  await schnorrAccount.deploy({ fee: { paymentMethod } }).wait()
  return await schnorrAccount.getWallet()
}
