import { AztecGateway7683Contract } from "../src/artifacts/AztecGateway7683.js"
import {
  AccountWallet,
  createLogger,
  PXE,
  waitForPXE,
  createPXEClient,
  Logger,
  EthAddress,
  deriveKeys,
  Fr,
} from "@aztec/aztec.js"
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing"
import { computePartialAddress } from "@aztec/stdlib/contract"

const setupSandbox = async () => {
  const { PXE_URL = "http://localhost:8080" } = process.env
  const pxe = await createPXEClient(PXE_URL)
  await waitForPXE(pxe)
  return pxe
}

const PORTAL_ADDRESS = EthAddress.ZERO // TODO

const main = async () => {
  let pxe: PXE
  let wallets: AccountWallet[] = []
  let logger: Logger

  logger = createLogger("aztec:aztec-starter")

  pxe = await setupSandbox()
  wallets = await getInitialTestAccountsWallets(pxe)

  const gatewaySecretKey = Fr.random()
  const gatewayPublicKeys = (await deriveKeys(gatewaySecretKey)).publicKeys
  const gatewayDeployment = AztecGateway7683Contract.deployWithPublicKeys(gatewayPublicKeys, wallets[0], PORTAL_ADDRESS)
  const gatewayInstance = await gatewayDeployment.getInstance()
  await pxe.registerAccount(gatewaySecretKey, await computePartialAddress(gatewayInstance))
  const gateway = await gatewayDeployment.send().deployed()
  logger.info(`AztecGateway7683 Contract deployed at: ${gateway.address}`)
}

main()
