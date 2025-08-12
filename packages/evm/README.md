# evm

## 🚀 Getting Started

### Build

```shell
$ forge build
```

### Deploy

```shell
forge create --broadcast \
  --private-key <private_key> \
  --rpc-url <rpc_url> \
  src/L2Gateway7683.sol:L2Gateway7683 \
  --constructor-args <permit2_address>
```


```shell
forge create  --broadcast \
  --private-key <private_key> \
  --rpc-url <rpc_url> \
  src/Forwarder.sol:Forwarder \
  --constructor-args <l2_gateway_7683> <aztec_inbox> <aztec_outbox> <aztec_gateway> <anchor_state_registry>
 
```