import { createClient, createWalletClient, http, publicActions, walletActions } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import type {
  Chain,
  WalletClient,
  PublicClient,
  Client as Client_Base,
  Transport,
  EIP1474Methods,
  WalletActions,
  PublicActions,
  Account,
} from "viem"

export type Client = Client_Base<Transport, Chain, Account, EIP1474Methods, WalletActions & PublicActions>

type ContructorConfigs = {
  chains: Chain[]
  privateKey: `0x${string}`
  rpcUrls: { [chainName: string]: string }
}

class MultiClient {
  private clients: { [chainName: string]: Client }

  constructor({ chains, privateKey, rpcUrls }: ContructorConfigs) {
    this.clients = chains.reduce((acc: { [chainName: string]: any }, chain: Chain) => {
      const rpcUrl = rpcUrls[chain.id] as string
      acc[chain.id] = createClient({
        key: rpcUrl,
        account: privateKeyToAccount(privateKey),
        chain,
        transport: http(rpcUrl),
      })
        .extend(publicActions)
        .extend(walletActions)
      return acc
    }, {})
  }

  getClientByChain(chain: Chain): Client {
    const client = this.clients[chain.id]
    if (!client) throw new Error("Client not found")
    return client
  }
}

export default MultiClient
