# Automata Simulator

An interactive finite automata visualization tool for designing and simulating DFA and NFA with a technical blueprint aesthetic.
## Table of Contents
1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Usage Guide](#usage-guide)
6. [Architecture](#architecture)
7. [Known Behaviors](#known-behaviors)
## Features

- **DFA (Deterministic Finite Automaton)**: Single-path execution with duplicate transition detection
- **NFA (Non-Deterministic Finite Automaton)**: Multi-path simultaneous execution with epsilon (ε) closure
- **Interactive Canvas**: Freehand transition drawing, pan/zoom navigation, drag-and-drop state positioning
- **Step-by-Step Simulation**: Visual execution with adjustable playback speed
- **Technical Blueprint Design**: Teal-accented (#00ffd5) cyberpunk aesthetic with grid backgrounds and glow effects

## Tech Stack

- **HTML5**: Semantic markup with SVG canvas for automata rendering
- **CSS3**: Custom design system with blueprint grid, glassmorphism, and ambient glows
- **Vanilla JavaScript**: Pure JS for automata logic, canvas manipulation, and simulation engine
- **Fonts**: Syne (display), Chakra Petch (body), JetBrains Mono (technical labels)

## Project Structure

```
├── pages/
│   ├── index.html      # Landing page with project overview
│   ├── dfa.html        # DFA simulator interface
│   └── nfa.html        # NFA simulator interface
├── scripts/
│   ├── dfa.js          # DFA core logic (852 lines)
│   └── nfa.js          # NFA core logic with ε-closure (798 lines)
├── style/
│   └── styles.css      # Global stylesheet with blueprint theme
├── frontend-design.md  # Design guidelines and constraints
└── README.md           # This file
```

## Getting Started

### Running Locally

Since this is a static HTML/CSS/JS project, you can run it with any local server:

**Option 1: Python HTTP Server**
```bash
python -m http.server 8000
```

**Option 2: Node.js http-server**
```bash
npx http-server -p 8000
```

**Option 3: VS Code Live Server**
Right-click `pages/index.html` → "Open with Live Server"

Then navigate to `http://localhost:8000/pages/index.html`

### Opening Directly

**Note**: Opening HTML files directly (`file://`) may cause issues with resource loading. Use a local server instead.

## Usage Guide

### DFA Simulator (`pages/dfa.html`)

1. **Add States**: Select "Add State" tool → Click on canvas
2. **Add Transitions**: Select "Add Transition" → Click source state → Draw freehand path → Click target state
3. **Configure States**: Select "Select" tool → Click state → Set properties (start/accept)
4. **Label Transitions**: Click transition → Enter symbols (comma-separated: `a, b, 0, 1`)
5. **Simulate**: 
   - Enter input string (e.g., `1011`)
   - Use **Reset** (⏮️) to initialize
   - Use **Step** (⏭️) to advance one symbol
   - Use **Play** (▶️) to auto-run simulation
6. **DFA Validation**: Warnings appear for duplicate transitions from same state

### NFA Simulator (`pages/nfa.html`)

Similar to DFA with additional capabilities:
- **Multiple Start States**: Multiple states can be marked as start states
- **Epsilon Transitions**: Use `ε` or `epsilon` in transition symbols for free moves
- **Non-Determinism**: Multiple transitions for same symbol allowed
- **State Set Tracking**: All active states displayed during simulation
- **Epsilon Closure**: Automatically computed at each step

### Canvas Controls

- **Pan**: Click and drag on empty canvas (or middle mouse button)
- **Zoom**: Mouse wheel (limits: 0.2x - 5x)
- **Move State**: Select tool + drag state node
- **Select Element**: Select tool + click state/transition to view properties
- **Delete**: Select element → "Delete State" or "Delete Transition" button

## Architecture

### DFA Logic (`scripts/dfa.js`)
- **Canvas Management**: SVG element creation, pan/zoom transforms, layer ordering
- **State Machine**: Node/edge data structures, adjacency tracking
- **UI State**: Tool selection, drag interactions, context menus
- **Simulation Engine**: Single-state tracking, symbol consumption, accept/reject logic
- **Validation**: Duplicate transition detection for determinism

### NFA Logic (`scripts/nfa.js`)
- **Epsilon Closure**: Recursive traversal of ε-transitions
- **Multi-State Tracking**: Set-based active state management
- **Non-Determinism**: Parallel path exploration
- **Simulation Engine**: State set propagation, acceptance via subset containing accept state

### Rendering Pipeline
1. Clear SVG groups (edges, nodes)
2. Render edges (paths with computed control points)
3. Render edge labels (transition symbols)
4. Render nodes (circles with start arrows, accept double-circles)
5. Render node labels (state names)
6. Apply selection/active state styling

## Known Behaviors

- **Freehand Drawing**: Control points stored from midpoint of drawn path
- **Self-Loops**: Automatic curved path above state with label offset
- **Zoom Anchoring**: Zoom centers on canvas origin (not mouse position)
- **State Overlap**: No collision detection; states can overlap
- **DFA Warnings**: Non-blocking; simulation still runs with violations


