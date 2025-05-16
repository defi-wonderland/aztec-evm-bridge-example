# Vault

The Vault is a smart contract deployed on Optimism Sepolia that securely receives confidential asset deposits from Aztec via the ERC-7683 bridge. 
Before accepting a deposit, the Vault verifies a zkPassport proof to ensure the user meets specific eligibility criteria—such as being over 18 years old without revealing any personal data. Only users who successfully provide a valid zero-knowledge proof are allowed to interact with the Vault.
In addition to private deposits, the Vault also supports withdrawals, allowing eligible users to retrieve their funds securely and trustlessly.

## 🚀 Getting Started

### Build

```shell
$ forge build
```

### Deploy

```shell
forge create --broadcast \
    --private-key <your_private_key> \
    --rpc-url <optimism_sepolia_rpc> \
    src/Vault.sol:Vault \
    --constructor-args <l2_gateway_7683>
```