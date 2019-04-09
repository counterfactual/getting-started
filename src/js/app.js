const HashZero = "0x0000000000000000000000000000000000000000000000000000000000000000";

App = {
  web3Provider: null,
  appInstance: null,
  appInstalling: false,
  contracts: {},
  highRollerState: {
    stage: 0
  },

  init: async function() {
    return await App.initWeb3();
  },

  initWeb3: async function() {
    // Modern dapp browsers...
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      try {
        // Request account access
        await window.ethereum.enable();
      } catch (error) {
        // User denied account access...
        console.error("User denied account access")
      }
    }
    // Legacy dapp browsers...
    else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
    }
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: async function() {
    let res = await fetch('HighRollerApp.json')
    let HighRollerAppArtifact = await res.json();
    App.contracts.HighRollerApp = TruffleContract(HighRollerAppArtifact);
    
    // Set the provider for our contract
    App.contracts.HighRollerApp.setProvider(App.web3Provider);
  
    // Use our contract to retrieve and mark the adopted pets
    App.bindEvents();
    App.setupPlaygroundMessageListeners();

    if (window === window.parent) {
      // dApp not running in iFrame
      window.postMessage(
        {
          type: "PLUGIN_MESSAGE",
          data: { message: "playground:request:user" }
        },
        "*"
      );
    } else {
      window.parent.postMessage("playground:request:user", "*");
    }
  },

  bindEvents: function() {
    const roll = document.querySelector('#rollBtn');
    roll.addEventListener("click", App.roll);
  },

  setupPlaygroundMessageListeners() {
    window.addEventListener("message", async (event) => {
      if (
        event.data.data &&
        typeof event.data.data.message === "string" &&
        event.data.data.message.startsWith("playground:response:user")
      ) {
        console.log("Got Message From MM! ", event.data.data);
        if (event.data.data.message.startsWith("playground:response:user")) {
          const account = event.data.data.data;

          App.setupCF(account);
        }
      }
      if (
        typeof event.data === "string" &&
        event.data.startsWith("playground:response:user")
      ) {
        const [, data] = event.data.split("|");
        const account = JSON.parse(data);
        App.setupCF(account);
      }

      if (
        typeof event.data === "string" &&
        event.data.startsWith("playground:response:appInstance")
      ) {
        const [, data] = event.data.split("|");

        if (data) {
          console.log("Received playground appInstance: ", data);
          const { appInstance } = JSON.parse(data);
          this.updateAppInstance(appInstance);

          this.updateOpponent({
            attributes: {
              // username: this.state.appInstance.initialState.playerNames.find(
              //   username => username !== this.state.account.user.username
              // ),
              nodeAddress: this.state.appInstance.initialState.initiatingAddress
            }
          });

          this.goToWaitingRoom(this.history);
        }
      }
    });
  },

  matchmake: async function() {
    return new Promise(resolve => {
      let gotResponse = false; // Needed because MM sends multiple messages
      const onMatchmakeResponse = (event) => {
        if (event.data.toString().startsWith("playground:response:matchmake")) {
          window.removeEventListener("message", onMatchmakeResponse);

          const [, data] = event.data.split("|");
          resolve(JSON.parse(data));
        }
        if (
          event.data.data &&
          typeof event.data.data.message === "string" &&
          event.data.data.message.startsWith("playground:response:matchmake")
        ) {
          if (gotResponse) {
            return;
          }
          gotResponse = true;
          console.log("MM Matchmake Data! ", event.data.data);
          const opponent = { data: event.data.data.data };
          resolve(opponent);
        }
      };

      window.addEventListener("message", onMatchmakeResponse);

      if (window === window.parent) {
        // dApp not running in iFrame
        window.postMessage(
          {
            type: "PLUGIN_MESSAGE",
            data: { message: "playground:request:matchmake" }
          },
          "*"
        );
      } else {
        window.parent.postMessage("playground:request:matchmake", "*");
      }
    })
  },

  setupCF: async function(account) {
    // let highRollerAppInstance = await App.contracts.HighRollerApp.deployed();
    if (App.appInstalling === true) return;

    App.appInstalling = true;

    let highRollerAppInstance = {
      address: '0x91907355C59BA005843E791c88aAB80b779446c9'
    };
    
    let nodeProvider = new cf.NodeProvider();
    await nodeProvider.connect();

    const matchmakeResult = await App.matchmake();
    
    let cfProvider = new cf.Provider(nodeProvider);
    let appFactory = new cf.AppFactory(highRollerAppInstance.address, {
      actionEncoding: "tuple(uint8 actionType, uint256 number, bytes32 actionHash)",
      stateEncoding: "tuple(address[2] playerAddrs, uint8 stage, bytes32 salt, bytes32 commitHash, uint256 playerFirstNumber, uint256 playerSecondNumber)"
    }, cfProvider);

    let HighRollerStage = {  // TODO double check this works
      PRE_GAME: 0,
      COMMITTING_HASH: 1,
      COMMITTING_NUM: 2,
      REVEALING: 3,
      DONE: 4
    };

    const { HashZero } = ethers.constants;
    const HighRollerBotNodeAddress = matchmakeResult.data.attributes.nodeAddress;

    let initialState = {
      playerAddrs: [
        ethers.utils.HDNode.fromExtendedKey(
          account.user.nodeAddress // FIXME!!! 
        ).derivePath("0").address,
        ethers.utils.HDNode.fromExtendedKey(
          HighRollerBotNodeAddress
        ).derivePath("0").address
      ],
      stage: HighRollerStage.PRE_GAME,
      salt: HashZero,
      commitHash: HashZero,
      playerFirstNumber: 0,
      playerSecondNumber: 0
      // playerNames: [
      //   this.account.user.username,
      //   this.opponent.attributes.username
      // ]
    };

    const INTERMEDIARY_ADDRESS = matchmakeResult.data.attributes.intermediary;
    let betAmount = '0.00001';
  
    await appFactory.proposeInstallVirtual({
      initialState,
      proposedToIdentifier: HighRollerBotNodeAddress,
      asset: {
        assetType: 0 /* AssetType.ETH */
      },
      peerDeposit: ethers.utils.parseEther(betAmount),
      myDeposit: ethers.utils.parseEther(betAmount),
      timeout: 172800,
      intermediaries: [INTERMEDIARY_ADDRESS] // TODO: put the PG Server's address here
    });

    cfProvider.on('installVirtual', (event) => {
      App.appInstance = event.data.appInstance;

      App.revealRoll();
    });

    cfProvider.on('updateState', async ({ data }) => {
      const newState = data.newState;

      const state = {
        ...newState,
        playerFirstNumber: App.playerFirstNumber
      };
  
      console.log(
        "playerFirstNumber",
        state.playerFirstNumber,
        "playerSecondNumber",
        state.playerSecondNumber
      );
  
      let gameState;

      if (!App.playerFirstNumber) { return; }

      if (state.stage === 3) {
        const numberSalt =
        "0xdfdaa4d168f0be935a1e1d12b555995bc5ea67bd33fce1bc5be0a1e0a381fc90";

        return await this.appInstance.takeAction({
          actionType: 3,
          actionHash: numberSalt,
          number: state.playerFirstNumber.toString()
        });
      }
  
      // if (!(
      //   ethers.utils.bigNumberify(state.playerFirstNumber).toNumber() &&
      //   ethers.utils.bigNumberify(state.playerSecondNumber).toNumber() &&
      //   state.stage === 4
      // )) {
      //   // App.updateUIState(state);
      //   return;
      // }
  
      const rolls = await App.highRollerContract(
        state.playerFirstNumber,
        state.playerSecondNumber
      );
  
      const isProposing = state.stage === 4;
      const myRoll = isProposing ? rolls.playerFirstRoll : rolls.playerSecondRoll;
      const opponentRoll = isProposing
        ? rolls.playerSecondRoll
        : rolls.playerFirstRoll;
  
      const totalMyRoll = myRoll[0] + myRoll[1];
      const totalOpponentRoll = opponentRoll[0] + opponentRoll[1];

      if (totalMyRoll > totalOpponentRoll) {
        gameState = 1;
      } else if (totalMyRoll < totalOpponentRoll) {
        gameState = 2;
      } else {
        gameState = 3;
      }
  
      const highRollerState = state;
      const newUIState = {
        myRoll,
        opponentRoll,
        gameState,
        highRollerState
      };
  
      if (state.stage === 4) {
        App.updateUIState(newUIState);

        await App.appInstance.uninstall(INTERMEDIARY_ADDRESS);

        App.revealLoading();
        App.enableButton();
        App.setupCF(account);
      }
    });

    App.installing = false;
  },

  async highRollerContract(
    num1,
    num2
  ) {
    const randomness = ethers.utils.solidityKeccak256(["uint256"], [num1.mul(num2)]);

    // The Contract interface
    const abi = [
      "function highRoller(bytes32 randomness) public pure returns(uint8 playerFirstTotal, uint8 playerSecondTotal)"
    ];

    // Connect to the network
    const provider = new ethers.providers.Web3Provider(web3.currentProvider);

    const contractAddress = "0x91907355C59BA005843E791c88aAB80b779446c9";

    // We connect to the Contract using a Provider, so we will only
    // have read-only access to the Contract
    const contract = new ethers.Contract(contractAddress, abi, provider);

    const result = await contract.highRoller(randomness);

    return {
      playerFirstRoll: App.getDieNumbers(result[0]),
      playerSecondRoll: App.getDieNumbers(result[1])
    };
  },

  getDieNumbers(totalSum) {
    // Choose result for each die.
    if (totalSum === 12) {
      return [6, 6];
    }

    if (totalSum > 2 && totalSum < 12) {
      return [Math.floor(totalSum / 2), Math.ceil(totalSum / 2)];
    }

    if (totalSum > 2 && totalSum % 2 === 0) {
      return [Math.floor(totalSum / 2) - 1, Math.ceil(totalSum / 2) + 1];
    }

    return [totalSum / 2, totalSum / 2];
  },

  roll: async function(event) {
    App.disableButton();

    if (App.highRollerState.stage === 0) {
      const startGameAction = {
        number: 0,
        actionType: 0,
        actionHash: HashZero
      };

      App.highRollerState = (await App.appInstance.takeAction(
        startGameAction
      ));

      // TODO randomize this and save it in proposingPlayer state
      const numberSalt =
        "0xdfdaa4d168f0be935a1e1d12b555995bc5ea67bd33fce1bc5be0a1e0a381fc90";
      const playerFirstNumber =
        1 + Math.floor(Math.random() * Math.floor(1000));
      const hash = ethers.utils.solidityKeccak256(
        ["bytes32", "uint256"],
        [numberSalt, playerFirstNumber]
      );

      const commitHashAction = {
        number: 0,
        actionType: 1,
        actionHash: hash
      };

      App.playerFirstNumber = ethers.utils.bigNumberify(playerFirstNumber);

      App.highRollerState = {
        ...((await App.appInstance.takeAction(
          commitHashAction
        ))),
        playerFirstNumber: App.playerFirstNumber
      };
    } else {
      const playerSecondNumber =
        1 + Math.floor(Math.random() * Math.floor(1000));

      const commitHashAction = {
        number: playerSecondNumber,
        actionType: 2,
        actionHash: HashZero
      };

      App.highRollerState = (await App.appInstance.takeAction(
        commitHashAction
      ));
    }
  },

  updateUIState(state) {
    document.querySelector("#gameResult").innerHTML = App.announceGameState(state.gameState);
    document.querySelector("#yourRoll").innerHTML = `Your roll: ${state.myRoll[0]} + ${state.myRoll[1]}`;
    if (state.opponentRoll) {
      document.querySelector("#opponentRoll").innerHTML = `Their roll: ${state.opponentRoll[0]} + ${state.opponentRoll[1]}`;
    }
  },

  announceGameState(gameState) {
    switch (gameState) {
      case 1: return "You won!!";
      case 2: return "You lost...";
      case 3: return "You tied?";
    }
  },

  revealLoading() {
    document.querySelector("#loadingSection").classList.remove("hidden");
    document.querySelector("#rollSection").classList.add("hidden");
  },

  revealRoll() {
    document.querySelector("#loadingSection").classList.add("hidden");
    document.querySelector("#rollSection").classList.remove("hidden");
  },

  disableButton() {
    document.querySelector('#rollBtn').disabled = true;
  },

  enableButton() {
    document.querySelector('#rollBtn').disabled = false;
  }
};

window.onload = function() {
  App.init();
};