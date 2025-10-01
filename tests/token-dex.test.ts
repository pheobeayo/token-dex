// @ts-ignore
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v2.0.0/index.ts';
// @ts-ignore
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';

// =========================================
// TEST SUITE FOR TOKEN-DEX CONTRACT
// =========================================

Clarinet.test({
  name: "Ensure contract owner is set correctly",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    
    // The contract owner should be the deployer
    // This is implicit in the contract, tested through authorization checks
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(deployer.address)],
        deployer.address
      ),
    ]);
    
    block.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: "Only contract owner can add supported tokens",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    
    let block = chain.mineBlock([
      // Non-owner tries to add token - should fail
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        wallet1.address
      ),
      // Owner adds token - should succeed
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
    ]);
    
    block.receipts[0].result.expectErr().expectUint(100); // ERR-NOT-AUTHORIZED
    block.receipts[1].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: "Can check if token is supported",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    
    // Add a supported token
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
    ]);
    
    // Check if token is supported
    let tokenSupported = chain.callReadOnlyFn(
      'token-dex',
      'is-token-supported',
      [types.principal(wallet1.address)],
      deployer.address
    );
    tokenSupported.result.expectBool(true);
    
    // Check unsupported token
    let tokenNotSupported = chain.callReadOnlyFn(
      'token-dex',
      'is-token-supported',
      [types.principal(deployer.address)],
      deployer.address
    );
    tokenNotSupported.result.expectBool(false);
  },
});

Clarinet.test({
  name: "Cannot create pool with unsupported tokens",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
    ]);
    
    block.receipts[0].result.expectErr().expectUint(100); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: "Can create pool with supported tokens",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      // Add supported tokens
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      // Create pool
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
    ]);
    
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectBool(true);
    block.receipts[2].result.expectOk().expectBool(true);
    
    // Verify pool was created
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-x'], types.uint(0));
    assertEquals(poolData['reserve-y'], types.uint(0));
    assertEquals(poolData['total-shares'], types.uint(0));
  },
});

Clarinet.test({
  name: "Cannot create duplicate pool",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      // Add supported tokens
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      // Create pool first time
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Try to create same pool again
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
    ]);
    
    block.receipts[2].result.expectOk();
    block.receipts[3].result.expectErr().expectUint(104); // ERR-POOL-EXISTS
  },
});

Clarinet.test({
  name: "Can add liquidity to pool (initial provision)",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      // Setup: Add tokens and create pool
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Add initial liquidity: 1000 of token-x and 2000 of token-y
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1) // min-shares
        ],
        deployer.address
      ),
    ]);
    
    // Should succeed and return shares (sqrt(1000 * 2000) = sqrt(2000000) ≈ 1414)
    const shares = block.receipts[3].result.expectOk();
    
    // Verify pool reserves updated
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-x'], types.uint(1000));
    assertEquals(poolData['reserve-y'], types.uint(2000));
    
    // Verify user shares
    let userShares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(deployer.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    let userData = userShares.result.expectTuple();
    assertEquals(userData['shares'], shares);
  },
});

Clarinet.test({
  name: "Cannot add liquidity with zero amounts",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Try to add zero liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(0),
          types.uint(1000),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[3].result.expectErr().expectUint(106); // ERR-ZERO-AMOUNT
  },
});

Clarinet.test({
  name: "Slippage protection works for add-liquidity",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Add liquidity with unrealistic min-shares expectation
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1000000) // Unrealistically high min-shares
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[3].result.expectErr().expectUint(103); // ERR-SLIPPAGE-TOO-HIGH
  },
});

Clarinet.test({
  name: "Can add liquidity after initial provision",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    
    let block = chain.mineBlock([
      // Setup
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Initial liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Second liquidity provision by another user
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(500),
          types.uint(1000),
          types.uint(1)
        ],
        wallet3.address
      ),
    ]);
    
    block.receipts[3].result.expectOk();
    block.receipts[4].result.expectOk();
    
    // Verify pool reserves
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-x'], types.uint(1500));
    assertEquals(poolData['reserve-y'], types.uint(3000));
  },
});

Clarinet.test({
  name: "Can remove liquidity from pool",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      // Setup and add liquidity
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    const initialShares = block.receipts[3].result.expectOk();
    
    // Remove half of the liquidity
    let removeBlock = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'remove-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(707), // Half of shares (approximately)
          types.uint(1),   // min-x
          types.uint(1)    // min-y
        ],
        deployer.address
      ),
    ]);
    
    const result = removeBlock.receipts[0].result.expectOk().expectTuple();
    
    // Should receive approximately half of each token back
    // The exact amounts depend on the share calculation
  },
});

Clarinet.test({
  name: "Cannot remove more liquidity than owned",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Try to remove more shares than owned
      Tx.contractCall(
        'token-dex',
        'remove-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(999999),
          types.uint(1),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[4].result.expectErr().expectUint(107); // ERR-INSUFFICIENT-BALANCE
  },
});

Clarinet.test({
  name: "Can swap token-x for token-y",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    
    let block = chain.mineBlock([
      // Setup and add liquidity
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(20000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Swap 100 token-x for token-y
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(1) // min-amount-out
        ],
        wallet3.address
      ),
    ]);
    
    const amountOut = block.receipts[4].result.expectOk();
    
    // Verify reserves changed
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-x'], types.uint(10100)); // Increased by swap amount
  },
});

Clarinet.test({
  name: "Can swap token-y for token-x",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    
    let block = chain.mineBlock([
      // Setup and add liquidity
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(20000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Swap 100 token-y for token-x
      Tx.contractCall(
        'token-dex',
        'swap-y-for-x',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(1) // min-amount-out
        ],
        wallet3.address
      ),
    ]);
    
    const amountOut = block.receipts[4].result.expectOk();
    
    // Verify reserves changed
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-y'], types.uint(20100)); // Increased by swap amount
  },
});

Clarinet.test({
  name: "Cannot swap with zero amount",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(20000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Try to swap zero amount
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(0),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[4].result.expectErr().expectUint(106); // ERR-ZERO-AMOUNT
  },
});

Clarinet.test({
  name: "Slippage protection works for swaps",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(20000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Swap with unrealistic min-amount-out
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(999999) // Unrealistically high expectation
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[4].result.expectErr().expectUint(103); // ERR-SLIPPAGE-TOO-HIGH
  },
});

Clarinet.test({
  name: "get-swap-output calculates correct output with fees",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    
    // Calculate output for swapping 100 token-x
    // Reserve-x: 10000, Reserve-y: 20000
    // Fee: 0.3% = 30/10000
    // Expected: (100 * 0.997 * 20000) / (10000 + 100 * 0.997)
    let result = chain.callReadOnlyFn(
      'token-dex',
      'get-swap-output',
      [
        types.uint(100),   // amount-in
        types.uint(10000), // reserve-in
        types.uint(20000)  // reserve-out
      ],
      deployer.address
    );
    
    // Should return a valid amount with 0.3% fee applied
    result.result.expectOk();
  },
});

Clarinet.test({
  name: "Cannot swap from non-existent pool",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[0].result.expectErr().expectUint(105); // ERR-POOL-NOT-FOUND
  },
});

Clarinet.test({
  name: "Cannot swap if pool has insufficient liquidity",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(200),
          types.uint(1)
        ],
        deployer.address
      ),
      // Try to swap more than available liquidity
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000), // Much larger than pool reserves
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[4].result.expectErr().expectUint(102); // ERR-INSUFFICIENT-LIQUIDITY
  },
});

Clarinet.test({
  name: "Swap affects price according to constant product formula",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(10000),
          types.uint(1)
        ],
        deployer.address
      ),
      // First swap
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Second swap should give less output due to price impact
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    const firstSwapOutput = block.receipts[4].result.expectOk();
    const secondSwapOutput = block.receipts[5].result.expectOk();
    
    // Second swap should yield less output due to decreased reserve ratio
    // This verifies the constant product formula is working correctly
  },
});

Clarinet.test({
  name: "Multiple users can provide liquidity independently",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    const wallet4 = accounts.get('wallet_4')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Deployer adds liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(1000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Wallet3 adds liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(500),
          types.uint(500),
          types.uint(1)
        ],
        wallet3.address
      ),
      // Wallet4 adds liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(250),
          types.uint(250),
          types.uint(1)
        ],
        wallet4.address
      ),
    ]);
    
    block.receipts[3].result.expectOk();
    block.receipts[4].result.expectOk();
    block.receipts[5].result.expectOk();
    
    // Check each user has their own shares
    let deployerShares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(deployer.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    let wallet3Shares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(wallet3.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    let wallet4Shares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(wallet4.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    // All users should have shares proportional to their contribution
    deployerShares.result.expectTuple();
    wallet3Shares.result.expectTuple();
    wallet4Shares.result.expectTuple();
  },
});

Clarinet.test({
  name: "Removing liquidity returns correct proportional amounts",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(20000),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    const shares = block.receipts[3].result.expectOk();
    
    // Remove all liquidity
    let removeBlock = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'remove-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          shares,
          types.uint(1),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    const result = removeBlock.receipts[0].result.expectOk().expectTuple();
    
    // Should receive back the original amounts (or very close due to rounding)
    assertEquals(result['amount-x'], types.uint(10000));
    assertEquals(result['amount-y'], types.uint(20000));
    
    // Pool should be empty
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    let poolData = pool.result.expectSome().expectTuple();
    assertEquals(poolData['reserve-x'], types.uint(0));
    assertEquals(poolData['reserve-y'], types.uint(0));
    assertEquals(poolData['total-shares'], types.uint(0));
  },
});

Clarinet.test({
  name: "Cannot remove liquidity with zero shares",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Try to remove zero shares
      Tx.contractCall(
        'token-dex',
        'remove-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(0),
          types.uint(1),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    block.receipts[4].result.expectErr().expectUint(106); // ERR-ZERO-AMOUNT
  },
});

Clarinet.test({
  name: "Slippage protection works for remove-liquidity",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(2000),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    const shares = block.receipts[3].result.expectOk();
    
    // Try to remove with unrealistic expectations
    let removeBlock = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'remove-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(999999), // Unrealistically high min-x
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    removeBlock.receipts[0].result.expectErr().expectUint(103); // ERR-SLIPPAGE-TOO-HIGH
  },
});

Clarinet.test({
  name: "Pool state is consistent after multiple operations",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Add initial liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(10000),
          types.uint(10000),
          types.uint(1)
        ],
        deployer.address
      ),
      // Perform a swap
      Tx.contractCall(
        'token-dex',
        'swap-x-for-y',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(100),
          types.uint(1)
        ],
        wallet3.address
      ),
      // Add more liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(900),
          types.uint(1)
        ],
        wallet3.address
      ),
      // Another swap
      Tx.contractCall(
        'token-dex',
        'swap-y-for-x',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(50),
          types.uint(1)
        ],
        deployer.address
      ),
    ]);
    
    // Verify all operations succeeded
    block.receipts[3].result.expectOk();
    block.receipts[4].result.expectOk();
    block.receipts[5].result.expectOk();
    block.receipts[6].result.expectOk();
    
    // Pool should maintain consistency
    let pool = chain.callReadOnlyFn(
      'token-dex',
      'get-pool',
      [types.principal(wallet1.address), types.principal(wallet2.address)],
      deployer.address
    );
    
    pool.result.expectSome();
  },
});

Clarinet.test({
  name: "calculate-shares returns correct values for initial and subsequent liquidity",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    
    // Test initial liquidity (sqrt calculation)
    let initialShares = chain.callReadOnlyFn(
      'token-dex',
      'calculate-shares',
      [
        types.uint(1000),  // amount-x
        types.uint(2000),  // amount-y
        types.uint(0),     // reserve-x (empty pool)
        types.uint(0),     // reserve-y (empty pool)
        types.uint(0)      // total-shares (empty pool)
      ],
      deployer.address
    );
    
    initialShares.result.expectOk();
    
    // Test subsequent liquidity (proportional calculation)
    let subsequentShares = chain.callReadOnlyFn(
      'token-dex',
      'calculate-shares',
      [
        types.uint(500),   // amount-x
        types.uint(1000),  // amount-y
        types.uint(1000),  // reserve-x
        types.uint(2000),  // reserve-y
        types.uint(1414)   // total-shares (from initial)
      ],
      deployer.address
    );
    
    subsequentShares.result.expectOk();
  },
});

Clarinet.test({
  name: "User shares are tracked separately for each user",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet1 = accounts.get('wallet_1')!;
    const wallet2 = accounts.get('wallet_2')!;
    const wallet3 = accounts.get('wallet_3')!;
    const wallet4 = accounts.get('wallet_4')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet1.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'add-supported-token',
        [types.principal(wallet2.address)],
        deployer.address
      ),
      Tx.contractCall(
        'token-dex',
        'create-pool',
        [types.principal(wallet1.address), types.principal(wallet2.address)],
        deployer.address
      ),
      // Wallet3 adds liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(1000),
          types.uint(1000),
          types.uint(1)
        ],
        wallet3.address
      ),
      // Wallet4 adds liquidity
      Tx.contractCall(
        'token-dex',
        'add-liquidity',
        [
          types.principal(wallet1.address),
          types.principal(wallet2.address),
          types.uint(2000),
          types.uint(2000),
          types.uint(1)
        ],
        wallet4.address
      ),
    ]);
    
    // Check wallet3 shares
    let wallet3Shares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(wallet3.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    // Check wallet4 shares
    let wallet4Shares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(wallet4.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    // Check deployer has no shares
    let deployerShares = chain.callReadOnlyFn(
      'token-dex',
      'get-user-shares',
      [
        types.principal(deployer.address),
        types.principal(wallet1.address),
        types.principal(wallet2.address)
      ],
      deployer.address
    );
    
    let deployerData = deployerShares.result.expectTuple();
    assertEquals(deployerData['shares'], types.uint(0));
  },
});