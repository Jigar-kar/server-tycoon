// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Server Factory Tycoon — On-Chain Purchase Ledger
/// @notice Every in-game purchase (Buy Server, Upgrade, Hire Worker, etc.)
///         is recorded immutably on Sepolia by the game server wallet.
///
/// Data stored per purchase:
///   - playerName   : display name of the buyer
///   - action       : what was purchased ("BUY SERVER", "UPGRADE SERVERS", etc.)
///   - cost         : in-game $ cost of the purchase
///   - balanceAfter : player's in-game $ balance AFTER the purchase
///   - timestamp    : block.timestamp
///
/// Only the contract owner (game server wallet) can record purchases.
/// Anyone can read the full purchase history.
contract GameStore {
    address public owner;

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Purchase {
        string  playerName;
        string  action;
        uint256 cost;
        uint256 balanceAfter;
        uint256 timestamp;
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    Purchase[] public purchases;

    // Per-player stats (keyed by keccak256 of playerName)
    mapping(bytes32 => uint256) public totalSpent;
    mapping(bytes32 => uint256) public purchaseCount;
    mapping(bytes32 => uint256) public lastBalance;
    mapping(bytes32 => string)  public nameByKey; // key → original name

    // Sorted top spender list (always maintained, max 20)
    uint8 public constant MAX_TOP = 20;
    bytes32[] public topKeys;          // sorted desc by totalSpent

    // ── Events ────────────────────────────────────────────────────────────────
    event PurchaseRecorded(
        string  indexed playerName,
        string  action,
        uint256 cost,
        uint256 balanceAfter,
        uint256 txIndex,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "GameStore: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ── Write ─────────────────────────────────────────────────────────────────
    /// @notice Record a completed in-game purchase.
    /// @param playerName   Player's display name (max 32 chars, trimmed on client)
    /// @param action       Purchase type, e.g. "BUY SERVER", "UPGRADE SERVERS"
    /// @param cost         In-game $ cost paid
    /// @param balanceAfter Player's in-game $ balance AFTER deduction
    function recordPurchase(
        string calldata playerName,
        string calldata action,
        uint256         cost,
        uint256         balanceAfter
    ) external onlyOwner {
        uint256 idx = purchases.length;

        purchases.push(Purchase({
            playerName:   playerName,
            action:       action,
            cost:         cost,
            balanceAfter: balanceAfter,
            timestamp:    block.timestamp
        }));

        // Update per-player aggregates
        bytes32 key      = keccak256(bytes(playerName));
        totalSpent[key]  += cost;
        purchaseCount[key]++;
        lastBalance[key]  = balanceAfter;
        nameByKey[key]    = playerName;

        // Update top spenders list
        _upsertTopKey(key);

        emit PurchaseRecorded(playerName, action, cost, balanceAfter, idx, block.timestamp);
    }

    // ── Read — recent history ─────────────────────────────────────────────────
    /// @notice Last `count` purchases (newest first). Use count=20 for the feed.
    function getRecentPurchases(uint256 count)
        external view
        returns (
            string[]  memory names,
            string[]  memory actions,
            uint256[] memory costs,
            uint256[] memory balances,
            uint256[] memory timestamps
        )
    {
        uint256 total = purchases.length;
        uint256 len   = count < total ? count : total;

        names      = new string[](len);
        actions    = new string[](len);
        costs      = new uint256[](len);
        balances   = new uint256[](len);
        timestamps = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            // newest first
            Purchase storage p  = purchases[total - 1 - i];
            names[i]      = p.playerName;
            actions[i]    = p.action;
            costs[i]      = p.cost;
            balances[i]   = p.balanceAfter;
            timestamps[i] = p.timestamp;
        }
    }

    /// @notice Total number of purchases ever recorded.
    function purchaseTotal() external view returns (uint256) {
        return purchases.length;
    }

    // ── Read — top spenders ────────────────────────────────────────────────────
    /// @notice Top spenders sorted descending by total in-game $ spent.
    function getTopSpenders()
        external view
        returns (
            string[]  memory names,
            uint256[] memory spent,
            uint256[] memory counts,
            uint256[] memory balances
        )
    {
        uint256 len = topKeys.length;
        names    = new string[](len);
        spent    = new uint256[](len);
        counts   = new uint256[](len);
        balances = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            bytes32 k  = topKeys[i];
            names[i]   = nameByKey[k];
            spent[i]   = totalSpent[k];
            counts[i]  = purchaseCount[k];
            balances[i]= lastBalance[k];
        }
    }

    // ── Read — single player ───────────────────────────────────────────────────
    function getPlayerStats(string calldata playerName)
        external view
        returns (uint256 spent, uint256 txCount, uint256 balance)
    {
        bytes32 key = keccak256(bytes(playerName));
        return (totalSpent[key], purchaseCount[key], lastBalance[key]);
    }

    // ── Internal helpers ───────────────────────────────────────────────────────
    function _upsertTopKey(bytes32 key) internal {
        // Check if already in list
        bool found = false;
        for (uint256 i = 0; i < topKeys.length; i++) {
            if (topKeys[i] == key) { found = true; break; }
        }
        if (!found) {
            topKeys.push(key);
        }

        // Bubble sort (small list, acceptable gas)
        uint256 n = topKeys.length;
        for (uint256 i = n - 1; i > 0; i--) {
            if (totalSpent[topKeys[i]] > totalSpent[topKeys[i-1]]) {
                bytes32 tmp    = topKeys[i-1];
                topKeys[i-1]  = topKeys[i];
                topKeys[i]    = tmp;
            } else {
                break;
            }
        }

        // Trim to MAX_TOP
        if (topKeys.length > MAX_TOP) {
            topKeys.pop();
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
