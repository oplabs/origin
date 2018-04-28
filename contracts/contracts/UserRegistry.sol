pragma solidity ^0.4.21;

import './identity/ClaimHolderPresigned.sol';

/// @title UserRegistry
/// @dev Used to keep registry of user identifies
/// @author Matt Liu <matt@originprotocol.com>, Josh Fraser <josh@originprotocol.com>, Stan James <stan@originprotocol.com>

contract UserRegistry {
    /*
    * Events
    */

    event NewUser(address _address, address _identity);

    /*
    * Storage
    */

    // Mapping from ethereum wallet to ERC725 identity
    mapping(address => address) public users;

    /*
    * Public functions
    */

    /// @dev create(): Create a user
    // Params correspond to params of ClaimHolderPresigned
    function createWithClaims(
        uint256[] _claimType,
        address[] _issuer,
        bytes _signature,
        bytes _data
    )
        public
    {
        ClaimHolderPresigned _identity = new ClaimHolderPresigned(
          _claimType,
          _issuer,
          _signature,
          _data
        );
        users[msg.sender] = _identity;
        emit NewUser(msg.sender, _identity);
    }

    /// @dev get(): returns and existing user associated with wallet id
    // @param wallet id
    function get(
        string _id
    )
        public
        pure
        returns (string)
    {
        return _id;
    }
}
