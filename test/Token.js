const BigNumber = require('bignumber.js');
var Crowdfund = artifacts.require("./Crowdfund.sol");
var Token = artifacts.require("./Token.sol");
const { assertRevert } = require('./helpers/assertRevert');

const utils = require("./utils")

contract('Token', function (accounts) {

  function bigNumberize(num, decimals) {
    return new BigNumber(num).times(new BigNumber(10).pow(decimals));
  }

  async function jumpToTheFuture(seconds) {
    return web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [seconds],
      id: 0
    });
  }

  async function getTimestampOfCurrentBlock() {
    return web3.eth.getBlock(web3.eth.blockNumber).timestamp;
  }

  function isException(error) {
    let strError = error.toString();
    return strError.includes('invalid opcode') || strError.includes('invalid JUMP') || strError.includes("revert");
  }

  function ensureException(error) {
    assert(isException(error), error.toString());
  }

  const gasAmount = 6000000;
  const owner = accounts[0];
  const receivingAccount = accounts[1];
  const forwardAddress = accounts[7]
  const customer1 = accounts[2];
  const customer2 = accounts[3];
  const customer3 = accounts[4];
  const customer4 = accounts[5];
  const customer5 = accounts[6]

  const twentyEightDaysInSeconds = 2419200;
  const prices = [1000, 750, 500, 250] // 1*10^18 * 1000
  const epochs = [3, 4, 7, 14]
  const totalDays = 28
  const allocationAddresses = [forwardAddress, customer5, customer4, customer2, customer1, "0x0"]
  const allocationBalances = [
    50000000000000000000000,
    100000000000000000000000,
    50000000000000000000000,
    200000000000000000000000,
    100000000000000000000000,
    500000000000000000000000
  ]
  const allocationTimelocks = [0, twentyEightDaysInSeconds, 10 * 24 * 60 * 60, 10 * 24 * 60 * 60, 15 * 24 * 60 * 60, 0]
  const totalSupply_ = 1000000000000000000000000
  const withCrowdfund = false
  const crowdfundArgs = [
    owner,
    epochs,
    prices,
    receivingAccount,
    forwardAddress,
    totalDays,
    totalSupply_,
    withCrowdfund,
    allocationAddresses,
    allocationBalances,
    allocationTimelocks
  ]

  it("Test Bad Constructor Values", async () => {
      let tokenArguments = [
          owner,
          100,
          [owner, accounts[2], accounts[3]],
          [50, 30, 10], // doesnt equal total supply
          [0,0,0]
      ]
      // Bad totals value
      await assertRevert(Token.new(...tokenArguments, {from: owner}));

      // Uneven length of lists for params
      tokenArguments[3] = [50,30]
      await assertRevert(Token.new(...tokenArguments, {from: owner}));
  });


  it("Init: The contract is initialized with the right variables", async () => {
    // Crowdfund.class_defaults
    const crowdfund = await Crowdfund.new(
      ...crowdfundArgs, {
        from: owner
      }
    )

    const token = await Token.at(await crowdfund.token());

    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const crowdfundAddress = await token.crowdfundAddress();
    const tokensLocked = await token.tokensLocked();
    const tokenOwner = await token.owner();
    const totalSupply = await token.totalSupply();

    assert.equal(name, "NAME", "The contract has the right name");
    assert.equal(symbol, "SYMBOL", "The contract has the right symbol");
    assert.equal(decimals, 18, "The contract has the right decimals");
    assert.equal(crowdfundAddress, crowdfund.address, "The contract has the right crowdfund address");
    assert.equal(tokensLocked, true, "Tokens are locked");
    assert.equal(owner, tokenOwner, "Owner is the right account");
    assert.equal(totalSupply.eq(totalSupply), true, "Total supply is equal");

    for (var i = 0; i < allocationBalances.length; i++) {
      let address = allocationAddresses[i]
      if (address === '0x0') {
        address = crowdfundAddress
      }
      let allocations = await token.allocations(address);
      assert.equal(allocations[0].eq(allocationBalances[i]), true, "Allocation balance is right");
      assert.equal(allocations[1].eq(allocationTimelocks[i]), true, "Allocation timelock is right");
    }
    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
  });


  it("Transfer: It tests the transfer function", async () => {
    const crowdfund = await Crowdfund.new(
      ...crowdfundArgs, {
        from: owner
      }
    )
    const token = await Token.at(await crowdfund.token());

    try {
      await token.transfer(customer1, web3.toWei(2, 'ether'), {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    const startTime = await getTimestampOfCurrentBlock() + 100
    // Start the crowdfund now
    await crowdfund.scheduleCrowdfund(startTime, {
      from: owner
    })
    await jumpToTheFuture(101)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })

    assert.equal(await crowdfund.isActivated(), true, "Crowdfund should be active")
    assert.equal((await token.crowdFundStartTime()).eq(startTime), true, "Token should have the right start time")
    // Buy tokens
    await crowdfund.buyTokens(owner, {
      from: owner,
      value: web3.toWei('1', 'ether')
    })

    assert.equal((await token.balanceOf(owner)).eq(bigNumberize(prices[0], 18)), true, "Should equal")

    try {
      await token.transfer(customer1, web3.toWei(2, 'ether'), {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    // Jump in the future
    await jumpToTheFuture(totalDays * 24 * 60 * 60 + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })

    // close the crowdfund
    await crowdfund.closeCrowdfund({
      from: owner
    })

    assert.equal(await crowdfund.crowdfundFinalized(), true, "Crowdfund should NOT be active")

    assert.equal(await token.tokensLocked(), false, "Tokens should be unlocked")

    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })



    await token.transfer(customer1, web3.toWei(2, 'ether'), {
      from: owner
    })

    assert.equal((await token.balanceOf(customer1)).eq(bigNumberize(2, 18)), true, "Should equal")
    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
  });

  it("TransferFrom: It tests the transferFrom function", async () => {
    const crowdfund = await Crowdfund.new(
      ...crowdfundArgs, {
        from: owner
      }
    )
    const token = await Token.at(await crowdfund.token());

    await token.approve(customer1, web3.toWei(2, 'ether'), {
      from: owner
    })
    try {
      await token.transferFrom(owner, customer1, web3.toWei(2, 'ether'), {
        from: customer1
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    // Start the crowdfund now
    await crowdfund.scheduleCrowdfund(await getTimestampOfCurrentBlock(), {
      from: owner
    })

    assert.equal(await crowdfund.isActivated(), true, "Crowdfund should be active")
    // Buy tokens
    await crowdfund.buyTokens(owner, {
      from: owner,
      value: web3.toWei('1', 'ether')
    })

    assert.equal((await token.balanceOf(owner)).eq(bigNumberize(prices[0], 18)), true, "Should equal")

    try {
      await token.transferFrom(owner, customer1, web3.toWei(2, 'ether'), {
        from: customer1
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    // Jump in the future
    await jumpToTheFuture(totalDays * 24 * 60 * 60 + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })

    // close the crowdfund
    await crowdfund.closeCrowdfund({
      from: owner
    })

    assert.equal(await crowdfund.crowdfundFinalized(), true, "Crowdfund should NOT be active")

    assert.equal(await token.tokensLocked(), false, "Tokens should be unlocked")

    await jumpToTheFuture(2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })


    await token.transferFrom(owner, customer1, web3.toWei(2, 'ether'), {
      from: customer1
    })

    assert.equal((await token.balanceOf(customer1)).eq(bigNumberize(2, 18)), true, "Should equal")
    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
  });

  it("MoveAllocation: It tests the moveAllocation function", async () => {

    currentTime = await getTimestampOfCurrentBlock()
    const crowdfund = await Crowdfund.new(
      owner,
      epochs,
      prices,
      receivingAccount,
      forwardAddress,
      totalDays,
      totalSupply_,
      withCrowdfund,
      [forwardAddress, customer5, customer4, customer2, customer1, "0x0"],
      allocationBalances,
      [0, twentyEightDaysInSeconds, 10 * 24 * 60 * 60, 10 * 24 * 60 * 60, 15 * 24 * 60 * 60, 0], {
        from: owner
      }
    )
    const token = await Token.at(await crowdfund.token());
    // First allocation should be able to move (timelock of 0) -- but won't as the crowdfund is not scheduled

    let amountToRelease = web3.toWei(1, 'ether')

    try {
      await token.moveAllocation(customer4, amountToRelease, {
        from: customer5
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }

    // Start the crowdfund now
    await crowdfund.scheduleCrowdfund(await getTimestampOfCurrentBlock() + 100, {
      from: owner
    })
    await jumpToTheFuture(102)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })

    assert.equal(await crowdfund.isActivated(), true, "Crowdfund should be active")

    let totalSupplyBeforeMove = await token.totalSupply();
    // Buy tokens (Means the crowdfund allocation works)
    await crowdfund.buyTokens(owner, {
      from: owner,
      value: amountToRelease
    })
    assert.equal((await token.balanceOf(owner)).eq(bigNumberize(prices[0], 18)), true, "Should equal")
    assert.equal((await token.allocations(crowdfund.address))[0].eq((await token.crowdfundSupply()).minus(bigNumberize(prices[0], 18))), true, "Should equal")

    let totalSupplyAfter = await token.totalSupply();
    let rate = await crowdfund.getRate();

    assert.equal(totalSupplyAfter - totalSupplyBeforeMove, amountToRelease * rate, "Total Supply was not updated properly" )


    // First allocation can move (timelock of 0)
    await token.moveAllocation(customer5, amountToRelease, {
      from: forwardAddress
    })
    assert.equal((await token.balanceOf(customer5)).eq(bigNumberize(1, 18)), true, "Should equal")


    // Second allocation cannot move (timelock of 28 days)
    try {
      await token.moveAllocation(customer4, web3.toWei(1, 'ether'), {
        from: customer5
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    assert.equal((await token.balanceOf(customer4)).eq(0), true, "Should equal")

    // Third allocation cannot move, only after 10 days
    try {
      await token.moveAllocation(customer3, web3.toWei(1, 'ether'), {
        from: customer4
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    assert.equal((await token.balanceOf(customer3)).eq(0), true, "Should equal")

    await jumpToTheFuture(10 * 24 * 60 * 60 + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
    await token.moveAllocation(customer3, web3.toWei(1, 'ether'), {
      from: customer4
    })
    assert.equal((await token.balanceOf(customer3)).eq(web3.toWei(1, 'ether')), true, "Should equal")



    // Move all allocation from a specific allocation
    await jumpToTheFuture(twentyEightDaysInSeconds + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })


    await token.moveAllocation(accounts[7], (await token.allocations(customer2))[0], {
      from: customer2
    })
    assert.equal((await token.balanceOf(accounts[7])).eq(bigNumberize(200000, 18)), true, "Should equal")
    try {
      await token.moveAllocation(owner, '1', {
        from: customer2
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }

    // Try to get an allocation from an account that does not have one
    try {
      await token.moveAllocation(owner, '1', {
        from: accounts[8]
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }

    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
  });

  it("OwnerMoveAllocation: It tests the ownerMoveAllocation function", async () => {

    currentTime = await getTimestampOfCurrentBlock()
    const crowdfund = await Crowdfund.new(
      owner,
      epochs,
      prices,
      receivingAccount,
      forwardAddress,
      totalDays,
      totalSupply_,
      withCrowdfund,
      [forwardAddress, customer5, customer4, customer2, customer1, "0x0"],
      allocationBalances,
      [0, twentyEightDaysInSeconds, 10 * 24 * 60 * 60, 10 * 24 * 60 * 60, 15 * 24 * 60 * 60, 0], {
        from: owner
      }
    )
    const token = await Token.at(await crowdfund.token());
    // First allocation should be able to move (timelock of 0) -- but won't as the crowdfund is not scheduled
    try {
      await token.ownerMoveAllocation(customer4, web3.toWei(1, 'ether'), {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }

    // Start the crowdfund now
    await crowdfund.scheduleCrowdfund(await getTimestampOfCurrentBlock() + 100, {
      from: owner
    })
    await jumpToTheFuture(102)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })

    assert.equal(await crowdfund.isActivated(), true, "Crowdfund should be active")
    // Buy tokens (Means the crowdfund allocation works)
    await crowdfund.buyTokens(owner, {
      from: owner,
      value: web3.toWei('1', 'ether')
    })
    assert.equal((await token.balanceOf(owner)).eq(bigNumberize(prices[0], 18)), true, "Should equal")
    assert.equal((await token.allocations(crowdfund.address))[0].eq((await token.crowdfundSupply()).minus(bigNumberize(prices[0], 18))), true, "Should equal")

    // First allocation can move (timelock of 0)
    await token.ownerMoveAllocation(forwardAddress, web3.toWei(1, 'ether'), {
      from: owner
    })
    assert.equal((await token.balanceOf(forwardAddress)).eq(bigNumberize(1, 18)), true, "Should equal")

    // Second allocation cannot move (timelock of 28 days)
    try {
      await token.ownerMoveAllocation(customer5, web3.toWei(1, 'ether'), {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }


    assert.equal((await token.balanceOf(customer5)).eq(0), true, "Should equal")

    // Third allocation cannot move, only after 10 days
    try {
      await token.ownerMoveAllocation(customer4, web3.toWei(1, 'ether'), {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    assert.equal((await token.balanceOf(customer4)).eq(0), true, "Should equal")

    await jumpToTheFuture(10 * 24 * 60 * 60 + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
    await token.ownerMoveAllocation(customer4, web3.toWei(1, 'ether'), {
      from: owner
    })
    assert.equal((await token.balanceOf(customer4)).eq(web3.toWei(1, 'ether')), true, "Should equal")



    // Move all allocation from a specific allocation
    await jumpToTheFuture(twentyEightDaysInSeconds + 2000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })


    try {
      await token.ownerMoveAllocation(accounts[8], '1', {
        from: owner
      });
        assert.equal(true,false,"Should fail");
    } catch (e) {
      ensureException(e)
    }
    assert.equal((await token.balanceOf(accounts[8])).eq(0), true, "Should equal")
    await jumpToTheFuture(20000)
    await crowdfund.changeWalletAddress(owner, {
      from: owner
    })
  });

});


// "0xabb287314bf8b9eadea72049c9f5cc6152bb0db9", [3, 4, 7, 14], [ 1000, 750, 500, 250 ], "0x2ead71e5b767995ac5af30b9cdd8867bc89c534e", "0x90e92aee50bf9ecbc1c72bcb3513463e9f17e451", 28, 1000000, [ "0x90e92aee50bf9ecbc1c72bcb3513463e9f17e451",
//   "0x1badea18487031d85a4ac70bf1bd1562ed898e53",
//   "0x08f45fdad010dbfc93dffa4fdb616cb57ad1e84c",
//   "0x05b2ed987104be1ea82cc70c2d9b04471ef74db8",
//   "0xfa375dddf2420ebff55d76e41cce0ddbc1b4cd00",
//   "0x0" ], [ 50000, 100000, 50000, 200000, 100000, 500000 ], [ 0, 1520121530, 1520121530, 1520121530, 1520121530, 0 ]
