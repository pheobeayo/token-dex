# TokenSwap DEX - Complete Project Documentation

## 📋 Project Overview

TokenSwap DEX is a fully decentralized exchange (DEX) built on the Stacks blockchain using Clarity smart contracts. It enables users to swap tokens, provide liquidity, and earn trading fees in a trustless, non-custodial environment.

### Key Features

- **Token Swapping**: Exchange between multiple currencies with low fees (0.3%)
- **Liquidity Provision**: Add liquidity to pools and earn passive income from trading fees
- **Multi-Currency Support**: Support for STX, USDC, BTC, EUR, NGN, and more
- **Mobile-First Design**: Fully responsive interface compatible with all devices
- **Automated Market Maker (AMM)**: Uses constant product formula (x * y = k) for fair pricing
- **Non-Custodial**: Users maintain full control of their assets

---

## 🏗️ Architecture

### Smart Contract Layer (Clarity)

The DEX uses a single Clarity smart contract (`token-dex.clar`) that implements:

1. **Liquidity Pools**: Stores token reserves and LP shares
2. **Swap Functions**: Handles token exchanges using AMM formula
3. **Liquidity Management**: Add/remove liquidity operations
4. **Slippage Protection**: min-amount parameters on all trades
5. **Input Validation**: Zero amount checks, balance verification

### Frontend Security

1. **Wallet Connection**: Use official Stacks Connect library
2. **Transaction Signing**: Never store private keys
3. **Input Sanitization**: Validate all user inputs
4. **Rate Limiting**: Prevent spam transactions

### Best Practices

- Always set appropriate slippage tolerance (0.5% - 5%)
- Check pool reserves before large trades
- Verify token addresses before swapping
- Test on testnet before mainnet deployment

---

## 🌐 Deployment Guide

### Deploy Smart Contract

1. **Configure Clarinet.toml**
   ```toml
   [project]
   name = "tokenswap-dex"
   
   [contracts.token-dex]
   path = "contracts/token-dex.clar"
   
   [repl.analysis]
   passes = ["check_checker"]
   ```

2. **Deploy to Testnet**
   ```bash
   # Check contract
   clarinet check
   
   # Deploy to testnet
   clarinet deploy --testnet
   ```

3. **Deploy to Mainnet**
   ```bash
   # Ensure thorough testing first!
   clarinet deploy --mainnet
   ```

### Deploy Frontend

#### Option 1: Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure build settings:
   ```
   Build Command: npm run build
   Output Directory: dist
   ```
4. Deploy automatically on push

#### Option 2: Netlify

1. Push code to GitHub
2. Import project in Netlify
3. Build settings:
   ```
   Build command: npm run build
   Publish directory: dist
   ```

#### Option 3: Manual Deployment

```bash
# Build production version
npm run build

# Upload dist/ folder to your hosting provider
```

### Environment Variables

Create `.env` file:

```env
VITE_NETWORK=testnet
VITE_CONTRACT_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
VITE_CONTRACT_NAME=token-dex
VITE_API_URL=https://stacks-node-api.testnet.stacks.co
```

---

## 📱 Mobile Optimization

### Responsive Design Features

1. **Breakpoints**
   - Mobile: < 640px
   - Tablet: 640px - 1024px
   - Desktop: > 1024px

2. **Touch Optimization**
   - Large touch targets (min 44x44px)
   - Swipe gestures for tab navigation
   - Pull-to-refresh support

3. **Performance**
   - Lazy loading for pool data
   - Image optimization
   - Code splitting

### PWA Support (Optional Enhancement)

Create `manifest.json`:

```json
{
  "name": "TokenSwap DEX",
  "short_name": "TokenSwap",
  "description": "Decentralized token exchange on Stacks",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1b4b",
  "theme_color": "#7c3aed",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 🔄 Advanced Features to Add

### 1. Price Charts

```javascript
import { LineChart, Line, XAxis, YAxis } from 'recharts';

const PriceChart = ({ data }) => (
  <LineChart width={500} height={300} data={data}>
    <XAxis dataKey="time" />
    <YAxis />
    <Line type="monotone" dataKey="price" stroke="#8884d8" />
  </LineChart>
);
```

### 2. Transaction History

```javascript
const [transactions, setTransactions] = useState([]);

const fetchTransactions = async (address) => {
  const response = await fetch(
    `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${address}/transactions`
  );
  const data = await response.json();
  setTransactions(data.results);
};
```

### 3. Token Price Oracle

```clarity
;; Add to smart contract
(define-map token-prices
  principal  ;; token address
  uint       ;; price in micro-units
)

(define-public (update-price (token principal) (price uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) ERR-NOT-AUTHORIZED)
    (ok (map-set token-prices token price))
  )
)
```

### 4. Limit Orders

```clarity
(define-map limit-orders
  {
    order-id: uint,
    owner: principal
  }
  {
    token-in: principal,
    token-out: principal,
    amount-in: uint,
    min-amount-out: uint,
    expiry: uint,
    filled: bool
  }
)
```

### 5. Farming/Staking Rewards

```clarity
(define-map staking-positions
  {
    user: principal,
    pool: {token-x: principal, token-y: principal}
  }
  {
    staked-shares: uint,
    reward-debt: uint,
    last-claim-height: uint
  }
)
```

---

## 📈 Analytics & Monitoring

### Track Key Metrics

1. **Trading Volume**
   - Daily/Weekly/Monthly volume
   - Volume by pair
   - Volume by user

2. **Liquidity Metrics**
   - Total Value Locked (TVL)
   - Liquidity by pool
   - LP provider count

3. **User Metrics**
   - Active users
   - New users
   - Retention rate

### Integration with Analytics Services

```javascript
// Google Analytics
import ReactGA from 'react-ga4';

ReactGA.initialize('G-XXXXXXXXXX');

const trackSwap = (from, to, amount) => {
  ReactGA.event({
    category: 'Swap',
    action: 'Execute',
    label: `${from}-${to}`,
    value: amount,
  });
};
```

---

## 🛠️ Troubleshooting

### Common Issues

**Issue: "Pool not found" error**
- Solution: Ensure pool is created before attempting operations
- Check token addresses are correct

**Issue: "Insufficient liquidity" error**
- Solution: Pool doesn't have enough reserves
- Add liquidity or reduce trade size

**Issue: "Slippage too high" error**
- Solution: Increase slippage tolerance
- Split large trades into smaller chunks

**Issue: Wallet won't connect**
- Solution: Ensure Stacks wallet extension installed
- Check network settings (testnet/mainnet)
- Clear browser cache

**Issue: Transaction stuck**
- Solution: Check transaction status on explorer
- Increase fee for faster confirmation
- Wait for network congestion to clear

---

## 📚 Additional Resources

### Documentation Links

- [Stacks Documentation](https://docs.stacks.co/)
- [Clarity Language Reference](https://docs.stacks.co/clarity/)
- [Stacks.js Documentation](https://github.com/hirosystems/stacks.js)
- [Clarinet Documentation](https://github.com/hirosystems/clarinet)

### Learning Resources

- [Learn Web3 - Stacks Developer Degree](https://learnweb3.io/degrees/stacks-developer-degree/)
- [Clarity Universe](https://clarity-lang.org/)
- [Stacks Academy](https://academy.stacks.org/)

### Community

- [Stacks Discord](https://discord.gg/stacks)
- [Stacks Forum](https://forum.stacks.org/)
- [GitHub Discussions](https://github.com/stacks-network/stacks-blockchain/discussions)

---

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Style

- Use TypeScript for type safety
- Follow Clarity best practices
- Write comprehensive tests
- Document all functions
- Use meaningful variable names

### Pull Request Guidelines

- Include description of changes
- Add tests for new features
- Update documentation
- Ensure all tests pass
- Follow semantic versioning

---

## 📄 License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2025 TokenSwap DEX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

---

## 🎯 Roadmap

### Phase 1 - Core Features (Complete)
- ✅ Basic token swapping
- ✅ Liquidity provision
- ✅ Pool creation
- ✅ Responsive UI

### Phase 2 - Enhanced Features (Next)
- 🔄 Price charts
- 🔄 Transaction history
- 🔄 Advanced analytics
- 🔄 Multi-hop swaps

### Phase 3 - Advanced Features
- ⏳ Limit orders
- ⏳ Yield farming
- ⏳ Governance token
- ⏳ Cross-chain bridges

### Phase 4 - Enterprise Features
- ⏳ API for developers
- ⏳ White-label solution
- ⏳ Institutional features
- ⏳ Advanced risk management

---

## 📞 Support

### Getting Help

- **Documentation**: Check this guide first
- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community for real-time help
- **Email**: support@tokenswap-dex.com

### Bug Reports

Please include:
1. Description of the issue
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Screenshots (if applicable)
6. Environment (browser, OS, wallet)

---


## 📝 Smart Contract Documentation

### Contract Structure

#### Constants

```clarity
;; Fee percentage: 0.3% (30 basis points)
(define-constant FEE-PERCENT u30)
(define-constant FEE-DENOMINATOR u10000)
```

#### Error Codes

| Code | Error | Description |
|------|-------|-------------|
| u100 | ERR-NOT-AUTHORIZED | User not authorized for operation |
| u101 | ERR-INVALID-AMOUNT | Invalid token amount provided |
| u102 | ERR-INSUFFICIENT-LIQUIDITY | Pool doesn't have enough liquidity |
| u103 | ERR-SLIPPAGE-TOO-HIGH | Price moved beyond slippage tolerance |
| u104 | ERR-POOL-EXISTS | Pool already exists |
| u105 | ERR-POOL-NOT-FOUND | Pool doesn't exist |
| u106 | ERR-ZERO-AMOUNT | Amount cannot be zero |
| u107 | ERR-INSUFFICIENT-BALANCE | User doesn't have enough balance |

### Key Functions

#### Read-Only Functions

1. **get-pool**
   ```clarity
   (get-pool (token-x principal) (token-y principal))
   ```
   - Returns: Pool data (reserves, total shares)
   - Use: Check pool status before operations

2. **get-user-shares**
   ```clarity
   (get-user-shares (user principal) (token-x principal) (token-y principal))
   ```
   - Returns: User's LP shares in the pool
   - Use: View liquidity positions

3. **get-swap-output**
   ```clarity
   (get-swap-output (amount-in uint) (reserve-in uint) (reserve-out uint))
   ```
   - Returns: Expected output amount for swap
   - Use: Calculate swap preview (includes 0.3% fee)
   - Formula: `(amountIn * 0.997 * reserveOut) / (reserveIn + amountIn * 0.997)`

#### Public Functions

1. **create-pool**
   ```clarity
   (create-pool (token-x principal) (token-y principal))
   ```
   - Creates new liquidity pool
   - Requirements: Both tokens must be supported
   - Returns: OK on success

2. **add-liquidity**
   ```clarity
   (add-liquidity 
     (token-x principal) 
     (token-y principal) 
     (amount-x uint) 
     (amount-y uint)
     (min-shares uint))
   ```
   - Adds liquidity to pool
   - Mints LP shares proportional to deposit
   - `min-shares`: Slippage protection parameter
   - Returns: Number of LP shares minted

3. **remove-liquidity**
   ```clarity
   (remove-liquidity
     (token-x principal)
     (token-y principal)
     (shares uint)
     (min-x uint)
     (min-y uint))
   ```
   - Removes liquidity from pool
   - Burns LP shares
   - `min-x, min-y`: Slippage protection
   - Returns: Tuple with withdrawn amounts

4. **swap-x-for-y**
   ```clarity
   (swap-x-for-y
     (token-x principal)
     (token-y principal)
     (amount-in uint)
     (min-amount-out uint))
   ```
   - Swaps token-x for token-y
   - Uses AMM pricing formula
   - `min-amount-out`: Slippage protection
   - Returns: Amount of token-y received

5. **swap-y-for-x**
   ```clarity
   (swap-y-for-x
     (token-x principal)
     (token-y principal)
     (amount-in uint)
     (min-amount-out uint))
   ```
   - Swaps token-y for token-x
   - Similar to swap-x-for-y but reversed
   - Returns: Amount of token-x received

---

