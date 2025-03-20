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
    global FILLED: u32 = 1;
    global SETTLE_ORDER_TYPE: [u8; 32] = [
        25, 30, 167, 118, 189, 110, 12, 213, 106, 109, 68, 186, 74, 234, 47, 236, 70, 139, 74, 11,
        76, 29, 136, 13, 64, 37, 146, 158, 235, 97, 93, 13,
    ]; // sha256("SETTLE_ORDER_TYPE")

    use crate::{
        config::Config,
        types::{ORDER_DATA_LENGTH, OrderData},
        utils::{u32_to_bytes, u8_32_to_u128},
    };
    use dep::aztec::{
        event::event_interface::EventInterface,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, view},
            storage::storage,
        },
        prelude::{AztecAddress, EthAddress, Map, PublicImmutable, PublicMutable},
        protocol_types::{hash::sha256_to_field, traits::{FromField, Serialize}},
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
    fn fill(order_id: [u8; 32], origin_data: [u8; ORDER_DATA_LENGTH], filler_data: [u8; 32]) {
        let order_id_field = Field::from_be_bytes(order_id);
        assert(storage.order_status.at(order_id_field).read() == UNKNOWN, "Invalid order status");

        let hashed_message: [u8; 32] = sha256::digest(origin_data);
        assert(order_id == hashed_message, "Invalid order id");

        let order_data = OrderData::decode(origin_data);

        assert(context.timestamp() as u32 <= order_data.fill_deadline, "Order fill expired");
        assert(order_data.destination_domain == LOCAL_DESTINATION_DOMAIN, "Invalid order domain");

        let output_token = AztecAddress::from_field(Field::from_be_bytes(order_data.output_token));
        let recipient = AztecAddress::from_field(Field::from_be_bytes(order_data.recipient));
        let amount = u8_32_to_u128(order_data.amount_out);

        let nonce = Field::from_be_bytes(order_data.sender_nonce);
        let _ = Token::at(output_token)
            .transfer_in_public(context.msg_sender(), recipient, amount, nonce)
            .call(&mut context);

        storage.order_status.at(order_id_field).write(FILLED);
        // TODO: store filled order

        AztecGateway7683::at(context.this_address())
            ._trigger_settlement_via_portal_public(
                order_id,
                filler_data, // at the moment filler data contains the ethereum address where the filler wants to receive the funds during the settlement
            )
            .call(&mut context);

        // TODO: "Emitted public log is too large, max: 13, passed: 333"
        // Filled { order_id, origin_data, filler_data }.emit(encode_event(&mut context));
    }

    #[public]
    #[internal]
    fn _trigger_settlement_via_portal_public(order_id: [u8; 32], recipient: [u8; 32]) {
        let mut settlement_message_bytes: [u8; 96] = [0; 96];

        for i in 0..32 {
            settlement_message_bytes[i] = SETTLE_ORDER_TYPE[i]; // order_type
            settlement_message_bytes[i + 32] = order_id[i]; // order_id
            settlement_message_bytes[i + 54] = recipient[i]; // recipient
        }

        let config = storage.config.read();
        context.message_portal(config.portal, sha256_to_field(settlement_message_bytes));
    }
}
