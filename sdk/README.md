# @substancelabs/aztec-evm-bridge-sdk

> ⚠️ **Disclaimer**
>
> This SDK is a **work in progress** and may undergo significant changes. Breaking changes may occur frequently.  
> Use it at your own risk in production environments. Contributions and feedback are welcome as the project evolves.

---

## 📦 Installation

```bash
npm install @substancelabs/aztec-evm-bridge-sdk
```

---

## 🚀 Quick Start

Here's a basic example showing how to initiate a swap **from Aztec to Base**:

```ts
import { AztecEvmSwapper, aztecSepolia } from "@substancelabs/aztec-evm-bridge-sdk"
import { createAztecNodeClient, waitForPXE } from "@aztec/aztec.js"
import { createStore } from "@aztec/kv-store/lmdb"
import { getPXEServiceConfig } from "@aztec/pxe/config"
import { createPXEService } from "@aztec/pxe/server"
import { Chain, padHex } from "viem"
import { baseSepolia } from "viem/chains"

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

const swapper = new AztecEvmSwapper({
  evmPrivateKey: "0x...",
  aztecSecretKey: "0x...",
  aztecSalt: "0x...",
  aztecPxe: pxe,
  aztecNode: node,
})
swapper
  .swap({
    chainIn: aztecSepolia as Chain,
    chainOut: baseSepolia,
    amountIn: 1n,
    amountOut: 1n,
    tokenIn: "0x...",
    tokenOut: "0x...",
    mode: "private", // privateWithHook, public, or publicWithHook
    data: padHex("0x"),
    recipient: padHex("0x"),
  })
  .then(console.log)
  .catch(console.error)
```

---


## 🧪 Development

```bash
# Build the SDK
yarn build

# Run tests
yarn test
```