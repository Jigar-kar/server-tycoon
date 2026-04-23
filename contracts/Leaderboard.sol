// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Server Factory Tycoon - Decentralized Leaderboard
/// @notice Stores all-time high scores on-chain. Only the contract owner (game wallet) can submit scores.
contract Leaderboard {
    address public owner;

    struct Entry {
        string  playerName;
        uint256 score;
        uint256 timestamp;
        address submitter; // always == owner for now
    }

    // Top-N leaderboard (max 20 entries, always sorted)
    uint8 public constant MAX_ENTRIES = 20;
    Entry[] public entries;

    // Best score per player name (case-sensitive)
    mapping(bytes32 => uint256) public bestScore;

    // -------------------------------------------------------------------------
    event ScoreSubmitted(string playerName, uint256 score, uint256 rank);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Leaderboard: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    /// @notice Submit (or update) a player's all-time high score.
    ///         Only the owner wallet (game server) can call this.
    function submitScore(string calldata playerName, uint256 score) external onlyOwner {
        bytes32 key = keccak256(bytes(playerName));

        // Only update if this is a personal best
        if (score <= bestScore[key]) return;
        bestScore[key] = score;

        // Remove any existing entry for this player
        for (uint256 i = 0; i < entries.length; i++) {
            if (keccak256(bytes(entries[i].playerName)) == key) {
                entries[i] = entries[entries.length - 1];
                entries.pop();
                break;
            }
        }

        // Insert new entry
        entries.push(Entry({
            playerName: playerName,
            score:      score,
            timestamp:  block.timestamp,
            submitter:  msg.sender
        }));

        // Bubble-sort the new entry into position (small list, gas is fine)
        uint256 idx = entries.length - 1;
        while (idx > 0 && entries[idx].score > entries[idx - 1].score) {
            Entry memory tmp = entries[idx - 1];
            entries[idx - 1] = entries[idx];
            entries[idx]     = tmp;
            idx--;
        }

        // Trim to MAX_ENTRIES
        if (entries.length > MAX_ENTRIES) {
            entries.pop();
        }

        // Calculate rank (1-indexed position after sort)
        uint256 rank = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (keccak256(bytes(entries[i].playerName)) == key) {
                rank = i + 1;
                break;
            }
        }

        emit ScoreSubmitted(playerName, score, rank);
    }

    // -------------------------------------------------------------------------
    /// @notice Returns all current leaderboard entries (sorted descending by score).
    function getLeaderboard()
        external
        view
        returns (
            string[]  memory names,
            uint256[] memory scores,
            uint256[] memory timestamps
        )
    {
        uint256 len = entries.length;
        names      = new string[](len);
        scores     = new uint256[](len);
        timestamps = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            names[i]      = entries[i].playerName;
            scores[i]     = entries[i].score;
            timestamps[i] = entries[i].timestamp;
        }
    }

    /// @notice Total number of entries currently on the board.
    function entryCount() external view returns (uint256) {
        return entries.length;
    }

    // -------------------------------------------------------------------------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Leaderboard: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
