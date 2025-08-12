use crate::utils::u8_4_to_u32;
use dep::aztec::protocol_types::{hash::poseidon2_hash, traits::{Deserialize, Serialize}};

pub global ORDER_DATA_LENGTH: u32 = 301;
pub global ORDER_DATA_TYPE: [u8; 32] = [
    240, 12, 59, 246, 12, 115, 235, 151, 9, 127, 28, 152, 53, 83, 125, 160, 20, 224, 183, 85, 254,
    148, 178, 93, 122, 200, 64, 29, 246, 103, 22, 160,
];

pub global PUBLIC_ORDER: u8 = 0;
pub global PRIVATE_ORDER: u8 = 1;
pub global PUBLIC_ORDER_WITH_HOOK: u8 = 2;
pub global PRIVATE_ORDER_WITH_HOOK: u8 = 3;

#[derive(Deserialize, Eq, Serialize)]
pub struct OrderData {
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub input_token: [u8; 32],
    pub output_token: [u8; 32],
    pub amount_in: [u8; 32],
    pub amount_out: [u8; 32],
    pub sender_nonce: [u8; 32],
    pub origin_domain: u32,
    pub destination_domain: u32,
    pub destination_settler: [u8; 32],
    pub fill_deadline: u32,
    pub order_type: u8,
    pub data: [u8; 32],
}

impl OrderData {
    pub fn decode(bytes: [u8; ORDER_DATA_LENGTH]) -> OrderData {
        let sender = u8_order_data_length_to_u8_32(bytes, 0);
        let recipient = u8_order_data_length_to_u8_32(bytes, 32);
        let input_token = u8_order_data_length_to_u8_32(bytes, 64);
        let output_token = u8_order_data_length_to_u8_32(bytes, 96);
        let amount_in = u8_order_data_length_to_u8_32(bytes, 128);
        let amount_out = u8_order_data_length_to_u8_32(bytes, 160);
        let sender_nonce = u8_order_data_length_to_u8_32(bytes, 192);
        let origin_domain = u8_4_to_u32(u8_order_data_length_to_u8_4(bytes, 224));
        let destination_domain = u8_4_to_u32(u8_order_data_length_to_u8_4(bytes, 228));
        let destination_settler = u8_order_data_length_to_u8_32(bytes, 232);
        let fill_deadline = u8_4_to_u32(u8_order_data_length_to_u8_4(bytes, 264));
        let order_type = u8_order_data_length_to_u8(bytes, 268);
        let data = u8_order_data_length_to_u8_32(bytes, 269);

        OrderData {
            sender,
            recipient,
            input_token,
            output_token,
            amount_in,
            amount_out,
            sender_nonce,
            origin_domain,
            destination_domain,
            destination_settler,
            fill_deadline,
            order_type,
            data,
        }
    }

    pub fn id(self: Self) -> Field {
        let mut fields: [Field; 13] = [0; 13];
        fields[0] = Field::from_be_bytes(self.sender);
        fields[1] = Field::from_be_bytes(self.recipient);
        fields[2] = Field::from_be_bytes(self.input_token);
        fields[3] = Field::from_be_bytes(self.output_token);
        fields[4] = Field::from_be_bytes(self.amount_in);
        fields[5] = Field::from_be_bytes(self.amount_out);
        fields[6] = Field::from_be_bytes(self.sender_nonce);
        fields[7] = self.origin_domain as Field;
        fields[8] = self.destination_domain as Field;
        fields[9] = Field::from_be_bytes(self.destination_settler);
        fields[10] = self.fill_deadline as Field;
        fields[11] = self.order_type as Field;
        fields[12] = Field::from_be_bytes(self.data);
        poseidon2_hash(fields)
    }
}

fn u8_order_data_length_to_u8_32(bytes: [u8; ORDER_DATA_LENGTH], start: u32) -> [u8; 32] {
    let mut result = [0; 32];
    for i in 0..32 {
        result[i] = bytes[start + i];
    }
    result
}

fn u8_order_data_length_to_u8_4(bytes: [u8; ORDER_DATA_LENGTH], start: u32) -> [u8; 4] {
    let mut result = [0; 4];
    for i in 0..4 {
        result[i] = bytes[start + i];
    }
    result
}

fn u8_order_data_length_to_u8(bytes: [u8; ORDER_DATA_LENGTH], start: u32) -> u8 {
    bytes[start]
}
