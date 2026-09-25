---
title: "From Workflows to Agents: Building LLM Systems in Practice"
summary: "A hands-on TechSaloniki X workshop comparing LLM workflows, agents, tools, and evaluation."
date: 2026-05-01
featuredImage: "/projects/from-workflows-to-agents/featured.webp"
tags:
  - workshop
  - agents
  - mlops
url_code: "/media/files/from_workflows_to_agents_workshop.zip"
url_slides: "/media/slides/from_workflows_to_agents_workshop.pptx"
url_pdf: ""
url_video: ""
weight: 0
---

**TechSaloniki X · May 2026 · Thessaloniki, Greece**

This workshop used a support-ticket assistant to show how an LLM application grows beyond a single prompt.

We started with a plain LLM call, then added structured outputs, tools, a fixed workflow, a bounded agent loop, and evaluation checks. Each step had a reason to exist in the example rather than treating more autonomy as the goal.

## Workflow or agent?

A fixed workflow works well when the path is known: its steps are easier to inspect, test, and debug. An agent is useful when the next step depends on what the system discovers while running. That flexibility also increases variability, cost, latency, and the work needed to evaluate behavior.

The aim was to choose only the autonomy needed to solve the task reliably.

## What the demo covered

- Structured outputs and tool calls.
- Deterministic workflows and bounded agent loops.
- Golden dataset checks and an optional LLM-as-a-judge step.

Evaluation was the thread connecting the demo: it provides a way to check whether each change actually helps.
