this.window = this.window || {};
this.window.types = (function (exports) {
  'use strict';

  (function (AssetType) {
      AssetType[AssetType["ETH"] = 0] = "ETH";
      AssetType[AssetType["ERC20"] = 1] = "ERC20";
  })(exports.AssetType || (exports.AssetType = {}));

  (function (Node) {
      let ErrorType;
      (function (ErrorType) {
          ErrorType["ERROR"] = "error";
      })(ErrorType = Node.ErrorType || (Node.ErrorType = {}));
      let MethodName;
      (function (MethodName) {
          MethodName["GET_APP_INSTANCES"] = "getAppInstances";
          MethodName["GET_PROPOSED_APP_INSTANCES"] = "getProposedAppInstances";
          MethodName["PROPOSE_INSTALL"] = "proposeInstall";
          MethodName["PROPOSE_INSTALL_VIRTUAL"] = "proposeInstallVirtual";
          MethodName["REJECT_INSTALL"] = "rejectInstall";
          MethodName["INSTALL"] = "install";
          MethodName["INSTALL_VIRTUAL"] = "installVirtual";
          MethodName["GET_STATE"] = "getState";
          MethodName["GET_APP_INSTANCE_DETAILS"] = "getAppInstanceDetails";
          MethodName["TAKE_ACTION"] = "takeAction";
          MethodName["UNINSTALL"] = "uninstall";
          MethodName["PROPOSE_STATE"] = "proposeState";
          MethodName["ACCEPT_STATE"] = "acceptState";
          MethodName["REJECT_STATE"] = "rejectState";
          MethodName["CREATE_MULTISIG"] = "createMultisig";
          MethodName["GET_CHANNEL_ADDRESSES"] = "getChannelAddresses";
      })(MethodName = Node.MethodName || (Node.MethodName = {}));
      let EventName;
      (function (EventName) {
          EventName["INSTALL"] = "installEvent";
          EventName["REJECT_INSTALL"] = "rejectInstallEvent";
          EventName["UPDATE_STATE"] = "updateStateEvent";
          EventName["UNINSTALL"] = "uninstallEvent";
          EventName["PROPOSE_STATE"] = "proposeStateEvent";
          EventName["REJECT_STATE"] = "rejectStateEvent";
          EventName["CREATE_MULTISIG"] = "createMultisigEvent";
      })(EventName = Node.EventName || (Node.EventName = {}));
  })(exports.Node || (exports.Node = {}));

  return exports;

}({}));
