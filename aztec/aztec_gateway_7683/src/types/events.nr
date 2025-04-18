use crate::types::{
    order_data::ORDER_DATA_LENGTH, resolved_cross_chain_order::RESOLVED_CROSS_CHAIN_LENGTH,
};
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
        let mut packed = [0; 13];
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
            let mut partial = [0; 31];
            let offset = 32 * i;

            for j in 0..31 {
                let k = offset + j;
                if k < ORDER_DATA_LENGTH {
                    partial[j] = self.origin_data[k];
                }
            }
            packed[i + 1] = Field::from_be_bytes(partial);

            if i < 9 {
                // no residual bytes for the last one
                residual_bytes[i + 1] = self.origin_data[offset + 31];
            }
        }

        packed[0] = Field::from_be_bytes::<31>(order_id_31);
        packed[11] = Field::from_be_bytes::<31>(filler_data_31);
        packed[12] = Field::from_be_bytes::<31>(residual_bytes);
        packed
    }

    fn unpack(fields: [Field; 13]) -> Self {
        assert(true == false, "not implemented");
        Self { order_id: [0; 32], origin_data: [0; ORDER_DATA_LENGTH], filler_data: [0; 32] }
    }
}

// #[event]
#[derive(Serialize)]
pub struct Open1 {
    pub order_id: [u8; 32],
    pub resolved_order: [u8; 340],
}

impl Packable<13> for Open1 {
    fn pack(self) -> [Field; 13] {
        let mut packed = [0; 13];
        let mut residual_bytes = [0; 31];

        let mut order_id_31 = [0; 31];
        for i in 0..31 {
            order_id_31[i] = self.order_id[i];
        }
        residual_bytes[0] = self.order_id[31];

        for i in 0..12 {
            let mut partial = [0; 31];
            let offset = 32 * i;

            for j in 0..31 {
                let k = offset + j;
                if k < 340 {
                    partial[j] = self.resolved_order[k];
                }
            }
            packed[i + 1] = Field::from_be_bytes(partial);

            let residual_bytes_offset = offset + 31;
            if residual_bytes_offset < 340 {
                residual_bytes[i + 1] = self.resolved_order[residual_bytes_offset];
            }
        }

        packed[0] = Field::from_be_bytes::<31>(order_id_31);
        packed[12] = Field::from_be_bytes::<31>(residual_bytes);
        packed
    }

    fn unpack(fields: [Field; 13]) -> Self {
        assert(true == false, "not implemented");
        Self { order_id: [0; 32], resolved_order: [0; 340] }
    }
}

// #[event]
#[derive(Serialize)]
pub struct Open2 {
    pub order_id: [u8; 32],
    pub resolved_order: [u8; 273],
}

impl Packable<11> for Open2 {
    fn pack(self) -> [Field; 11] {
        let mut packed = [0; 11];
        let mut residual_bytes = [0; 31];

        let mut order_id_31 = [0; 31];
        for i in 0..31 {
            order_id_31[i] = self.order_id[i];
        }
        residual_bytes[0] = self.order_id[31];

        for i in 0..10 {
            let mut partial = [0; 31];
            let offset = 32 * i;

            for j in 0..31 {
                let k = offset + j;
                if k < 273 {
                    partial[j] = self.resolved_order[k];
                }
            }
            packed[i + 1] = Field::from_be_bytes(partial);

            let residual_bytes_offset = offset + 31;
            if residual_bytes_offset < 273 {
                residual_bytes[i + 1] = self.resolved_order[residual_bytes_offset];
            }
        }

        packed[0] = Field::from_be_bytes::<31>(order_id_31);
        packed[10] = Field::from_be_bytes::<31>(residual_bytes);
        packed
    }

    fn unpack(fields: [Field; 11]) -> Self {
        assert(true == false, "not implemented");
        Self { order_id: [0; 32], resolved_order: [0; 273] }
    }
}

pub struct Open {
    pub open1: Open1,
    pub open2: Open2,
}

impl Open {
    pub fn new(order_id: [u8; 32], resolved_order: [Field; RESOLVED_CROSS_CHAIN_LENGTH]) -> Self {
        let mut resolved_order1 = [0; 340];
        for i in 0..340 {
            resolved_order1[i] = resolved_order[i] as u8;
        }
        let mut resolved_order2 = [0; 273];
        for i in 0..273 {
            resolved_order2[i] = resolved_order[i + 340] as u8;
        }

        Self {
            open1: Open1 { order_id, resolved_order: resolved_order1 },
            open2: Open2 { order_id, resolved_order: resolved_order2 },
        }
    }
}

//#[event]
#[derive(Serialize)]
pub struct Settled {
    order_id: [u8; 32],
    receiver: [u8; 32],
}

impl Packable<3> for Settled {
    fn pack(self) -> [Field; 3] {
        let mut packed = [0; 3];
        let mut residual_bytes = [0; 31];

        let mut order_id_31 = [0; 31];
        let mut receiver_31 = [0; 31];
        for i in 0..31 {
            order_id_31[i] = self.order_id[i];
            receiver_31[i] = self.receiver[i]
        }
        residual_bytes[0] = self.order_id[31];
        residual_bytes[1] = self.receiver[31];

        packed[0] = Field::from_be_bytes::<31>(order_id_31);
        packed[1] = Field::from_be_bytes::<31>(receiver_31);
        packed[2] = Field::from_be_bytes::<31>(residual_bytes);
        packed
    }

    fn unpack(fields: [Field; 3]) -> Self {
        assert(true == false, "not implemented");
        Self { order_id: [0; 32], receiver: [0; 32] }
    }
}
