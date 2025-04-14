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
    global OPENED: u32 = 1;
    global FILLED: u32 = 2;
    global INITIATED_PRIVATELY: u32 = 3;

    global SETTLE_ORDER_TYPE: [u8; 32] = [
        25, 30, 167, 118, 189, 110, 12, 213, 106, 109, 68, 186, 74, 234, 47, 236, 70, 139, 74, 11,
        76, 29, 136, 13, 64, 37, 146, 158, 235, 97, 93, 13,
    ]; // sha256("SETTLE_ORDER_TYPE")

    use crate::{
        config::Config,
        types::{
            events::{Filled, Open},
            helpers::InternalRCOParams,
            onchain_cross_chain_order::OnchainCrossChainOrder,
            order_data::{
                ORDER_DATA_LENGTH, ORDER_DATA_TYPE, OrderData, PRIVATE_ORDER, PUBLIC_ORDER,
            },
            resolved_cross_chain_order::{
                FILL_INSTRUCTIONS_MAX_INSTRUCTIONS, FillInstruction, MAX_SPENT_MAX_OUTPUTS,
                MIN_RECEIVED_MAX_OUTPUTS, Output, RESOLVED_CROSS_CHAIN_LENGTH,
                ResolvedCrossChainOrder,
            },
        },
        utils::{u32_to_u8_4, u8_32_to_aztec_address, u8_32_to_u128},
    };
    use dep::aztec::{
        macros::{functions::{initializer, internal, private, public, view}, storage::storage},
        prelude::{AztecAddress, EthAddress, Map, PublicImmutable, PublicMutable},
        protocol_types::{hash::sha256_to_field, traits::{Packable, Serialize}},
    };
    use token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        claimable_orders: Map<Field, PublicMutable<Field, Context>, Context>,
        open_orders: Map<Field, PublicMutable<[u8; 32], Context>, Context>,
        order_status: Map<Field, PublicMutable<u32, Context>, Context>,
        used_nonces: Map<AztecAddress, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
        filled_orders_block_numbers: Map<Field, PublicMutable<Field, Context>, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(portal: EthAddress) {
        storage.config.initialize(Config { portal });
    }

    #[public]
    fn open(order: OnchainCrossChainOrder) {
        assert(order.order_data_type == ORDER_DATA_TYPE, "Invalid order data type");

        let data = _resolve(order, context.msg_sender(), context.timestamp());
        let order_data = data.order_data;
        let resolved_order = data.resolved_cross_chain_order;
        let order_id = data.order_id;
        let nonce = Field::from_be_bytes(order_data.sender_nonce);

        assert(order_data.order_type == PUBLIC_ORDER, "Not a public order");
        assert(order_data.origin_domain == LOCAL_DESTINATION_DOMAIN, "Invalid order origin domain");
        assert(!storage.used_nonces.at(context.msg_sender()).at(nonce).read(), "Invalid nonce");

        // We cannot store the entire order_data + ORDER_DATA_TYPE as it raises the following error:
        // Reached the limit (63) on number of 'public data (contract storage) write' per tx 'storage_write_opcode(storage_slot, value).
        // For this reason we store a commitment of it.
        storage.open_orders.at(order_id).write(_get_open_order_commitment(order.order_data));
        storage.order_status.at(order_id).write(OPENED);
        storage.used_nonces.at(context.msg_sender()).at(nonce).write(true);

        for i in 0..resolved_order.min_received.len() {
            let min_received = resolved_order.min_received[i];

            Token::at(u8_32_to_aztec_address(min_received.token))
                .transfer_in_public(
                    context.msg_sender(),
                    context.this_address(),
                    u8_32_to_u128(min_received.amount),
                    0,
                )
                .call(&mut context);
        }

        let event = Open::new(data.order_id_bytes, resolved_order.serialize());
        context.emit_public_log(event.open1.pack());
        context.emit_public_log(event.open2.pack());
    }

    #[private]
    fn open_private(order: OnchainCrossChainOrder) {
        assert(order.order_data_type == ORDER_DATA_TYPE, "Invalid order data type");

        // NOTE: Force the sender to be zero in order to avoid creating a connection between the sender and the recipient.
        let data = _resolve(order, AztecAddress::zero(), 0 as u64);
        let order_data = data.order_data;
        let resolved_order = data.resolved_cross_chain_order;
        let order_id = data.order_id;
        let nonce = Field::from_be_bytes(order_data.sender_nonce);

        assert(order_data.order_type == PRIVATE_ORDER, "Not a private order");
        assert(order_data.origin_domain == LOCAL_DESTINATION_DOMAIN, "Invalid order origin domain");
        AztecGateway7683::at(context.this_address())
            ._assert_nonce_and_set_order_details(order_id, order.order_data, nonce)
            .enqueue(&mut context);

        for i in 0..resolved_order.min_received.len() {
            let min_received = resolved_order.min_received[i];

            Token::at(u8_32_to_aztec_address(min_received.token))
                .transfer_in_private(
                    context.msg_sender(),
                    context.this_address(),
                    u8_32_to_u128(min_received.amount),
                    0,
                )
                .call(&mut context);
        }

        AztecGateway7683::at(context.this_address())
            ._emit_open(data.order_id_bytes, resolved_order.serialize())
            .enqueue(&mut context);
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

        AztecGateway7683::at(context.this_address())
            ._trigger_settlement(
                order_id,
                order_id_bytes,
                filler_data_bytes, // at the moment filler data contains the ethereum address where the filler wants to receive the funds during the settlement
            )
            .enqueue(&mut context);
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
        // TODO: assert that order_data.data specifies that this order is a public one
        assert(order_id_bytes == sha256::digest(origin_data_bytes), "Invalid order id");
        assert(context.timestamp() as u32 <= order_data.fill_deadline, "Order fill expired");
        assert(
            order_data.destination_domain == LOCAL_DESTINATION_DOMAIN,
            "Invalid order destination domain",
        );

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
                order_id,
                order_id_bytes,
                filler_data_bytes, // at the moment filler data contains the ethereum address where the filler wants to receive the funds during the settlement
            )
            .call(&mut context);

        context.emit_public_log(Filled {
            order_id: order_id_bytes,
            origin_data: origin_data_bytes,
            filler_data: filler_data_bytes,
        }
            .pack());
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
        // TODO: assert that order_data.data specifies that this order is a private one
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

        storage.claimable_orders.at(order_id).write(sha256_to_field(_get_order_pre_image(
            origin_data_bytes,
            filler_data_bytes,
        )));
        storage.order_status.at(order_id).write(INITIATED_PRIVATELY);

        context.emit_public_log(Filled {
            order_id: order_id_bytes,
            origin_data: origin_data_bytes,
            filler_data: filler_data_bytes,
        }
            .pack());
    }

    #[public]
    #[view]
    fn get_order_status(order_id_bytes: [u8; 32]) -> u32 {
        storage.order_status.at(Field::from_be_bytes(order_id_bytes)).read()
    }

    #[public]
    #[view]
    fn get_filled_order_block_number(order_id_bytes: [u8; 32]) -> Field {
        storage.filled_orders_block_numbers.at(Field::from_be_bytes(order_id_bytes)).read()
    }

    #[internal]
    #[public]
    fn _assert_nonce_and_set_order_details(
        order_id: Field,
        order_data: [u8; ORDER_DATA_LENGTH],
        nonce: Field,
    ) {
        assert(!storage.used_nonces.at(context.msg_sender()).at(nonce).read(), "Invalid nonce");
        // We cannot store the entire order_data + ORDER_DATA_TYPE as it raises the following error:
        // Reached the limit (63) on number of 'public data (contract storage) write' per tx 'storage_write_opcode(storage_slot, value).
        // For this reason we store a commitment of it.
        storage.open_orders.at(order_id).write(_get_open_order_commitment(order_data));
        storage.order_status.at(order_id).write(OPENED);
        storage.used_nonces.at(context.msg_sender()).at(nonce).write(true);
    }

    #[contract_library_method]
    fn _get_open_order_commitment(order_data: [u8; ORDER_DATA_LENGTH]) -> [u8; 32] {
        let mut data: [u8; ORDER_DATA_LENGTH + 32] = [0; ORDER_DATA_LENGTH + 32];
        for i in 0..32 {
            data[i] = ORDER_DATA_TYPE[i];
        }
        for i in 0..ORDER_DATA_LENGTH {
            data[i + 32] = order_data[i];
        }
        sha256::digest(data)
    }

    #[public]
    #[internal]
    fn _check_order_status(order_id: Field, status: u32) {
        assert(storage.order_status.at(order_id).read() == status, "Invalid order status");
    }

    #[public]
    #[internal]
    fn _check_order_commitment(
        order_id: Field,
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) {
        let order_commitment = storage.claimable_orders.at(order_id).read();
        assert(
            order_commitment
                == sha256_to_field(_get_order_pre_image(origin_data_bytes, filler_data_bytes)),
            "Invalid order",
        );
    }

    #[public]
    #[internal]
    fn _emit_open(
        order_id_bytes: [u8; 32],
        resolved_order_bytes: [Field; RESOLVED_CROSS_CHAIN_LENGTH],
    ) {
        let event = Open::new(order_id_bytes, resolved_order_bytes);
        context.emit_public_log(event.open1.pack());
        context.emit_public_log(event.open2.pack());
    }

    #[public]
    #[internal]
    fn _trigger_settlement(order_id: Field, order_id_bytes: [u8; 32], filler_data: [u8; 32]) {
        storage.filled_orders_block_numbers.at(order_id).write(context.block_number());

        let mut settlement_message_bytes: [u8; 96] = [0; 96];

        for i in 0..32 {
            settlement_message_bytes[i] = SETTLE_ORDER_TYPE[i]; // order_type
            settlement_message_bytes[i + 32] = order_id_bytes[i]; // order_id_bytes
            settlement_message_bytes[i + 64] = filler_data[i]; // recipient
        }

        let config = storage.config.read();
        context.message_portal(config.portal, sha256_to_field(settlement_message_bytes));
    }

    #[contract_library_method]
    fn _resolve(
        order: OnchainCrossChainOrder,
        sender: AztecAddress,
        timestamp: u64,
    ) -> InternalRCOParams {
        let mut order_data = OrderData::decode(order.order_data);

        assert(order_data.fill_deadline == order.fill_deadline, "Invalid fill deadline");
        assert(u8_32_to_aztec_address(order_data.sender) == sender, "Invalid order sender");

        let order_id_bytes = sha256::digest(order.order_data);
        let order_id = Field::from_be_bytes(order_id_bytes);
        let destination_domain_bytes = u32_to_u8_4(order_data.destination_domain);

        let min_received_output = Output {
            token: order_data.input_token,
            recipient: [0; 32],
            amount: order_data.amount_in,
            chain_id: u32_to_u8_4(order_data.origin_domain),
        };
        let min_received: [Output; MIN_RECEIVED_MAX_OUTPUTS] =
            [min_received_output; MIN_RECEIVED_MAX_OUTPUTS];

        let max_spent_output = Output {
            token: order_data.output_token,
            recipient: order_data.recipient,
            amount: order_data.amount_out,
            chain_id: destination_domain_bytes,
        };
        let max_spent: [Output; MAX_SPENT_MAX_OUTPUTS] = [max_spent_output; MAX_SPENT_MAX_OUTPUTS];

        let fill_instruction = FillInstruction {
            destination_chain_id: destination_domain_bytes,
            destination_settler: order_data.destination_settler,
            origin_data: order.order_data,
        };
        let fill_instructions: [FillInstruction; FILL_INSTRUCTIONS_MAX_INSTRUCTIONS] =
            [fill_instruction; FILL_INSTRUCTIONS_MAX_INSTRUCTIONS];

        let resolved_order = ResolvedCrossChainOrder {
            user: order_data.sender,
            origin_chain_id: u32_to_u8_4(LOCAL_DESTINATION_DOMAIN),
            open_deadline: u32_to_u8_4(timestamp as u32),
            fill_deadline: u32_to_u8_4(order.fill_deadline),
            order_id: order_id_bytes,
            min_received,
            max_spent,
            fill_instructions,
        };

        InternalRCOParams {
            order_id_bytes,
            order_id,
            resolved_cross_chain_order: resolved_order,
            order_data,
        }
    }

    #[contract_library_method]
    fn _get_order_pre_image(
        origin_data_bytes: [u8; ORDER_DATA_LENGTH],
        filler_data_bytes: [u8; 32],
    ) -> [u8; ORDER_DATA_LENGTH + 32] {
        let mut pre_image: [u8; ORDER_DATA_LENGTH + 32] = [0; ORDER_DATA_LENGTH + 32];
        for i in 0..ORDER_DATA_LENGTH {
            pre_image[i] = origin_data_bytes[i];
        }
        for i in 0..32 {
            pre_image[i + ORDER_DATA_LENGTH] = filler_data_bytes[i];
        }
        pre_image
    }

    #[public]
    #[internal]
    fn _update_order_status(order_id: Field, status: u32) {
        storage.order_status.at(order_id).write(status);
    }
}
