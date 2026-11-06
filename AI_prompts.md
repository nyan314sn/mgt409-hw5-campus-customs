# AI Prompts Log — HW5

Prompts are grouped into one section per problem. A new section is added when work on each problem begins.

---

## Setup

### 2026-11-04 18:46 (EST, UTC-05:00)

> Before starting the assignment, configure the project environment automatically.
>
> Use C:\Users\Pi\miniconda3\python.exe explicitly for every Python command. Do not rely on the shell's default python.
>
> Search the homework folder and its parent directories for a .env file. Load environment variables from the nearest applicable .env file without displaying or exposing secret values. If a required package is missing, install it into C:\Users\Pi\miniconda3 using that interpreter.
>
> Create or update a requirements.txt file for project dependencies. Verify the environment by importing each required package before implementing the assignment.
>
> Run the finished program with:
> C:\Users\Pi\miniconda3\python.exe
>
> Keep all generated files inside the homework folder, and record my prompts in AI_prompts.md throughout the assignment along with date/time stamp.

### 2026-11-04 18:50 (EST, UTC-05:00)

> Put one section for each problem.

---

## Problem 2

### 2026-11-04 18:51 (EST, UTC-05:00)

> # PROBLEM 2

### 2026-11-04 18:51 (EST, UTC-05:00)

> Open data/campus_customs.db and show me  every table and its fields.

### 2026-11-04 18:52 (EST, UTC-05:00)

> Copy the original file to data/campus_customs_new.db — later problems update that working copy.
>
> Study the three open tickets so you see how they link to other tables.

### 2026-11-04 18:53 (EST, UTC-05:00)

> Start output/harness.md. For each table, list the fields and one short line on why that table matters for the agents.
>
> You will keep growing this harness file in later problems.

---

## Problem 3

### 2026-11-04 18:57 (EST, UTC-05:00)

> # PROBLEM 3
>
> Write an MCP server in mcp_server/ using FastMCP. It will talk to data/campus_customs_new.db. You do not need to connect or run it in this problem.
>
> Every agent in this homework uses the tools in this MCP server. You will add more tools to it later; for now write three tools you know you will need for the tickets in the database. Keep the names clear. Never invent any data, only use information in the database.
>
> In output/harness.md, list each of your three MCP tools. For every tool include: which table it reads, which ticket it helps unlock (101, 102, or 103), and one sentence on why that tool is the right one for that ticket. Vague lines like "reads inventory" score low — tie the tool to the ticket.
>
> Also add a short mcp_server/README.md file that explains what the MCP server is for, which database file it uses, and the three tools it has.

### 2026-11-04 19:01 (EST, UTC-05:00)

> help me understand in plain langague what you juust did for problem 2 and probme 3

### 2026-11-04 19:03 (EST, UTC-05:00)

> what does this mean "An AI agent can't open a database file on its own.? " I thought agent can write python code to read any database as long as it has permission

### 2026-11-04 19:05 (EST, UTC-05:00)

> in our case, MCP server's 3 tools are just read only. why do we even need them ?

### 2026-11-04 19:07 (EST, UTC-05:00)

> That is the part I don't understand "These three tools are the agent's only way to see the shop's records". You just said earlier that you read the database to read the records. So, these tools are not the only way

### 2026-11-04 19:09 (EST, UTC-05:00)

> but, what if there is a separate agent that is equipped with powerful tools ( that is not shop agent  ), then it would be able to do stuff?

### 2026-11-04 19:10 (EST, UTC-05:00)

> MCP tools are like badge ?

### 2026-11-04 19:11 (EST, UTC-05:00)

> so, what is MCP server in this analogy?

---

## Problem 4

### 2026-11-04 19:13 (EST, UTC-05:00)

> # PROBLEM 4
>
> In your vibe coder (Claude Code, Codex, or Cursor), add your MCP server to this project so the vibe coder can call the tools. Save the connection JSON text in .mcp.json at the project root (or however your vibe coder saves local MCP server lists).
>
> With your vibe coder connected, test each of your three MCP tools. Save the evidence in output/mcp_smoke.json. For every tool include:
>
> the prompt you asked the vibe coder
> the tool name
> the tool output (must match values in data/campus_customs_new.db)

### 2026-11-04 19:20 (EST, UTC-05:00) — new session after approving the campus-customs MCP server

> test each of your three MCP tools. Save the evidence in output/mcp_smoke.json. For every tool include:
>
> the prompt you asked the vibe coder
> the tool name
> the tool output (must match values in data/campus_customs_new.db)

### 2026-11-04 19:21 (EST, UTC-05:00)

> Tool loaded.

---

## Problem 5

### 2026-11-04 19:24 (EST, UTC-05:00)

> # Problem 5
>
> Build the agentic team for Campus Customs using PydanticAI: Boss, Inventory, Accounting, Facilities,
> and Customer Service. Include prompts, models, and agent loops so they can delegate work
> to each other with full connectivity.
>
> Put the agent prompts in backend/prompts/ — one file per agent. Put data types in backend/models.py,
> and the agent files under backend. Use your PORTKEY_API_KEY and only gpt-6-luna for every agent.
>
> Let's start with simple prompts for each agent needs. We will expand this later.

### 2026-11-04 19:35 (EST, UTC-05:00)

> show me the prompt for each agent

### 2026-11-04 19:34 (EST, UTC-05:00)

> More detailed prompts that cover all aspects of an agent's work and scope score higher than a short generic prompt. So, expantd the prompt if necessary.
>
> Add any tools the agents need to your MCP server so they can work on the open tickets. Shop facts come from the MCP server over data/campus_customs_new.db — do not invent a second shop-tools layer that bypasses MCP.
>
> Wire the agents so they append to output/audit_trail.json as they run: for each agent-loop step, record enough to audit later. Append to this file — do not wipe it each run.
>
> In output/harness.md, list each agent and each MCP tool (including ones you add in this problem) along with which table the tool uses. Also add a short safety section: the guardrails a real business would want when agents touch real customers and real money, plus limits that keep token use in check.
>
> Update mcp_server/README.md so the tool list matches what you have now.

### 2026-11-04 19:52 (EST, UTC-05:00)

> show me updated agent prompts

### 2026-11-04 19:55 (EST, UTC-05:00)

> how did we ensure the team are working together as a network rather than subsequentially?

### 2026-11-04 19:58 (EST, UTC-05:00)

> what you expect the team to do on each open ticket.

---

## Problem 6

### 2026-11-04 20:01 (EST, UTC-05:00)

> # Problem 6
>
> write down what you expect the team to do on each open ticket.
>
> Before you wire the backend, write down what you expect the team to do on each open ticket.
> Build output/desk_tickets.html — a page you can double-click with one tab per ticket (101, 102, and 103).
> Also add empty Cash and Reflection tabs for later problems (leave them blank or with a short "coming later" note for now).
>
> On each ticket tab, fill an Expected section only (leave room for an Actual section where we will fill after running the agents).

### 2026-11-04 20:06 (EST, UTC-05:00)

> show me detaileds of each ticket again

### 2026-11-04 20:09 (EST, UTC-05:00)

> give me concise diagram of agents, their capabilites and relationships

### 2026-11-04 20:11 (EST, UTC-05:00)

> so, MCP server itself is not an agent

### 2026-11-04 20:12 (EST, UTC-05:00) — re-asked after interrupt

> so, MCP server itself is not an agent?

### 2026-11-04 20:14 (EST, UTC-05:00)

> where is MCP server code saved?

### 2026-11-04 20:16 (EST, UTC-05:00)

> is one of the input to MCP server agent object?

### 2026-11-04 20:19 (EST, UTC-05:00)

> For each ticket's Expected section, write in your own words:
>
> Who the Boss should call first, and why
> All the agent delegations you expect — not "Boss calls everyone"
> Which MCP tools you expect that run to use
> Plans that send every specialist on every ticket score low. You will compare this plan to what actually happens when your agents resolve the three tickets.
>
> . don't cheat and run the agent to know the answer. we actually  need the answer

---

## Problem 7

### 2026-11-04 20:31 (EST, UTC-05:00)

> # Problem 7
>
> Your React frontend dashboard (the next problem) needs a backend it can call. In backend/main.py, use FastAPI and add routes that do the following:
>
> Return the three tickets and whether each is open or resolved
> Take a ticket id and run your agent team on that ticket
> Return recent agent events — what each agent said and which tools they used — so the board can refresh
> Approve a payment or purchase after a human clicks approve (agents only prepare the pay; this route is what actually changes cash)
> Return the current checking balance from cash_accounts
> Reset the database to the original values when you want to try a fresh run
>
> From the backend/ folder, start the server with:
>
> uvicorn main:app --reload --port 8000
>
> This turns on your backend at http://localhost:8000 so the frontend dashboard can call those routes.
>
> In output/harness.md, list each route in one line (what URL / what it does).

### 2026-11-05 00:10 (EST, UTC-05:00)

> what features did you add

### 2026-11-05 00:14 (EST, UTC-05:00)

> I think we can afford more than one agaent at a time, for the model we are chose. Or is it not a good idea to allow parallel agent?

### 2026-11-05 00:20 (EST, UTC-05:00)

> one team at a time is fine. we don't have to overcomplicate this.

### 2026-11-05 00:23 (EST, UTC-05:00)

> a question. which one would give a better product?

### 2026-11-05 00:25 (EST, UTC-05:00)

> let's keep one team at a time.

---

## Problem 8

### 2026-11-05 00:31 (EST, UTC-05:00)

> # Problem 8
>
> Build the frontend dashboard in frontend/ with React + Vite + TypeScript. The page should call the routes you built in Problem 7.
>
> At minimum the board should:
>
> List all three tickets
> Let you pick one ticket and start the agent team on it
> Show each agent and what they are saying / doing while the ticket runs
> Mark a ticket resolved when the run finishes
> Show a short summary of what each agent did on that ticket
> Let a human approve a pay or purchase when asked
> Show the checking balance (it should drop after an approved pay)
>
> Add other features that might be useful.
>
> Make the dashboard look good.
> this is a real desk people would want to sit at, so put thought into how it looks ( Be creative with the layout and feel, perhapse Make it aerospace industry theme )
>
> Tell the front end to talk to your backend at http://localhost:8000. On the backend, allow the Vite page origin (usually http://localhost:5173) so the browser is allowed to call those routes. Start the board with:
>
> npm run dev
>
> This opens the React desk in your browser so you can pick tickets and watch agents.
>
> Write output/design.md with what you chose for the dashboard look (layout, how agents read differently, how resolved tickets and cash show up) and why — including the creative choices that make it feel special and something humans would actually enjoy using. This is for humans.

### 2026-11-05 00:45 (EST, UTC-05:00)

> i like to see what it looks like. I got an error when I tried to run it

### 2026-11-05 00:50 (EST, UTC-05:00)

> is everything working ?

### 2026-11-05 00:55 (EST, UTC-05:00)

> insetad of FLIGHT, CARGO, FUEL, GROUND etc, I rather use the actual names though the theme looks cool. So, not as heavy on metaphor

---

## Problem 9

### 2026-11-05 21:13 (EST, UTC-05:00)

> # Problem 9
>
> Before testing the agents on a full run over the three tickets,
>  reset the working database data/campus_customs_new.db again so you start clean.
>  Note the starting checking balance. Then run all three tickets on the board (101, 102, 103) until each is resolved.
>
> Open output/desk_tickets.html from Problem 6.
> On each ticket tab, fill the Actual section from this run: which agents worked, what they delegated,
> and which tools they used. Keep your Expected section so you can compare the two.
>
> On the Cash tab of the same output/desk_tickets.html, itemize the money:
>
> Starting checking balance (after the reset)
> For each ticket: how cash changed when that ticket resolved, and why (which pay / purchase, dollar amount)
> Ending checking balance — it must match cash_accounts in the working database
> Wrong cash math loses points even if the board shows every ticket resolved. Also save:
>
> output/resolved_tickets.json — for each ticket: id, final status, short outcome, what each agent contributed, and any human approvals
> output/resolved_board.html — a page you can double-click with a screenshot of your React board for each resolved ticket (101, 102, and 103)
> Append real runs to output/audit_trail.json.
> Finish output/harness.md so it covers tables, MCP tools, the five agents, API routes, the dashboard, and safety rules.

---

## Problem 10

### 2026-11-05 23:39 (EST, UTC-05:00)

> # Problem 10
>
> Open output/desk_tickets.html and make reflections tab editable and savable

### 2026-11-05 23:43 (EST, UTC-05:00)

> can you show me the demo of the app that we have built, but may be at a slower pace so that I can follow along

### 2026-11-05 23:47 (EST, UTC-05:00)

> forget about the demo and I think we need to redo #9

---

## Reflection questions

### 2026-11-05 23:52 (EST, UTC-05:00)

> Answer the following question concisely in one or two sentence.
>     How would you evaluate the performance of the agents on each ticket and why?
>     For each ticket, how did Actual compare to the Expected plan you wrote earlier?
>     What would have been simpler as one agent with tools — and why?
>     Describe three new problems Campus Customs might face that this agent team could solve with the tools you built
>     Describe three new problems Campus Customs might face that this agent team could not solve with the tools you built, and explain the tools and agents you would need to solve them

### 2026-11-05 23:57 (EST, UTC-05:00)

> I am confused about this "Seeing every bill coming due: Accounting has no tool that lists all open bills, which is the gap 102 exposed?". didn't we just say agents did best on 102

### 2026-11-05 23:59 (EST, UTC-05:00)

> I didn't see this " The tools fell short on 102. ... That limit is in the toolset, not a mistake by the agent." in "[pasted ticket 102 activity log from the board]"

### 2026-11-06 00:01 (EST, UTC-05:00)

> I think the website app "ACTIVITY LOG" should show clearly if the boss asked and accounting respondins no tools.   Then, we need to fix the error you just found as well.

---

## Reflection tab

### 2026-11-06 00:10 (EST, UTC-05:00)

> Open output/desk_tickets.html and fill the Reflection tab. Use the following as base.
> Tie every answer to this app and the three tickets you ran — use the ticket tabs and Cash tab
>  on the same page as your evidence.  Generic AI essays without Campus Customs details are not acceptable. For this task, may be use an agent who is good at but not as techncial in terms of  coding, but good bussiness manager.
>
> (base answers pasted: 1. how well the agents did on 101/102/103; 2. actual vs. expected; 3. what would be simpler as one agent (ticket 102); 4. three problems the team could solve (price offer, vendor chasing payment, changed rent request); 5. three problems it couldn't solve (seeing every bill coming due, placing and receiving restock orders, contacting customers or the landlord))

---

## Project layout and README

### 2026-11-06 00:22 (EST, UTC-05:00)

> Does the layout look something like this? (pasted target tree: AI_prompts.md, requirements.txt, .env.example, .gitignore, .mcp.json, README.md, data/, mcp_server/, frontend/, backend/ with prompts/, output/ with harness.md, mcp_smoke.json, desk_tickets.html, design.md, resolved_tickets.json, resolved_board.html, audit_trail.json, github_url.txt)

### 2026-11-06 00:24 (EST, UTC-05:00)

> what do we need to change to get expected layout?

### 2026-11-06 00:27 (EST, UTC-05:00)

> README should explain: copy original DB to the working copy when you need a clean run, start MCP server, start FastAPI backend, start the React board, reset the DB before a full three-ticket run.

### 2026-11-06 00:31 (EST, UTC-05:00)

> show me conceptual diagram of different agents in this type of bussiness problem. Then, show me conceptual diagram of how code/harness design etc are structured

---

## GitHub

### 2026-11-06 00:36 (EST, UTC-05:00)

> Push your code to a public GitHub repository so graders can clone it.
>
> Do not push your real .env to the GitHub repo. Do include both database files under data/ (the original and your working copy) so graders can run your app easily.
