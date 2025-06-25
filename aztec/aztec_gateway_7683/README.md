# Aztec ERC-7683 contracts

This project defines an Aztec-compatible Noir contract implementing an **ERC-7683** interface for intent-based cross-chain bridging.

> This contract is intended for use with the [Aztec Protocol](https://github.com/AztecProtocol) stack and depends on their custom build tooling (`aztec-nargo`).


## 🛠 Getting Started

To set up your environment and begin working with this contract, please follow the official Aztec documentation:

👉 [Aztec Developer Docs – Getting Started](https://docs.aztec.network/developers/getting_started)

This guide walks you through:

- Installing prerequisites
- Setting up the Aztec Sandbox
- Compiling Noir contracts with `aztec-nargo`
- Using the Aztec wallet CLI


## 🔨 Build Instructions

```bash
aztec-nargo compile
```

```bash
yarn install
```

### ⚠️ Important Warning

Before running the above command make sure to run the following commands:

```bash
# Navigate to the Aztec monorepo
cd ~/nargo/github.com/AztecProtocol/aztec-packages/v0.87.9/noir-projects/noir-contracts/

# Compile the token_contract package
aztec-nargo compile --package token_contract

# Return to the root of the project directory

# Copy the compiled artifact back to your project
cp ~/nargo/github.com/AztecProtocol/aztec-packages/v0.87.9/noir-projects/noir-contracts/target/token_contract-Token.json ./target/token_contract-Token.json
```


## 🧪 Interacting with the Bridge

Before interacting with the bridge, ensure you have created a `.env` file based on the structure provided in `.env.example`. You can get the addresses [HERE](https://substance-labs.gitbook.io/aztec-evm-bridge/deployments). Then:

```bash
aztec-nargo compile
aztec codegen target --outdir src/artifacts
```

### ➡️ Aztec Testnet → Base Sepolia

To test the bridge flow **from Aztec Testnet to Base Sepolia**, run:

```bash
node --no-warnings --loader ts-node/esm scripts/e2e/aztec-to-evm.ts 
```

### ⬅️ Base Sepolia → Aztec Testnet

To test the bridge flow **from Base Sepolia to Aztec Testnet**, run:

```bash
node --no-warnings --loader ts-node/esm scripts/e2e/evm-to-aztec.ts 
```

### ⚠️ Important Notes

* These scripts interact with the bridge in private mode. The bridge also supports public mode, and scripts for that will be available soon.
* If orders are not being filled, it's likely that no fillers are currently online. To run your own filler instance, refer to the `README.md` file inside the `filler/` directory for setup instructions.
* You must be using a **valid token**.

### 🪙 Deploying a Token on Aztec

If you need to deploy a test token on Aztec, run:

```bash
node --no-warnings --loader ts-node/esm scripts/deploy-token.ts 
```

To modify token parameters, edit the `deploy-token.ts` file directly.


## 🧪 Testing

To run the JavaScript-based tests for this contract:

```bash
yarn test:js
```

Make sure you have installed the dependencies beforehand with:
