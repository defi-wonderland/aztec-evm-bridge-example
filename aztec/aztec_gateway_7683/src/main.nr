mod config;
mod types;
mod utils;

use dep::aztec::macros::aztec;

#[aztec]
pub contract AztecGateway7683 {
    // context.chain_id() returns 1, which corresponds to the mainnet, making it unsuitable for our use case.
    // Instead, we designate 999999 as the destination domain.
    global LOCAL_DESTINATION_DOMAIN: u32 = 999999;

    global UNKNOWN: u32 = 0;
    global INITIATED_PRIVATELY: u32 = 1;
    global FILLED: u32 = 2;

    global SETTLE_ORDER_TYPE: [u8; 32] = [
        100, 26, 150, 232, 234, 193, 205, 65, 73, 216, 31, 243, 122, 123, 194, 24, 136, 159, 246,
        156, 124, 228, 38, 13, 122, 9, 202, 154, 234, 92, 186, 189,
    ]; // sha256("SETTLE_ORDER_TYPE")

    use crate::{
        config::Config,
        types::{ORDER_DATA_LENGTH, OrderData},
        utils::{u8_32_to_aztec_address, u8_32_to_u128},
    };
    use dep::aztec::{
        event::event_interface::EventInterface,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, view},
            storage::storage,
        },
        prelude::{EthAddress, Map, PublicImmutable, PublicMutable},
        protocol_types::{hash::sha256_to_field, traits::Serialize},
        unencrypted_logs::unencrypted_event_emission::encode_event,
    };
    use token::Token;

    #[derive(Serialize)]
    #[event]
    struct Filled {
        order_id: [u8; 32],
        origin_data: [u8; ORDER_DATA_LENGTH],
        filler_data: [u8; 32],
    }

    #[storage]
    struct Storage<Context> {
        order_status: Map<Field, PublicMutable<u32, Context>, Context>,
        claimable_orders: Map<Field, PublicMutable<Field, Context>, Context>,
        config: PublicImmutable<Config, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(portal: EthAddress) {
        storage.config.initialize(Config { portal });
    }

    #[private]
    #[view]
    fn get_config() -> Config {
        storage.config.read()
    }

    #[public]
    #[view]
    fn get_config_public() -> Config {
        storage.config.read()
    }

    #[public]
    fn fill(
        order_id_bytes: [u8; 32],
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) {
        let order_id = Field::from_be_bytes(order_id_bytes);
        AztecGateway7683::at(context.this_address())._check_order_status(order_id, UNKNOWN).call(
            &mut context,
        );

        let order_data = OrderData::decode(origin_data_bytes);
        assert(order_id_bytes == sha256::digest(origin_data_bytes), "Invalid order id");
        assert(context.timestamp() as u32 <= order_data.fill_deadline, "Order fill expired");
        assert(order_data.destination_domain == LOCAL_DESTINATION_DOMAIN, "Invalid order domain");

        Token::at(u8_32_to_aztec_address(order_data.output_token))
            .transfer_in_public(
                context.msg_sender(),
                u8_32_to_aztec_address(order_data.recipient),
                u8_32_to_u128(order_data.amount_out),
                Field::from_be_bytes(order_data.sender_nonce),
            )
            .call(&mut context);

        storage.order_status.at(order_id).write(FILLED);
        // TODO: store filled order

        AztecGateway7683::at(context.this_address())
            ._trigger_settlement(
                order_id_bytes,
                filler_data_bytes, // at the moment filler data contains the ethereum address where the filler wants to receive the funds during the settlement
            )
            .call(&mut context);

        // TODO: "Emitted public log is too large, max: 13, passed: 333"
        // Filled { order_id: order_id_bytes, origin_data: origin_data_bytes, filler_data: filler_data_bytes }.emit(encode_event(&mut context));
    }

    #[public]
    fn fill_private(
        order_id_bytes: [u8; 32],
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) {
        let order_id = Field::from_be_bytes(order_id_bytes);
        AztecGateway7683::at(context.this_address())._check_order_status(order_id, UNKNOWN).call(
            &mut context,
        );

        let order_data = OrderData::decode(origin_data_bytes);
        assert(order_id_bytes == sha256::digest(origin_data_bytes), "Invalid order id");
        assert(context.timestamp() as u32 <= order_data.fill_deadline, "Order fill expired");
        assert(order_data.destination_domain == LOCAL_DESTINATION_DOMAIN, "Invalid order domain");

        Token::at(u8_32_to_aztec_address(order_data.output_token))
            .transfer_in_public(
                context.msg_sender(),
                context.this_address(),
                u8_32_to_u128(order_data.amount_out),
                0,
            )
            .call(&mut context);

        let mut pre_image: [u8; ORDER_DATA_LENGTH + 32] = [0; ORDER_DATA_LENGTH + 32];
        for i in 0..ORDER_DATA_LENGTH {
            pre_image[i] = origin_data_bytes[i];
        }
        for i in 0..32 {
            pre_image[i + ORDER_DATA_LENGTH] = filler_data_bytes[i];
        }

        storage.claimable_orders.at(order_id).write(sha256_to_field(pre_image));
        storage.order_status.at(order_id).write(INITIATED_PRIVATELY);
    }

    #[private]
    fn claim_private(
        secret: [u8; 32],
        order_id_bytes: [u8; 32],
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) {
        let order_id = Field::from_be_bytes(order_id_bytes);

        AztecGateway7683::at(context.this_address())
            ._check_order_status(order_id, INITIATED_PRIVATELY)
            .enqueue(&mut context);

        // verify that a commitment exists for the given order.
        AztecGateway7683::at(context.this_address())
            ._check_order_commitment(order_id, origin_data_bytes, filler_data_bytes)
            .enqueue(&mut context);

        let order_data = OrderData::decode(origin_data_bytes);
        // if a commitment exists, the order is valid, allowing us to compare the recipient with hash(secret).
        assert(sha256::digest(secret) == order_data.recipient, "Invalid secret");

        Token::at(u8_32_to_aztec_address(order_data.output_token))
            .transfer_to_private(context.msg_sender(), u8_32_to_u128(order_data.amount_out))
            .call(&mut context);

        AztecGateway7683::at(context.this_address())._update_order_status(order_id, FILLED).enqueue(
            &mut context,
        );

        // TODO: store filled order
        // TODO: emit event

        AztecGateway7683::at(context.this_address())
            ._trigger_settlement(
                order_id_bytes,
                filler_data_bytes, // at the moment filler data contains the ethereum address where the filler wants to receive the funds during the settlement
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _check_order_status(order_id: Field, status: u32) {
        assert(storage.order_status.at(order_id).read() == status, "Invalid order status");
    }

    #[public]
    #[internal]
    fn _update_order_status(order_id: Field, status: u32) {
        storage.order_status.at(order_id).write(status);
    }

    #[public]
    #[internal]
    fn _check_order_commitment(
        order_id: Field,
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) {
        let mut pre_image: [u8; ORDER_DATA_LENGTH + 32] = [0; ORDER_DATA_LENGTH + 32];
        for i in 0..ORDER_DATA_LENGTH {
            pre_image[i] = origin_data_bytes[i];
        }
        for i in 0..32 {
            pre_image[i + ORDER_DATA_LENGTH] = filler_data_bytes[i];
        }
        let order_commitment = storage.claimable_orders.at(order_id).read();
        assert(order_commitment == sha256_to_field(pre_image), "Invalid order");
    }

    #[public]
    #[internal]
    fn _trigger_settlement(order_id_bytes: [u8; 32], filler_data: [u8; 32]) {
        let mut settlement_message_bytes: [u8; 96] = [0; 96];

        for i in 0..32 {
            settlement_message_bytes[i] = SETTLE_ORDER_TYPE[i]; // order_type
            settlement_message_bytes[i + 32] = order_id_bytes[i]; // order_id_bytes
            settlement_message_bytes[i + 54] = filler_data[i]; // recipient
        }

        let config = storage.config.read();
        context.message_portal(config.portal, sha256_to_field(settlement_message_bytes));
    }
}
