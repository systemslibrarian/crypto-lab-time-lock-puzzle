# Prompt: Create "crypto-lab-time-lock-puzzle-prompt" Demo

You are an expert cryptography educator and frontend developer who creates high-quality, focused, interactive browser-based educational tools.

## Project Goal
Create a new standalone browser demo called **Time-Lock Puzzles** that helps students understand what time-lock puzzles are, how they work, and why they are a powerful primitive in cryptography.

## Why This Is Valuable for Students
Time-lock puzzles are an elegant cryptographic concept that is rarely taught in depth, yet they have interesting real-world and theoretical applications (verifiable delay functions, randomness beacons, sealed-bid auctions, fair multi-party computation, etc.).

A good interactive demo should allow students to:
- Experience what it feels like to create a puzzle that can only be solved after a certain amount of computational work
- Understand the difference between “time-lock” and simple encryption
- See how sequential computation creates a time delay that cannot be easily parallelized
- Connect the concept to broader ideas like verifiable delay and “proofs of work with a trapdoor”

This topic helps students think beyond standard encryption and signatures into more advanced time-based cryptography.

## Learning Objectives
By using this demo, a student should be able to:
- Explain what a time-lock puzzle is and what security properties it provides
- Understand how sequential squaring (or similar techniques) creates a time delay
- Describe the difference between creating a puzzle and solving it
- Recognize applications where time-lock puzzles are useful
- Understand the relationship between time-lock puzzles and Verifiable Delay Functions (VDFs)

## Required Sections & Flow

### 1. What is a Time-Lock Puzzle?
- Clear, accessible explanation of the concept.
- Contrast with regular encryption: “Anyone can eventually solve it, but it takes a predictable amount of sequential work.”
- Simple real-world analogies (e.g., a locked box that takes a certain amount of time to open even with many people working on it).

### 2. Interactive Puzzle Creation
- User inputs a secret/message and chooses a difficulty level (number of sequential steps).
- The demo generates a time-lock puzzle.
- Show the public parameters that anyone can use to solve it.

### 3. Solving the Puzzle (Interactive)
- Allow the user to attempt solving the puzzle.
- Show the sequential nature of the work (e.g., repeated squaring).
- Display progress and estimated time to solution.
- For educational purposes, offer a “fast-forward” or “reveal solution” option after demonstrating the work required.

### 4. Security Properties
- Explain why parallel computation doesn’t help much (sequential nature).
- Show that the puzzle creator can open it quickly (using a trapdoor), while everyone else must do the sequential work.
- Discuss what happens if someone tries to cheat or skip steps.

### 5. Real-World Applications
- Brief but clear examples of where time-lock puzzles (or VDFs) are used or proposed:
  - Randomness beacons
  - Sealed-bid auctions
  - Fair multi-party computation
  - Blockchain-related delay mechanisms
- Keep this section high-level and educational.

### 6. Connection to VDFs (Optional but Recommended)
- Short explanation of how time-lock puzzles relate to Verifiable Delay Functions.
- Mention that VDFs add verifiability on top of the delay property.

## Technical Preferences
- Browser-native (HTML + TypeScript/JavaScript). WASM is acceptable for performance if needed.
- Use a well-known, simple time-lock construction (e.g., Rivest-Shamir-Wagner sequential squaring) that can be implemented or simulated clearly.
- Make the sequential nature of the work visible to the user.
- Clean, focused, educational aesthetic consistent with Crypto Lab demos.
- Balance between realism and clarity — the goal is intuition, not a production-grade implementation.

## Relationship to Existing Work
- This is a relatively new topic for Crypto Lab and would be a fresh addition.
- It can later link to a potential VDF demo if created.
- Keep the focus on the core time-lock concept and its unique properties.

## Output Requested
Please provide:
1. A recommended final display title for the demo page
2. High-level architecture and component breakdown
3. Key interactive elements and how the puzzle creation/solving should work
4. Suggested visualizations (progress, sequential steps, etc.)
5. Recommended time-lock construction to use for educational clarity
6. Any important pedagogical notes or common misconceptions this demo should address

Start with the proposed structure, then we can iterate on implementation details.
