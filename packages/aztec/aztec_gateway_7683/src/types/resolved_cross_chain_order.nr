use crate::types::order_data::ORDER_DATA_LENGTH;
use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

pub global RESOLVED_CROSS_CHAIN_LENGTH: u32 = 312 + ORDER_DATA_LENGTH;
pub global MIN_RECEIVED_MAX_OUTPUTS: u32 = 1; // TODO
pub global MAX_SPENT_MAX_OUTPUTS: u32 = 1; // TODO
pub global FILL_INSTRUCTIONS_MAX_INSTRUCTIONS: u32 = 1; // TODO

#[derive(Deserialize, Eq, Serialize)]
pub struct Output {
    pub token: [u8; 32],
    pub amount: [u8; 32],
    pub recipient: [u8; 32],
    // Use [u8; 4] instead of u32 because the serializer drops the upper 3 bytes when serializing a u32.
    // The cause is unclear, but this ensures correct 4-byte representation.
    pub chain_id: [u8; 4],
}

#[derive(Deserialize, Eq, Serialize)]
pub struct FillInstruction {
    pub destination_chain_id: [u8; 4], // same as above
    pub destination_settler: [u8; 32],
    pub origin_data: [u8; ORDER_DATA_LENGTH],
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ResolvedCrossChainOrder {
    pub user: [u8; 32], // // same problem
    pub origin_chain_id: [u8; 4], // same as above
    pub open_deadline: [u8; 4], // same as above
    pub fill_deadline: [u8; 4], // same as above
    pub order_id: [u8; 32],
    pub min_received: [Output; MIN_RECEIVED_MAX_OUTPUTS],
    pub max_spent: [Output; MAX_SPENT_MAX_OUTPUTS],
    pub fill_instructions: [FillInstruction; FILL_INSTRUCTIONS_MAX_INSTRUCTIONS],
}
