use crate::types::order_data::ORDER_DATA_LENGTH;
use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct OnchainCrossChainOrder {
    pub fill_deadline: u32,
    pub order_data_type: [u8; 32],
    pub order_data: [u8; ORDER_DATA_LENGTH],
}
