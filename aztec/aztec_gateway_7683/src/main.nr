mod test;
mod types;
mod utils;

use dep::aztec::macros::aztec;

/*

function fill(bytes32 _orderId, bytes calldata _originData, bytes calldata _fillerData) external payable virtual {
        if (orderStatus[_orderId] != UNKNOWN) revert InvalidOrderStatus();

        _fillOrder(_orderId, _originData, _fillerData);

        orderStatus[_orderId] = FILLED;
        filledOrders[_orderId] = FilledOrder(_originData, _fillerData);

        emit Filled(_orderId, _originData, _fillerData);
    }


    function _fillOrder(bytes32 _orderId, bytes calldata _originData, bytes calldata) internal override {
        OrderData memory orderData = OrderEncoder.decode(_originData);

        if (_orderId != OrderEncoder.id(orderData)) revert InvalidOrderId();
        if (block.timestamp > orderData.fillDeadline) revert OrderFillExpired();
        if (orderData.destinationDomain != _localDomain()) revert InvalidOrderDomain();

        address outputToken = TypeCasts.bytes32ToAddress(orderData.outputToken);
        address recipient = TypeCasts.bytes32ToAddress(orderData.recipient);

        if (outputToken == address(0)) {
            if (orderData.amountOut != msg.value) revert InvalidNativeAmount();
            Address.sendValue(payable(recipient), orderData.amountOut);
        } else {
            IERC20(outputToken).safeTransferFrom(msg.sender, recipient, orderData.amountOut);
        }
    }
    */

#[aztec]
pub contract AztecGateway7683 {
    // context.chain_id() returns 1, which corresponds to the mainnet, making it unsuitable for our use case.
    // Instead, we designate 999999 as the destination domain.
    global LOCAL_DESTINATION_DOMAIN: u32 = 999999;
    global UNKNOWN: u32 = 0;
    global FILLED: u32 = 1;

    use crate::types::{ORDER_DATA_LENGTH, OrderData};
    use crate::utils::u8_32_to_u128;
    use dep::aztec::{
        prelude::{AztecAddress, Map, PublicMutable},
        protocol_types::traits::FromField,
    };
    use aztec::macros::{functions::{initializer, private, public}, storage::storage};
    use token::Token;

    #[storage]
    struct Storage<Context> {
        order_status: Map<Field, PublicMutable<u32, Context>, Context>,
    }

    #[public]
    fn fill(order_id: [u8; 32], origin_data: [u8; ORDER_DATA_LENGTH], filler_data: [u8; 1]) {
        // TODO: decide a fixed size for filler_data
 
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

        /*let _ = Token::at(output_token)
            .transfer_in_public(context.msg_sender(), recipient, amount, 1)
            .call(&mut context);*/

        storage.order_status.at(order_id_field).write(FILLED);
        // TODO: store filled order
    }

}
