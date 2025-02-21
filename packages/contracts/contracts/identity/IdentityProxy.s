pragma solidity ^0.4.24;

interface ERC725 {
    event DataChanged(bytes32 indexed key, bytes32 indexed value);
    event OwnerChanged(address indexed ownerAddress);
    event ContractCreated(address indexed contractAddress);

    function changeOwner(address _owner) external;
    function getData(bytes32 _key) external view returns (bytes32 _value);
    function setData(bytes32 _key, bytes32 _value) external;
    function execute(uint256 _operationType, address _to, uint256 _value, bytes _data) external payable;
}

interface ERC20 {
    function approve(address _spender, uint256 _value) external;
    function transferFrom(address from, address to, uint tokens) external;
    function transfer(address to, uint tokens) external returns (bool);
}

contract IdentityProxy is ERC725 {

    uint256 constant OPERATION_CALL = 0;
    uint256 constant OPERATION_CREATE = 1;

    mapping(bytes32 => bytes32) store;

    mapping(address => uint) public nonce;

    // the owner
    address public owner;

    event Forwarded (bytes sig, address signer, address destination, uint value, bytes data, bytes32 _hash);

    modifier onlyOwner() {
        require(owner == 0x0 || msg.sender == owner, "only-owner-allowed");
        _;
    }

    function () external payable {}

    function changeOwner(address _owner)
        public
        onlyOwner
    {
        owner = _owner;
        emit OwnerChanged(owner);
    }

    function getData(bytes32 _key)
        external
        view
        returns (bytes32 _value)
    {
        return store[_key];
    }

    function setData(bytes32 _key, bytes32 _value)
        external
        onlyOwner
    {
        store[_key] = _value;
        emit DataChanged(_key, _value);
    }

    function execute(uint256 _operationType, address _to, uint256 _value, bytes _data)
        external
        payable
        onlyOwner
    {
        if (_operationType == OPERATION_CALL) {
            executeCall(_to, _value, _data);
        } else if (_operationType == OPERATION_CREATE) {
            address newContract = executeCreate(_data);
            emit ContractCreated(newContract);
        } else {
            // We don't want to spend users gas if parametar is wrong
            revert("invalid operationType");
        }
    }

    // copied from GnosisSafe
    // https://github.com/gnosis/safe-contracts/blob/v0.0.2-alpha/contracts/base/Executor.sol
    function executeCall(address to, uint256 value, bytes memory data)
        internal
        returns (bool success)
    {
        // uint256 txGas = 1 ether;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    // copied from GnosisSafe
    // https://github.com/gnosis/safe-contracts/blob/v0.0.2-alpha/contracts/base/Executor.sol
    function executeCreate(bytes memory data)
        internal
        returns (address newContract)
    {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            newContract := create(0, add(data, 0x20), mload(data))
        }
    }

    function getHash(address signer, address to, uint value, bytes data)
        public view
        returns(bytes32)
    {
        return keccak256(abi.encodePacked(signer, to, value, data, nonce[signer]));
    }

    // original forward function copied from https://github.com/uport-project/uport-identity/blob/develop/contracts/Proxy.sol
    function forward(address to, bytes sign, address signer, bytes data) public {
        uint value = 0 ether;

        // the hash contains all of the information about the meta transaction to be called
        bytes32 _hash = getHash(signer, to, value, data);

        // increment the hash so this tx can't run again
        nonce[signer]++;

        // this makes sure signer signed correctly AND signer is a valid bouncer
        require(isSignedByOwner(_hash, sign), "signer-not-owner");

        // execute the call
        if (to == address(this)) {
            // solium-disable-next-line security/no-low-level-calls
            require(address(this).call(data), "forward-execute-failed");
        } else {
            require(executeCall(to, value, data), "forward-execute-failed");
        }
        emit Forwarded(sign, signer, to, value, data, _hash);
    }

    // borrowed from OpenZeppelin's ESDA stuff:
    // https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/cryptography/ECDSA.sol
    function isSignedByOwner(bytes32 _hash, bytes _signature)
        internal view
        returns (bool)
    {
        bytes32 r;
        bytes32 s;
        uint8 v;

        // Check the signature length
        if (_signature.length != 65) {
            return false;
        }

        // Divide the signature in r, s and v variables
        // ecrecover takes the signature parameters, and the only way to get them
        // currently is to use assembly.
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }

        // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
        if (v < 27) {
            v += 27;
        }

        // If the version is correct return the signer address
        if (v != 27 && v != 28) {
            return false;
        } else {
            // solium-disable-next-line arg-overflow
            return owner == ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)), v, r, s);
        }
    }

    function transferToOwner(address _currency, uint _value) public {
        if (msg.sender != owner) {
            // web3.utils.fromAscii('transferToOwner') != web3.utils.fromAscii('disable')
            require(store[0x7472616e73666572546f4f776e6572] != 0x64697361626c65, 'transferToOwner-disabled');
        }
        if (_currency == 0x0) {
            owner.transfer(_value);
        } else {
            require(ERC20(_currency).transfer(owner, _value), 'erc20-transfer-fail');
        }
    }

    function swapAndMakeOffer(
        address _owner,
        address _marketplace,
        bytes _offer,
        address _exchange,
        bytes _swap,
        address _token,
        uint _value
    )
        public
        payable
    {
        changeOwner(_owner);
        executeCall(_exchange, msg.value, _swap);
        ERC20(_token).approve(_marketplace, _value);
        executeCall(_marketplace, 0, _offer);
    }

    function transferTokenMarketplaceExecute(
        address _owner,
        address _marketplace,
        bytes _offer,
        address _token,
        uint _value
    )
        public
        payable
    {
        changeOwner(_owner);
        ERC20(_token).transferFrom(_owner, this, _value);
        ERC20(_token).approve(_marketplace, _value);
        require(executeCall(_marketplace, 0, _offer), 'marketplace-token-failed');
    }

    function marketplaceExecute(
        address _owner,
        address _marketplace,
        bytes _offer,
        address _token,
        uint _value
    )
        public
        payable
    {
        changeOwner(_owner);
        ERC20(_token).approve(_marketplace, _value);
        require(executeCall(_marketplace, 0, _offer), 'marketplace-exec-failed');
    }

    function marketplaceFinalizeAndPay(
        address _marketplace,
        bytes _finalize,
        address _seller,
        address _currency,
        uint _value
    )
        public
    {
        require(msg.sender == address(this), 'finalize-pay-internal');
        require(executeCall(_marketplace, 0, _finalize), 'finalize-pay-failed');
        IdentityProxy(_seller).transferToOwner(_currency, _value);
    }

    function changeOwnerAndExecute(
        address _owner,
        address _to,
        uint256 _value,
        bytes _data
    )
        public
        payable
    {
        changeOwner(_owner);
        require(executeCall(_to, _value, _data), "change-owner-exec-failed");
    }
}
