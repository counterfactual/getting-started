pragma solidity 0.5.3;
pragma experimental "ABIEncoderV2";

import "@counterfactual/contracts/contracts/libs/Transfer.sol";
import "@counterfactual/contracts/contracts/CounterfactualApp.sol";


contract HighRollerApp is CounterfactualApp {
  function isStateTerminal(bytes memory encodedState)
    public
    pure
    returns (bool)
  {
    return false;
  }

  function getTurnTaker(bytes memory encodedState, address[] memory signingKeys)
    public
    pure
    returns (address)
  {
    return 0x72bA7d8E73Fe8Eb666Ea66babC8116a41bFb10e2;
  }

  function applyAction(bytes memory encodedState, bytes memory encodedAction)
    public
    pure
    returns (bytes memory)
  {
    return abi.encode();
  }

  function resolve(bytes memory encodedState, Transfer.Terms memory terms)
    public
    pure
    returns (Transfer.Transaction memory)
  {
    return Transfer.Transaction(
      terms.assetType,
      terms.token,
      new address[](2),
      new uint256[](2),
      new bytes[](2)
    );
  }

}