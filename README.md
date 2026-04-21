# IROB - Master Build Flowchart

A high-fidelity, interactive, and fully animated pitch-deck presentation showcasing the roadmap for IROB. 

IROB is a comprehensive ecosystem designed to unify the scattered landscape of media fandom. It combines the core functionalities of IMDb, Fandom Wikis, Reddit forums, Discord servers, and AO3 into a single, seamless platform. This repository contains the interactive "Master Build Flowchart" used to present the project's 8-phase rollout, mock UI, and tech stack.

## Features

* **Cinematic Dark Mode Aesthetics:** Deep blacks (`#060001`), striking crimson accents (`#c0001a`), and crisp typography using `Cinzel` and `Share Tech Mono`.
* **Interactive 3D-Style Canvas Background:** A native HTML5 Canvas particle system that actively reacts to mouse movement with dynamic glowing orbs.
* **High-End Animations:** Smooth scrolling and scroll-triggered element reveals powered by GSAP and Lenis.
* **Glassmorphism UI:** Expensive-looking, frosted-glass feature cards with 3D hover effects.
* **Simulated Mock Database:** Populated UI elements displaying trending movies, live forum threads, and fanfiction entries to simulate a working product.

## Project Architecture

This project is currently built using a lightweight Node.js/Express backend purely for local serving, while the frontend relies entirely on highly optimized, framework-free Vanilla web technologies.

```text
IROB.github.io/
├── package.json          # Node dependencies (Express)
├── server.js             # Local Express development server
├── views/
│   └── index.html        # Main presentation structure
└── public/
    ├── css/
    │   └── main.css      # Core styles, glassmorphism, and animations
    └── js/
        ├── app.js        # Core UI logic, loader, and scroll triggers
        ├── bg.js         # Canvas particle engine & mouse tracking
        └── data.js       # The 8-phase roadmap and mock JSON database
