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

pub(crate) fn u32_to_bytes(value: u32) -> [u8; 4] {
    let mut bytes: [u8; 4] = [0, 0, 0, 0];

    for i in 0..4 {
        bytes[i] = ((value >> (i * 8)) & 0xFF) as u8;
    }

    bytes
}
