import { createWalletClient, http, publicActions } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import type { Chain, WalletClient, PublicClient } from "viem"

type ContructorConfigs = {
  chains: Chain[]
  privateKey: `0x${string}`
  rpcUrls: { [chainName: string]: string }
}

class MultiClient {
  private clients: { [chainName: string]: PublicClient & WalletClient }

  constructor({ chains, privateKey, rpcUrls }: ContructorConfigs) {
    this.clients = chains.reduce((acc: { [chainName: string]: any }, chain: Chain) => {
      const rpcUrl = rpcUrls[chain.id] as string
      acc[chain.id] = createWalletClient({
        account: privateKeyToAccount(privateKey),
        chain,
        transport: http(rpcUrl),
      }).extend(publicActions)
      return acc
    }, {})
  }

  getClientByChain(chain: Chain): PublicClient & WalletClient {
    const client = this.clients[chain.id]
    if (!client) throw new Error("Client not found")
    return client
  }
}

export default MultiClient
