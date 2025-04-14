use crate::types::{
    order_data::OrderData,
    resolved_cross_chain_order::{FillInstruction, Output, ResolvedCrossChainOrder},
};
use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct InternalRCOParams {
    pub order_id_bytes: [u8; 32],
    pub order_id: Field,
    pub resolved_cross_chain_order: ResolvedCrossChainOrder,
    pub order_data: OrderData,
}
