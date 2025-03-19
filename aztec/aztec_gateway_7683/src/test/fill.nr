use crate::AztecGateway7683;
use dep::aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};
use dep::token::Token;

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    env.impersonate(owner);

    let gateway_contract = env.deploy_self("AztecGateway7683").without_initializer();
    let gateway_contract_address = gateway_contract.to_address();
    env.advance_block_by(1);

    let initializer_call_interface = Token::interface().constructor(
        owner,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18,
    );
    // NOTE: in order to import this i had to import aztec-packages via submodules
    let token_contract =
        env.deploy("@token_contract", "Token").with_public_void_initializer(initializer_call_interface);
    let token_contract_address = token_contract.to_address();
    env.advance_block_by(1);

    (&mut env, gateway_contract_address, token_contract_address, owner)
}

#[test]
unconstrained fn test_fill() {
    let (env, gateway_contract_address, token_contract_address) = setup();

    let gateway = AztecGateway7683::at(gateway_contract_address);
    //let token = Token::at(token_contract_address);

    let order_id = [
        16, 84, 240, 39, 102, 119, 88, 167, 100, 2, 170, 151, 152, 140, 99, 164, 58, 58, 158, 132,
        28, 150, 91, 63, 198, 211, 157, 227, 48, 252, 107, 194,
    ];

    let origin_data = [
        222, 71, 201, 178, 126, 184, 211, 0, 219, 181, 242, 195, 83, 230, 50, 195, 147, 38, 44, 240,
        99, 64, 196, 250, 127, 27, 64, 196, 203, 211, 111, 144, 222, 71, 201, 178, 126, 184, 211, 0,
        219, 181, 242, 195, 83, 230, 50, 195, 147, 38, 44, 240, 99, 64, 196, 250, 127, 27, 64, 196,
        203, 211, 111, 144, 222, 71, 201, 178, 126, 184, 211, 0, 219, 181, 242, 195, 83, 230, 50,
        195, 147, 38, 44, 240, 99, 64, 196, 250, 127, 27, 64, 196, 203, 211, 111, 144, 222, 71, 201,
        178, 126, 184, 211, 0, 219, 181, 242, 195, 83, 230, 50, 195, 147, 38, 44, 240, 99, 64, 196,
        250, 127, 27, 64, 196, 203, 211, 111, 144, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 15, 66, 63, 222, 71,
        201, 178, 126, 184, 211, 0, 219, 181, 242, 195, 83, 230, 50, 195, 147, 38, 44, 240, 99, 64,
        196, 250, 127, 27, 64, 196, 203, 211, 111, 144, 255, 255, 255, 255,
    ];

    let fill_data = [0];

    gateway.fill(order_id, origin_data, fill_data).call(&mut env.public());
}
