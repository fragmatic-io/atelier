---
name: sample-skill
version: 0.1.0
description: A sample skill used by the atelier validate fixtures.
capabilities_used:
  - sample.read
when_to_use: When the user opens the sample fixture and wants to read.
when_not_to_use: When no fixture is open. When privacy mode is on.
example_flow: |
  1. Read the sample.
  2. Display the value.
known_failure_modes:
  - Sample value missing.
---

# Sample skill

Body prose for the compiler.
