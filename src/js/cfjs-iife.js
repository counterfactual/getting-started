this.window.cuid = function () {
    return "123";
};
this.window = this.window || {};
this.window.cf = (function (exports, types, utils, cuid, EventEmitter) {
  'use strict';

  cuid = cuid && cuid.hasOwnProperty('default') ? cuid['default'] : cuid;
  EventEmitter = EventEmitter && EventEmitter.hasOwnProperty('default') ? EventEmitter['default'] : EventEmitter;

  var EventType;
  (function (EventType) {
      EventType["INSTALL"] = "install";
      EventType["REJECT_INSTALL"] = "rejectInstall";
      EventType["UNINSTALL"] = "uninstall";
      EventType["UPDATE_STATE"] = "updateState";
      EventType["CREATE_MULTISIG"] = "createMultisig";
      EventType["ERROR"] = "error";
  })(EventType || (EventType = {}));



  var types$1 = /*#__PURE__*/Object.freeze({
    get EventType () { return EventType; }
  });

  function parseBigNumber(val, paramName) {
      try {
          return new utils.BigNumber(val);
      }
      catch (e) {
          throw {
              type: EventType.ERROR,
              data: {
                  errorName: "invalid_param",
                  message: `Invalid value for parameter '${paramName}': ${val}`,
                  extra: {
                      paramName,
                      originalError: e
                  }
              }
          };
      }
  }
  class AppFactory {
      constructor(appId, encodings, provider) {
          this.appId = appId;
          this.encodings = encodings;
          this.provider = provider;
      }
      async proposeInstall(params) {
          const timeout = parseBigNumber(params.timeout, "timeout");
          const myDeposit = parseBigNumber(params.myDeposit, "myDeposit");
          const peerDeposit = parseBigNumber(params.peerDeposit, "peerDeposit");
          const response = await this.provider.callRawNodeMethod(types.Node.MethodName.PROPOSE_INSTALL, {
              timeout,
              peerDeposit,
              myDeposit,
              asset: params.asset,
              respondingAddress: params.respondingAddress,
              initialState: params.initialState,
              appId: this.appId,
              abiEncodings: this.encodings
          });
          const { appInstanceId } = response.result;
          return appInstanceId;
      }
      async proposeInstallVirtual(params) {
          const timeout = parseBigNumber(params.timeout, "timeout");
          const myDeposit = parseBigNumber(params.myDeposit, "myDeposit");
          const peerDeposit = parseBigNumber(params.peerDeposit, "peerDeposit");
          const response = await this.provider.callRawNodeMethod(types.Node.MethodName.PROPOSE_INSTALL_VIRTUAL, {
              timeout,
              peerDeposit,
              myDeposit,
              asset: params.asset,
              respondingAddress: params.respondingAddress,
              initialState: params.initialState,
              intermediaries: params.intermediaries,
              appId: this.appId,
              abiEncodings: this.encodings
          });
          const { appInstanceId } = response.result;
          return appInstanceId;
      }
  }

  var AppInstanceEventType;
  (function (AppInstanceEventType) {
      AppInstanceEventType["UPDATE_STATE"] = "updateState";
      AppInstanceEventType["UNINSTALL"] = "uninstall";
      AppInstanceEventType["ERROR"] = "error";
  })(AppInstanceEventType || (AppInstanceEventType = {}));
  class AppInstance {
      constructor(info, provider) {
          this.provider = provider;
          this.eventEmitter = new EventEmitter();
          this.id = info.id;
          this.appId = info.appId;
          this.abiEncodings = info.abiEncodings;
          this.asset = info.asset;
          this.myDeposit = info.myDeposit;
          this.peerDeposit = info.peerDeposit;
          this.timeout = info.timeout;
          this.intermediaries = info.intermediaries;
      }
      get isVirtual() {
          return !!(this.intermediaries && this.intermediaries.length !== 0);
      }
      async getState() {
          const response = await this.provider.callRawNodeMethod(types.Node.MethodName.GET_STATE, {
              appInstanceId: this.id
          });
          const result = response.result;
          return result.state;
      }
      async takeAction(action) {
          const response = await this.provider.callRawNodeMethod(types.Node.MethodName.TAKE_ACTION, {
              action,
              appInstanceId: this.id
          });
          const result = response.result;
          return result.newState;
      }
      async uninstall() {
          await this.provider.callRawNodeMethod(types.Node.MethodName.UNINSTALL, {
              appInstanceId: this.id
          });
      }
      on(eventType, callback) {
          this.eventEmitter.on(eventType, callback);
      }
      once(eventType, callback) {
          this.eventEmitter.once(eventType, callback);
      }
      off(eventType, callback) {
          this.eventEmitter.off(eventType, callback);
      }
      emit(eventType, event) {
          this.eventEmitter.emit(eventType, event);
      }
  }

  const NODE_REQUEST_TIMEOUT = 1500;
  class Provider {
      constructor(nodeProvider) {
          this.nodeProvider = nodeProvider;
          this.requestListeners = {};
          this.eventEmitter = new EventEmitter();
          this.appInstances = {};
          this.nodeProvider.onMessage(this.onNodeMessage.bind(this));
          this.setupAppInstanceEventListeners();
      }
      async getAppInstances() {
          const response = await this.callRawNodeMethod(types.Node.MethodName.GET_APP_INSTANCES, {});
          const result = response.result;
          return Promise.all(result.appInstances.map(info => this.getOrCreateAppInstance(info.id, info)));
      }
      async install(appInstanceId) {
          const response = await this.callRawNodeMethod(types.Node.MethodName.INSTALL, {
              appInstanceId
          });
          const { appInstance } = response.result;
          return this.getOrCreateAppInstance(appInstanceId, appInstance);
      }
      async installVirtual(appInstanceId, intermediaries) {
          const response = await this.callRawNodeMethod(types.Node.MethodName.INSTALL_VIRTUAL, {
              appInstanceId,
              intermediaries
          });
          const { appInstance } = response.result;
          return this.getOrCreateAppInstance(appInstanceId, appInstance);
      }
      async rejectInstall(appInstanceId) {
          await this.callRawNodeMethod(types.Node.MethodName.REJECT_INSTALL, {
              appInstanceId
          });
      }
      on(eventType, callback) {
          this.eventEmitter.on(eventType, callback);
      }
      once(eventType, callback) {
          this.eventEmitter.once(eventType, callback);
      }
      off(eventType, callback) {
          this.eventEmitter.off(eventType, callback);
      }
      async callRawNodeMethod(methodName, params) {
          const requestId = cuid();
          return new Promise((resolve, reject) => {
              const request = {
                  requestId,
                  params,
                  type: methodName
              };
              this.requestListeners[requestId] = response => {
                  if (response.type === types.Node.ErrorType.ERROR) {
                      return reject({
                          type: EventType.ERROR,
                          data: response.data
                      });
                  }
                  if (response.type !== methodName) {
                      return reject({
                          type: EventType.ERROR,
                          data: {
                              errorName: "unexpected_message_type",
                              message: `Unexpected response type. Expected ${methodName}, got ${response.type}`
                          }
                      });
                  }
                  resolve(response);
              };
              setTimeout(() => {
                  if (this.requestListeners[requestId] !== undefined) {
                      reject({
                          type: EventType.ERROR,
                          data: {
                              errorName: "request_timeout",
                              message: `Request timed out: ${JSON.stringify(request)}`
                          }
                      });
                      delete this.requestListeners[requestId];
                  }
              }, NODE_REQUEST_TIMEOUT);
              this.nodeProvider.sendMessage(request);
          });
      }
      async getOrCreateAppInstance(id, info) {
          if (!(id in this.appInstances)) {
              let newInfo;
              if (info) {
                  newInfo = info;
              }
              else {
                  const { result } = await this.callRawNodeMethod(types.Node.MethodName.GET_APP_INSTANCE_DETAILS, { appInstanceId: id });
                  newInfo = result.appInstance;
              }
              this.appInstances[id] = new AppInstance(newInfo, this);
          }
          return this.appInstances[id];
      }
      onNodeMessage(message) {
          const type = message.type;
          if (Object.values(types.Node.ErrorType).indexOf(type) !== -1) {
              this.handleNodeError(message);
          }
          else if (message.requestId) {
              this.handleNodeMethodResponse(message);
          }
          else {
              this.handleNodeEvent(message);
          }
      }
      handleNodeError(error) {
          const requestId = error.requestId;
          if (requestId && this.requestListeners[requestId]) {
              this.requestListeners[requestId](error);
              delete this.requestListeners[requestId];
          }
          this.eventEmitter.emit(error.type, error);
      }
      handleNodeMethodResponse(response) {
          const { requestId } = response;
          if (requestId in this.requestListeners) {
              this.requestListeners[requestId](response);
              delete this.requestListeners[requestId];
          }
          else {
              const error = {
                  type: EventType.ERROR,
                  data: {
                      errorName: "orphaned_response",
                      message: `Response has no corresponding inflight request: ${JSON.stringify(response)}`
                  }
              };
              this.eventEmitter.emit(error.type, error);
          }
      }
      async handleNodeEvent(nodeEvent) {
          switch (nodeEvent.type) {
              case types.Node.EventName.REJECT_INSTALL:
                  return this.handleRejectInstallEvent(nodeEvent);
              case types.Node.EventName.UPDATE_STATE:
                  return this.handleUpdateStateEvent(nodeEvent);
              case types.Node.EventName.UNINSTALL:
                  return this.handleUninstallEvent(nodeEvent);
              case types.Node.EventName.INSTALL:
                  return this.handleInstallEvent(nodeEvent);
              default:
                  return this.handleUnexpectedEvent(nodeEvent);
          }
      }
      handleUnexpectedEvent(nodeEvent) {
          const event = {
              type: EventType.ERROR,
              data: {
                  errorName: "unexpected_event_type",
                  message: `Unexpected event type: ${nodeEvent.type}: ${JSON.stringify(nodeEvent)}`
              }
          };
          return this.eventEmitter.emit(event.type, event);
      }
      async handleInstallEvent(nodeEvent) {
          const { appInstanceId } = nodeEvent.data;
          const appInstance = await this.getOrCreateAppInstance(appInstanceId);
          const event = {
              type: EventType.INSTALL,
              data: {
                  appInstance
              }
          };
          return this.eventEmitter.emit(event.type, event);
      }
      async handleUninstallEvent(nodeEvent) {
          const { appInstance: info } = nodeEvent.data;
          const appInstance = await this.getOrCreateAppInstance(info.id, info);
          const event = {
              type: EventType.UNINSTALL,
              data: {
                  appInstance
              }
          };
          return this.eventEmitter.emit(event.type, event);
      }
      async handleUpdateStateEvent(nodeEvent) {
          const { appInstanceId, action, newState, oldState } = nodeEvent.data;
          const appInstance = await this.getOrCreateAppInstance(appInstanceId);
          const event = {
              type: EventType.UPDATE_STATE,
              data: {
                  action,
                  newState,
                  oldState,
                  appInstance
              }
          };
          return this.eventEmitter.emit(event.type, event);
      }
      async handleRejectInstallEvent(nodeEvent) {
          const data = nodeEvent.data;
          const info = data.appInstance;
          const appInstance = await this.getOrCreateAppInstance(info.id, info);
          const event = {
              type: EventType.REJECT_INSTALL,
              data: {
                  appInstance
              }
          };
          return this.eventEmitter.emit(event.type, event);
      }
      setupAppInstanceEventListeners() {
          this.on(EventType.UPDATE_STATE, event => {
              const { appInstance } = event.data;
              appInstance.emit(AppInstanceEventType.UPDATE_STATE, event);
          });
          this.on(EventType.UNINSTALL, event => {
              const { appInstance } = event.data;
              appInstance.emit(AppInstanceEventType.UNINSTALL, event);
          });
          this.on(EventType.ERROR, async (event) => {
              const { appInstanceId } = event.data;
              if (appInstanceId) {
                  const instance = await this.getOrCreateAppInstance(appInstanceId);
                  instance.emit(AppInstanceEventType.ERROR, event);
              }
          });
      }
  }

  function encode(types$$1, values) {
      return utils.defaultAbiCoder.encode(types$$1, values);
  }
  function decode(types$$1, data) {
      return utils.defaultAbiCoder.decode(types$$1, data);
  }
  function encodePacked(types$$1, values) {
      return utils.solidityPack(types$$1, values);
  }

  var abi = /*#__PURE__*/Object.freeze({
    encode: encode,
    decode: decode,
    encodePacked: encodePacked
  });

  function signaturesToBytes(...signatures) {
      return signatures
          .map(utils.joinSignature)
          .map(s => s.substr(2))
          .reduce((acc, v) => acc + v, "0x");
  }
  function sortSignaturesBySignerAddress(digest, signatures) {
      const ret = signatures.slice();
      ret.sort((sigA, sigB) => {
          const addrA = utils.recoverAddress(digest, signaturesToBytes(sigA));
          const addrB = utils.recoverAddress(digest, signaturesToBytes(sigB));
          return new utils.BigNumber(addrA).lt(addrB) ? -1 : 1;
      });
      return ret;
  }
  function signaturesToBytesSortedBySignerAddress(digest, ...signatures) {
      return signaturesToBytes(...sortSignaturesBySignerAddress(digest, signatures));
  }



  var utils$1 = /*#__PURE__*/Object.freeze({
    abi: abi,
    signaturesToBytes: signaturesToBytes,
    signaturesToBytesSortedBySignerAddress: signaturesToBytesSortedBySignerAddress
  });

  const cf = {
      AppFactory,
      Provider,
      types: types$1,
      utils: utils$1
  };

  exports.AppFactory = AppFactory;
  exports.Provider = Provider;
  exports.types = types$1;
  exports.utils = utils$1;
  exports.default = cf;

  return exports;

}({}, types, ethers.utils, cuid, EventEmitter));
