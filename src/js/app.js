const { HashZero } = ethers.constants;
const { bigNumberify, parseEther, solidityKeccak256 } = ethers.utils;
const { fromExtendedKey } = ethers.utils.HDNode;

const HighRollerAction = {
  START_GAME: 0,
  COMMIT_TO_HASH: 1,
  COMMIT_TO_NUM: 2,
  REVEAL: 3
}

const HighRollerStage = {
  PRE_GAME: 0,
  COMMITTING_HASH: 1,
  COMMITTING_NUM: 2,
  REVEALING: 3,
  DONE: 4
};

const abi = [
  "function highRoller(bytes32 randomness) public pure returns(uint8 playerFirstTotal, uint8 playerSecondTotal)"
];
const contractAddress = '0x91907355C59BA005843E791c88aAB80b779446c9';

let web3Provider, nodeProvider, currentGame, account;

async function run() {
  account = await getUserData();
  
  bindEvents();
  await initWeb3();
  await initContract();
  await setupCF();
  await install();
}


// GENERAL ETH SETUP
function bindEvents() {
  document.querySelector('#rollBtn').addEventListener("click", roll);
}

async function initWeb3() {
  // Modern dapp browsers...
  if (window.ethereum) {
    web3Provider = window.ethereum;
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
    web3Provider = window.web3.currentProvider;
  }
  // If no injected web3 instance is detected, fall back to Ganache
  else {
    web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
  }
  web3 = new Web3(web3Provider);
}

async function initContract() {
  let res = await fetch('HighRollerApp.json')
  let HighRollerAppArtifact = await res.json();
  let HighRollerApp = TruffleContract(HighRollerAppArtifact);
  
  // Set the provider for our contract
  HighRollerApp.setProvider(web3Provider);
}


// COUNTERFACTUAL
async function setupCF() {
  nodeProvider = new cf.NodeProvider();
  await nodeProvider.connect();
}

async function install() {
  resetGameState();
  
  let cfProvider = new cf.Provider(nodeProvider);
  let appFactory = new cf.AppFactory(contractAddress, {
    actionEncoding: "tuple(uint8 actionType, uint256 number, bytes32 actionHash)",
    stateEncoding: "tuple(address[2] playerAddrs, uint8 stage, bytes32 salt, bytes32 commitHash, uint256 playerFirstNumber, uint256 playerSecondNumber)"
  }, cfProvider);

  proposeInstall(appFactory);

  cfProvider.on('installVirtual', onInstallEvent);
  cfProvider.on('updateState', onUpdateEvent);
}

async function proposeInstall(appFactory) {
  const { intermediary, nodeAddress } = await getOpponentData();
  const betAmount = '0.00001';

  await appFactory.proposeInstallVirtual({
    initialState: {
      playerAddrs: [
        deriveAddress(
          account.nodeAddress
        ),
        deriveAddress(
          nodeAddress
        )
      ],
      stage: HighRollerStage.PRE_GAME,
      salt: HashZero,
      commitHash: HashZero,
      playerFirstNumber: 0,
      playerSecondNumber: 0
    },
    proposedToIdentifier: nodeAddress,
    asset: {
      assetType: 0 /* AssetType.ETH */
    },
    peerDeposit: parseEther(betAmount),
    myDeposit: parseEther(betAmount),
    timeout: 172800,
    intermediaries: [intermediary]
  });
}

async function onInstallEvent(event) {
  currentGame.appInstance = event.data.appInstance;

  revealButton();
}

async function onUpdateEvent({ data }) {
  const highRollerState = {
    ...data.newState,
    playerFirstNumber: currentGame.playerFirstNumber
  };

  if (highRollerState.stage === HighRollerStage.REVEALING) {
    await revealDice(highRollerState);
  } else if (highRollerState.stage === HighRollerStage.DONE) {
    await completeGame(highRollerState);
  }
}

async function revealDice(highRollerState) {
  await currentGame.appInstance.takeAction({
    actionType: HighRollerAction.REVEAL,
    actionHash: currentGame.salt,
    number: highRollerState.playerFirstNumber.toString()
  });
}

async function completeGame(highRollerState) {
  const rolls = await executeContract(
    highRollerState.playerFirstNumber,
    highRollerState.playerSecondNumber
  );

  const { myRoll, opponentRoll } = determineRolls(highRollerState, rolls);
  const gameState = determineGameState(myRoll, opponentRoll);

  updateUIState({
    myRoll,
    opponentRoll,
    gameState,
    highRollerState
  });

  await currentGame.appInstance.uninstall(currentGame.appInstance.intermediaries[0]);

  resetApp();
}

async function roll() {
  disableButton();

  if (currentGame.highRollerState.stage === HighRollerStage.PRE_GAME) {
    await takeAction({
      number: 0,
      actionType: HighRollerAction.START_GAME,
      actionHash: HashZero
    });

    const playerFirstNumber = generatePlayerNumber();

    await takeAction({
      number: 0,
      actionType: HighRollerAction.COMMIT_TO_HASH,
      actionHash: solidityKeccak256(
        ["bytes32", "uint256"],
        [currentGame.salt, playerFirstNumber]
      )
    });

    currentGame.highRollerState.playerFirstNumber = currentGame.playerFirstNumber = bigNumberify(playerFirstNumber);
  } else {
    await takeAction({
      number: generatePlayerNumber(),
      actionType: HighRollerAction.COMMIT_TO_NUM,
      actionHash: HashZero
    });
  }
}

async function takeAction(params) {
  currentGame.highRollerState = (await currentGame.appInstance.takeAction(
    params
  ));
}


// CONTRACT EXECUTION
async function executeContract(
  num1,
  num2
) {
  const randomness = solidityKeccak256(["uint256"], [num1.mul(num2)]);

  // Connect to the network
  const provider = new ethers.providers.Web3Provider(web3.currentProvider);

  // We connect to the Contract using a Provider, so we will only
  // have read-only access to the Contract
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const result = await contract.highRoller(randomness);

  return {
    playerFirstRoll: getDieNumbers(result[0]),
    playerSecondRoll: getDieNumbers(result[1])
  };
}

function getDieNumbers(totalSum) {
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
}


// UI
function updateUIState(uiState) {
  document.querySelector("#gameResult").innerHTML = announceGameState(uiState.gameState);
  document.querySelector("#yourRoll").innerHTML = `Your roll: ${uiState.myRoll[0]} + ${uiState.myRoll[1]}`;
  document.querySelector("#opponentRoll").innerHTML = `Their roll: ${uiState.opponentRoll[0]} + ${uiState.opponentRoll[1]}`;
}

function announceGameState(gameState) {
  switch (gameState) {
    case 1: return "You won!!";
    case 2: return "You lost...";
    case 3: return "You tied?";
  }
}

function hideButton() {
  document.querySelector("#loadingSection").classList.remove("hidden");
  document.querySelector("#rollSection").classList.add("hidden");
}

function revealButton() {
  document.querySelector("#loadingSection").classList.add("hidden");
  document.querySelector("#rollSection").classList.remove("hidden");
}

function disableButton() {
  document.querySelector('#rollBtn').disabled = true;
}

function enableButton() {
  document.querySelector('#rollBtn').disabled = false;
}


// UTILS
function deriveAddress(nodeAddress) {
  return fromExtendedKey(
    nodeAddress
  ).derivePath("0").address
}

function generatePlayerNumber() {
  return 1 + Math.floor(Math.random() * Math.floor(1000));
}

function determineRolls(newState, rolls) {
  const isProposing = newState.stage === HighRollerStage.REVEALING;
  const myRoll = isProposing ? rolls.playerFirstRoll : rolls.playerSecondRoll;
  const opponentRoll = isProposing
    ? rolls.playerSecondRoll
    : rolls.playerFirstRoll;
  
  return { myRoll, opponentRoll };
}

function determineGameState(myRoll, opponentRoll) {
  const totalMyRoll = myRoll[0] + myRoll[1];
  const totalOpponentRoll = opponentRoll[0] + opponentRoll[1];

  if (totalMyRoll > totalOpponentRoll) {
    return 1;
  } else if (totalMyRoll < totalOpponentRoll) {
    return 2;
  } else {
    return 3;
  }
}

function resetGameState() {
  currentGame = {
    highRollerState: {
      stage: HighRollerStage.PRE_GAME
    },
    salt: generateSalt()
  };
}

function resetApp() {
  hideButton();
  enableButton();
  install();
}

function generateSalt() {
  return ethers.utils.bigNumberify(ethers.utils.randomBytes(32)).toHexString();
}

async function getUserData() {
  return (await requestDataFromPG("playground:request:user", "playground:response:user")).data.user;
}

async function getOpponentData() {
  return (await requestDataFromPG("playground:request:matchmake", "playground:response:matchmake")).data.attributes;
}

async function requestDataFromPG(requestName, responseName) {
  return await new Promise(resolve => {
    const onPGResponse = (event) => {
      if (event.data.toString().startsWith(responseName)) {
        window.removeEventListener("message", onPGResponse);

        const [, data] = event.data.split("|");
        resolve(JSON.parse(data));
      } else if (
        event.data.data &&
        typeof event.data.data.message === "string" &&
        event.data.data.message.startsWith(responseName)
      ) {
        window.removeEventListener("message", onPGResponse);

        resolve({ data: event.data.data.data });
      }
    };

    window.addEventListener("message", onPGResponse);

    if (window === window.parent) {
      // dApp not running in iFrame
      window.postMessage(
        {
          type: "PLUGIN_MESSAGE",
          data: { message: requestName }
        },
        "*"
      );
    } else {
      window.parent.postMessage(requestName, "*");
    }
  })
}


// AND GO!!
window.onload = function() {
  run();
};