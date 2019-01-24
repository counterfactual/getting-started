class NodeProvider {
  /**
   * This boolean determines if the NodeProvider has received a MessagePort
   * via the `cf-node-provider:port` message.
   *
   * It is used to prevent attempts to send messages without an instance
   * of MessagePort stored locally.
   */

  constructor() {
    this.isConnected = false;
    this.callback = () => {};
  }

  onMessage(callback) {
    console.log("NodeProvider#onMessage called with", callback);
    this.callback = callback;
  }

  sendMessage(message) {
    if (!this.isConnected) {
      // We fail because we do not have a messagePort available.
      throw new Error(
        "It's not possible to use postMessage() before the NodeProvider is connected. Call the connect() method first."
      );
    }
    
    console.log("message in", message);
    const appInstanceId = `app-instance-${new Date().valueOf()}`;
    switch (message.type) {
      case "proposeInstallVirtual":
        this.sendCallback(
          {
            type: "proposeInstallVirtual",
            result: { appInstanceId },
            requestId: message.requestId
          },
          100
        );

        // then emulate the other party installing...
        this.sendCallback(
          {
            type: "installEvent",
            data: { appInstanceId }
          },
          5000
        );
        break;
      case "getAppInstanceDetails":
        this.sendCallback(
          {
            type: "getAppInstanceDetails",
            result: { appInstance: { id: message.params.appInstanceId } },
            requestId: message.requestId
          },
          1
        );
        break;
      default:
        console.error("Unhandled message in MockNodeProvider:", message);
    }
  }

  sendCallback(message, timeout) {
    setTimeout(() => {
      this.callback(message);
    }, timeout);
  }

  async connect(){
    if (this.isConnected) {
      console.warn("NodeProvider is already connected.");
      return Promise.resolve(this);
    }

    return new Promise((resolve, reject) => {
      return setTimeout(() => {
        this.isConnected = true;
        return resolve(this);
      }, 1000);
    });
  }
}