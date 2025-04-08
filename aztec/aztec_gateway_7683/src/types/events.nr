use crate::types::order_data::ORDER_DATA_LENGTH;
use dep::aztec::protocol_types::traits::{Packable, Serialize};

// #[event]
#[derive(Serialize)]
pub struct Filled {
    pub order_id: [u8; 32],
    pub origin_data: [u8; ORDER_DATA_LENGTH],
    pub filler_data: [u8; 32],
}

// 301 + 32 + 32 = 365      365 / 31 = 11.74 = 12 + 1 (residual bytes) = 13
impl Packable<13> for Filled {
    fn pack(self) -> [Field; 13] {
        let mut result: [Field; 13] = [0; 13];
        let mut residual_bytes = [0; 31];

        let mut order_id_31 = [0; 31];
        let mut filler_data_31 = [0; 31];
        for i in 0..31 {
            order_id_31[i] = self.order_id[i];
            filler_data_31[i] = self.filler_data[i];
        }
        residual_bytes[0] = self.order_id[31];
        residual_bytes[10] = self.filler_data[31];

        for i in 0..10 {
            let mut partial: [u8; 31] = [0; 31];
            let offset = 32 * i;

            for j in 0..31 {
                let k = offset + j;
                if k < ORDER_DATA_LENGTH {
                    partial[j] = self.origin_data[k];
                }
            }
            result[i + 1] = Field::from_be_bytes(partial);

            if i < 9 {
                residual_bytes[i + 1] = self.origin_data[offset + 31];
            }
        }

        result[0] = Field::from_be_bytes::<31>(order_id_31);
        result[11] = Field::from_be_bytes::<31>(filler_data_31);
        result[12] = Field::from_be_bytes::<31>(residual_bytes);
        result
    }

    fn unpack(fields: [Field; 13]) -> Self {
        assert(true == false, "not implemented");
        Self { order_id: [0; 32], origin_data: [0; ORDER_DATA_LENGTH], filler_data: [0; 32] }
    }
}
