---
title: "From Workflows to Agents: Building LLM Systems in Practice"
summary: "A practical TechSaloniki X workshop on building LLM systems with workflows, agents, tools, and evaluations."
date: 2026-05-01
featuredImage: "/projects/from-workflows-to-agents/featured.png"
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

This workshop explored how to build LLM systems that go beyond a single prompt.

The running example was a small support-ticket assistant. We started with a plain LLM call and gradually added the pieces that make these systems more useful in practice: structured outputs, tools, deterministic workflows, bounded agent loops, and evaluation checks.

The main question was simple:

Should this be a fixed workflow, or does it actually need an agent?

A workflow is usually the better choice when the path is known. It gives you control over the steps, makes debugging easier, and keeps the system more predictable.

An agent becomes useful when the next step depends on what the system discovers at runtime. It can decide which tool to call next, but that flexibility comes with tradeoffs: more variability, more cost, more latency, and a harder evaluation problem.

So the point was not to present agents as the natural endpoint of every LLM application. It was to show how to reason about the tradeoff and choose the least amount of autonomy needed to solve the problem reliably.

The demo covered plain LLM calls, structured outputs, tool usage, deterministic workflows, bounded agent loops, golden dataset evaluation, and optional LLM-as-a-Judge evaluation.

The main takeaway: evaluation is not an add-on. It is the part that lets you change the system with confidence.
