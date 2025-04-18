use dep::aztec::{prelude::AztecAddress, protocol_types::traits::FromField};
use dep::aztec::protocol_types::hash::sha256_to_field;

pub(crate) fn u8_32_to_u128(input: [u8; 32]) -> u128 {
    let mut result = 0;
    for i in 0..16 {
        result = result + (input[31 - i] as u128) * (1 << (i * 8));
    }
    result
}

pub(crate) fn u8_4_to_u32(bytes: [u8; 4]) -> u32 {
    let field = Field::from_be_bytes(bytes);
    field.assert_max_bit_size::<32>();
    field as u32
}

pub(crate) fn u8_32_to_aztec_address(bytes: [u8; 32]) -> AztecAddress {
    AztecAddress::from_field(Field::from_be_bytes(bytes))
}

pub(crate) fn u32_to_u8_4(x: u32) -> [u8; 4] {
    [((x >> 24) & 0xFF) as u8, ((x >> 16) & 0xFF) as u8, ((x >> 8) & 0xFF) as u8, (x & 0xFF) as u8]
}

pub fn get_settle_content_hash(
    settle_order_type: [u8; 32],
    order_id_bytes: [u8; 32],
    filler_data_bytes: [u8; 32],
) -> Field {
    let mut hash_bytes = [0; 96];

    for i in 0..32 {
        hash_bytes[i] = settle_order_type[i];
        hash_bytes[i + 32] = order_id_bytes[i];
        hash_bytes[i + 64] = filler_data_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
