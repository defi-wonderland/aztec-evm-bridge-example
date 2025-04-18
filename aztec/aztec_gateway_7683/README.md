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

### ⚠️ Important Warning

Before running the above command make sure to run the following commands:

```bash
# Navigate to the Aztec monorepo
cd ~/nargo/github.com/AztecProtocol/aztec-packages/v0.85.0/noir-projects/noir-contracts/

# Compile the token_contract package
aztec-nargo compile --package token_contract

# Return to the root of the project directory

# Copy the compiled artifact back to your project
cp ~/nargo/github.com/AztecProtocol/aztec-packages/v0.85.0/noir-projects/noir-contracts/target/token_contract-Token.json ./target/token_contract-Token.json
```

If you see the following error when compiling:

```bash
src/artifacts/Token.ts:26:3 - error TS2305: Module '"@aztec/aztec.js"' has no exported member 'L1EventPayload'.
```
 
Go to `src/artifacts/Token.ts` and remove the **`L1EventPayload`** import.


## 🧪 Testing

To run the JavaScript-based tests for this contract:

```bash
yarn test:js
```

Make sure you have installed the dependencies beforehand with:

```bash
yarn install
```