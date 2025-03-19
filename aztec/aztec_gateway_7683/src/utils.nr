pub(crate) fn u8_32_to_u128(input: [u8; 32]) -> u128 {
    let mut result: u128 = 0;
    for i in 0..16 {
        result |= (input[i] as u128) << (i * 8);
    }
    result
}

pub(crate) fn u8_4_to_u32(bytes: [u8; 4]) -> u32 {
    let field = Field::from_be_bytes(bytes);
    field.assert_max_bit_size::<32>();
    field as u32
}
