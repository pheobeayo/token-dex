;; title: token-dex
;; version:
;; summary:
;; description:
;; =========================================
;; DECENTRALIZED EXCHANGE (DEX) CONTRACT
;; =========================================
;; This contract implements an Automated Market Maker (AMM) for token swapping
;; Users can add liquidity, remove liquidity, and swap tokens
;; The contract uses a constant product formula (x * y = k) for pricing

;; =========================================
;; CONSTANTS & ERROR CODES
;; =========================================

;; Contract owner - the deployer of this contract
(define-constant contract-owner tx-sender)

;; Error codes for better debugging
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u102))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u103))
(define-constant ERR-POOL-EXISTS (err u104))
(define-constant ERR-POOL-NOT-FOUND (err u105))
(define-constant ERR-ZERO-AMOUNT (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))

;; Fee percentage (0.3% = 30 basis points out of 10000)
(define-constant FEE-PERCENT u30)
(define-constant FEE-DENOMINATOR u10000)

;; =========================================
;; DATA STRUCTURES
;; =========================================

;; Liquidity pool data structure
;; Stores reserves and total liquidity shares for each token pair
(define-map liquidity-pools
  {
    token-x: principal,  ;; First token in the pair
    token-y: principal   ;; Second token in the pair
  }
  {
    reserve-x: uint,     ;; Amount of token-x in the pool
    reserve-y: uint,     ;; Amount of token-y in the pool
    total-shares: uint   ;; Total liquidity provider (LP) shares
  }
)

;; User liquidity shares
;; Tracks how much liquidity each user has provided to each pool
(define-map user-shares
  {
    owner: principal,
    token-x: principal,
    token-y: principal
  }
  {
    shares: uint  ;; User's share of the liquidity pool
  }
)

;; Supported tokens registry
;; Keeps track of which tokens are allowed in the DEX
(define-map supported-tokens
  principal  ;; Token contract address
  bool       ;; true if supported, false otherwise
)

;; =========================================
;; READ-ONLY FUNCTIONS
;; =========================================

;; Get pool information for a token pair
;; Returns the current reserves and total shares
(define-read-only (get-pool (token-x principal) (token-y principal))
  (map-get? liquidity-pools {token-x: token-x, token-y: token-y})
)

;; Get user's liquidity shares for a specific pool
(define-read-only (get-user-shares (user principal) (token-x principal) (token-y principal))
  (default-to 
    {shares: u0}
    (map-get? user-shares {owner: user, token-x: token-x, token-y: token-y})
  )
)

;; Check if a token is supported by the DEX
(define-read-only (is-token-supported (token principal))
  (default-to false (map-get? supported-tokens token))
)

;; Calculate output amount for a swap using constant product formula
;; Formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
;; Applies 0.3% fee to the input amount
(define-read-only (get-swap-output 
  (amount-in uint) 
  (reserve-in uint) 
  (reserve-out uint))
  (let
    (
      ;; Calculate fee amount
      (fee-amount (/ (* amount-in FEE-PERCENT) FEE-DENOMINATOR))
      ;; Amount after fee deduction
      (amount-in-with-fee (- amount-in fee-amount))
      ;; Numerator: amount-in * reserve-out
      (numerator (* amount-in-with-fee reserve-out))
      ;; Denominator: reserve-in + amount-in
      (denominator (+ reserve-in amount-in-with-fee))
    )
    ;; Return output amount
    (ok (/ numerator denominator))
  )
)

;; Calculate the amount of LP shares to mint when adding liquidity
;; For first deposit: shares = sqrt(amount-x * amount-y)
;; For subsequent deposits: shares = min(amount-x/reserve-x, amount-y/reserve-y) * total-shares
(define-read-only (calculate-shares
  (amount-x uint)
  (amount-y uint)
  (reserve-x uint)
  (reserve-y uint)
  (total-shares uint))
  (if (is-eq total-shares u0)
    ;; First liquidity provision - use geometric mean with built-in sqrti
    (ok (sqrti (* amount-x amount-y)))
    ;; Subsequent provisions - maintain ratio
    (let
      (
        (shares-from-x (/ (* amount-x total-shares) reserve-x))
        (shares-from-y (/ (* amount-y total-shares) reserve-y))
      )
      ;; Use the minimum to prevent manipulation
      (ok (if (< shares-from-x shares-from-y) shares-from-x shares-from-y))
    )
  )
)

;; =========================================
;; PUBLIC FUNCTIONS
;; =========================================

;; Add a new token to the supported tokens list
;; Only contract owner can call this function
(define-public (add-supported-token (token principal))
  (begin
    ;; Check if caller is the contract owner
    (asserts! (is-eq tx-sender contract-owner) ERR-NOT-AUTHORIZED)
    ;; Add token to supported list
    (ok (map-set supported-tokens token true))
  )
)

;; Create a new liquidity pool for a token pair
;; Initializes the pool with zero reserves
(define-public (create-pool (token-x principal) (token-y principal))
  (let
    (
      (existing-pool (get-pool token-x token-y))
    )
    ;; Ensure pool doesn't already exist
    (asserts! (is-none existing-pool) ERR-POOL-EXISTS)
    ;; Verify both tokens are supported
    (asserts! (is-token-supported token-x) ERR-NOT-AUTHORIZED)
    (asserts! (is-token-supported token-y) ERR-NOT-AUTHORIZED)
    ;; Create the pool with zero reserves
    (ok (map-set liquidity-pools
      {token-x: token-x, token-y: token-y}
      {reserve-x: u0, reserve-y: u0, total-shares: u0}
    ))
  )
)

;; Add liquidity to an existing pool
;; Mints LP shares proportional to the provided liquidity
(define-public (add-liquidity 
  (token-x principal) 
  (token-y principal) 
  (amount-x uint) 
  (amount-y uint)
  (min-shares uint))  ;; Minimum shares expected (slippage protection)
  (let
    (
      ;; Get current pool state
      (pool (unwrap! (get-pool token-x token-y) ERR-POOL-NOT-FOUND))
      (reserve-x (get reserve-x pool))
      (reserve-y (get reserve-y pool))
      (total-shares (get total-shares pool))
      
      ;; Calculate LP shares to mint
      (shares-to-mint (unwrap! 
        (calculate-shares amount-x amount-y reserve-x reserve-y total-shares) 
        ERR-INVALID-AMOUNT))
      
      ;; Get user's current shares
      (current-user-shares (get shares (get-user-shares tx-sender token-x token-y)))
    )
    ;; Validate inputs
    (asserts! (> amount-x u0) ERR-ZERO-AMOUNT)
    (asserts! (> amount-y u0) ERR-ZERO-AMOUNT)
    (asserts! (>= shares-to-mint min-shares) ERR-SLIPPAGE-TOO-HIGH)
    
    ;; Update pool reserves and total shares
    (map-set liquidity-pools
      {token-x: token-x, token-y: token-y}
      {
        reserve-x: (+ reserve-x amount-x),
        reserve-y: (+ reserve-y amount-y),
        total-shares: (+ total-shares shares-to-mint)
      }
    )
    
    ;; Update user's shares
    (map-set user-shares
      {owner: tx-sender, token-x: token-x, token-y: token-y}
      {shares: (+ current-user-shares shares-to-mint)}
    )
    
    ;; Note: In production, you would transfer tokens from user here
    ;; using SIP-010 token standard: (contract-call? .token transfer amount tx-sender (as-contract tx-sender))
    
    (ok shares-to-mint)
  )
)

;; Remove liquidity from a pool
;; Burns LP shares and returns proportional amounts of both tokens
(define-public (remove-liquidity
  (token-x principal)
  (token-y principal)
  (shares uint)
  (min-x uint)  ;; Minimum token-x expected (slippage protection)
  (min-y uint)) ;; Minimum token-y expected (slippage protection)
  (let
    (
      ;; Get pool state
      (pool (unwrap! (get-pool token-x token-y) ERR-POOL-NOT-FOUND))
      (reserve-x (get reserve-x pool))
      (reserve-y (get reserve-y pool))
      (total-shares (get total-shares pool))
      
      ;; Get user's shares
      (user-shares-data (get-user-shares tx-sender token-x token-y))
      (user-shares-amt (get shares user-shares-data))
      
      ;; Calculate amounts to return based on share percentage
      (amount-x (/ (* shares reserve-x) total-shares))
      (amount-y (/ (* shares reserve-y) total-shares))
    )
    ;; Validate inputs
    (asserts! (> shares u0) ERR-ZERO-AMOUNT)
    (asserts! (<= shares user-shares-amt) ERR-INSUFFICIENT-BALANCE)
    (asserts! (> total-shares u0) ERR-INSUFFICIENT-LIQUIDITY)
    
    ;; Check slippage protection
    (asserts! (>= amount-x min-x) ERR-SLIPPAGE-TOO-HIGH)
    (asserts! (>= amount-y min-y) ERR-SLIPPAGE-TOO-HIGH)
    
    ;; Update pool reserves
    (map-set liquidity-pools
      {token-x: token-x, token-y: token-y}
      {
        reserve-x: (- reserve-x amount-x),
        reserve-y: (- reserve-y amount-y),
        total-shares: (- total-shares shares)
      }
    )
    
    ;; Update user shares
    (map-set user-shares
      {owner: tx-sender, token-x: token-x, token-y: token-y}
      {shares: (- user-shares-amt shares)}
    )
    
    ;; Note: In production, transfer tokens back to user
    
    (ok {amount-x: amount-x, amount-y: amount-y})
  )
)

;; Swap token-x for token-y
;; Uses constant product AMM formula for pricing
(define-public (swap-x-for-y
  (token-x principal)
  (token-y principal)
  (amount-in uint)
  (min-amount-out uint))  ;; Minimum output expected (slippage protection)
  (let
    (
      ;; Get pool state
      (pool (unwrap! (get-pool token-x token-y) ERR-POOL-NOT-FOUND))
      (reserve-x (get reserve-x pool))
      (reserve-y (get reserve-y pool))
      
      ;; Calculate output amount
      (amount-out (unwrap! (get-swap-output amount-in reserve-x reserve-y) ERR-INVALID-AMOUNT))
    )
    ;; Validate inputs
    (asserts! (> amount-in u0) ERR-ZERO-AMOUNT)
    (asserts! (> reserve-x u0) ERR-INSUFFICIENT-LIQUIDITY)
    (asserts! (> reserve-y u0) ERR-INSUFFICIENT-LIQUIDITY)
    
    ;; Check slippage protection
    (asserts! (>= amount-out min-amount-out) ERR-SLIPPAGE-TOO-HIGH)
    (asserts! (< amount-out reserve-y) ERR-INSUFFICIENT-LIQUIDITY)
    
    ;; Update pool reserves
    (map-set liquidity-pools
      {token-x: token-x, token-y: token-y}
      {
        reserve-x: (+ reserve-x amount-in),
        reserve-y: (- reserve-y amount-out),
        total-shares: (get total-shares pool)
      }
    )
    
    ;; Note: In production, transfer tokens:
    ;; 1. Transfer amount-in of token-x from user to contract
    ;; 2. Transfer amount-out of token-y from contract to user
    
    (ok amount-out)
  )
)

;; Swap token-y for token-x
;; Uses constant product AMM formula for pricing
(define-public (swap-y-for-x
  (token-x principal)
  (token-y principal)
  (amount-in uint)
  (min-amount-out uint))  ;; Minimum output expected (slippage protection)
  (let
    (
      ;; Get pool state
      (pool (unwrap! (get-pool token-x token-y) ERR-POOL-NOT-FOUND))
      (reserve-x (get reserve-x pool))
      (reserve-y (get reserve-y pool))
      
      ;; Calculate output amount (swapping y for x, so reserves are reversed)
      (amount-out (unwrap! (get-swap-output amount-in reserve-y reserve-x) ERR-INVALID-AMOUNT))
    )
    ;; Validate inputs
    (asserts! (> amount-in u0) ERR-ZERO-AMOUNT)
    (asserts! (> reserve-x u0) ERR-INSUFFICIENT-LIQUIDITY)
    (asserts! (> reserve-y u0) ERR-INSUFFICIENT-LIQUIDITY)
    
    ;; Check slippage protection
    (asserts! (>= amount-out min-amount-out) ERR-SLIPPAGE-TOO-HIGH)
    (asserts! (< amount-out reserve-x) ERR-INSUFFICIENT-LIQUIDITY)
    
    ;; Update pool reserves
    (map-set liquidity-pools
      {token-x: token-x, token-y: token-y}
      {
        reserve-x: (- reserve-x amount-out),
        reserve-y: (+ reserve-y amount-in),
        total-shares: (get total-shares pool)
      }
    )
    
    ;; Note: In production, transfer tokens:
    ;; 1. Transfer amount-in of token-y from user to contract
    ;; 2. Transfer amount-out of token-x from contract to user
    
    (ok amount-out)
  )
)