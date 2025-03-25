use crate::types::order_data::ORDER_DATA_LENGTH;
use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

pub global MIN_RECEIVED_MAX_OUTPUTS: u32 = 1; // TODO
pub global MAX_SPENT_MAX_OUTPUTS: u32 = 1; // TODO
pub global FILL_INSTRUCTIONS_MAX_INSTRUCTIONS: u32 = 1; // TODO

#[derive(Deserialize, Eq, Serialize)]
pub struct Output {
    pub token: [u8; 32],
    pub amount: [u8; 32],
    pub recipient: [u8; 32],
    pub chain_id: u32,
}

#[derive(Deserialize, Eq, Serialize)]
pub struct FillInstruction {
    pub destination_chain_id: u32,
    pub destination_settler: [u8; 32],
    pub origin_data: [u8; ORDER_DATA_LENGTH],
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ResolvedCrossChainOrder {
    pub user: AztecAddress,
    pub origin_chain_id: u32,
    pub open_dealine: u32,
    pub fill_deadline: u32,
    pub order_id: [u8; 32],
    pub min_received: [Output; MIN_RECEIVED_MAX_OUTPUTS],
    pub max_spent: [Output; MAX_SPENT_MAX_OUTPUTS],
    pub fill_instructions: [FillInstruction; FILL_INSTRUCTIONS_MAX_INSTRUCTIONS],
}
