---
title: Planned dashboard sidebar and light dark themes
date: 2026-11-07
summary: "Confirmed local admin footer, device-based initial appearance, and mobile drawer; authored a verified two-phase implementation plan."
---

# Planned dashboard sidebar and light dark themes

## Planning outcome

Created [the sidebar and theme plan](../261107-1610-sidebar-and-theme/plan.md) with two sequential phases, estimated at 7.5 hours. The user confirmed Local admin and Sign out in the bottom account section, device appearance before an explicit saved Light/Dark choice, and a menu-triggered mobile drawer.

## Source findings

The current UI has a horizontal header and dark-only HTML, CSS, and toast settings. Login and authentication loading/error states render outside Layout, so theme ownership must cover the entire app. Existing semantic tokens, Radix primitives, router history, and logout behavior provide the implementation boundaries. The server's actual CSP allows a same-origin external bootstrap without adding an inline script allowance.

## Verification and handoff

The planning pass checked ten source claims, AgentKit plan format, installed verification commands, and relative links. Implementation remains pending; application tests and browser checks are gates in the phase files. No application code or user account data changed. AgentWiki publishing was skipped; the local plan is the execution authority.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
