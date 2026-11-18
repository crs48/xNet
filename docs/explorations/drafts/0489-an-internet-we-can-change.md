---
title: An Internet We Can Change
status: complete-local-essay
date: 2026-10-24
description: From dinner parties and shared workspaces to software that communities can shape together.
editorial_note: Written from Chris's October 24 interview. Personal history comes from his account; the future community-tool scenario is imagined. Complete local essay, not published.
---

# An Internet We Can Change

Ever since I got into programming, I've wanted something like a GitHub for everyone: a place where you could show what you're working on, invite people to help, and contribute something back when you improve someone else's project.

What I love about code is how close the blueprint is to the thing itself. You can read the instructions for a piece of software, change them, and run what you've changed. Someone else's work can become the starting point for yours. That makes a certain kind of collaboration feel natural, and I've spent decades wondering how to bring more of it into the rest of life.

My first startup crowdfunded dinner parties. It was a wildly impractical business idea. But we wanted to have more dinner parties with our friends, and I was interested in whether technology could help us make that happen.

Later, I got into coworking. We took restaurants that were only open for dinner and opened them during the day as places to work. As we added locations across New York and San Francisco, I had more places to go and more people to meet.

My product was my office. I got to work out of it every day.

That was a lovely way to build a product. The technology made it easier to get into spaces where people could spend time together, and I got to be one of those people. Improving the product meant improving a part of the world I actually lived in.

Then COVID happened. It was a hard time to be in coworking. I found myself thinking about all the work behind the experience: the project management, the integrations, the information spread across tools that I'd had to wrangle as a CTO. Making those things work together had taken so much effort. I wanted a better way to keep and use the data underneath them.

That took me into CRDTs: data structures that let people make changes independently and combine them according to shared rules. At Recurse Center, I studied them, built my own, and made collaborative document editors and to-do lists. I got excited about what could happen when several people had their own copy of something and could keep working on it together.

Behind all this, I still wanted the dinner parties and the shared spaces. The data work was another way into the same question: how do we make it easier to organise the lives we want with the people around us?

You can see that question in how difficult it can be to connect things we already know. A conversation starts in a DM, becomes an email, turns into a task, and eventually lands in a project tool. An idea from a social post might have started all of it. Each piece makes sense to the people involved, but keeping the connections intact becomes another job.

Agents have made some of this easier for me. As an engineer, I can connect one to GitHub, Linear, or Gmail and have it work across them. Yet I still want the connections and the understanding we build to be something we can keep, inspect, and use elsewhere. I don't want my ability to make sense of my own life to depend on the particular agent I happened to assemble it with.

This is where xNet comes from. I've written about [data as soil](https://xnet.fyi/blog/data-should-work-like-soil) and [interfaces that fit together like bricks](https://xnet.fyi/blog/clutch-power). The underlying hope is that information can support more than the first application built around it. Your plans, conversations, and work should remain useful as you find new ways to look at them and new people to work with.

For a long time, I concentrated on that foundation. You would still need to be an engineer to build much on top of it. Now coding agents are making it possible to start with an idea, describe what you want, and get something you can try. The distance has become shorter, though there's still plenty of work between generated code and a tool you can trust.

That changes what I want to build next. I'd like xNet to be a place where friends can talk, make things, and change the tools they use together. The current desktop prototype starts with chat and lets you bring a local coding agent into the process. We're working on extensions whose versions and development conversations stay connected, so the next change has somewhere to begin.

Imagine bringing this back to a group that wants to host more dinners. Someone shares an idea in the chat, and a friend brings in a planning tool another group made. Together they try it, notice what's missing, and ask an agent to help change it. One person wants a simpler way to volunteer to cook. Another needs to use the whole thing with a keyboard. Someone else wants to see what changed before the group adopts it.

As the tool improves, they can share that version with the group they borrowed it from. The useful pattern from open source is there: show your work, learn from what already exists, and make it possible for someone else to build on what you learned.

The dinner itself still needs people to shop, cook, and clean up. Sharing a plan doesn't make that labour disappear. What I want is for the tooling to be something the people doing the work can shape, rather than another fixed set of rules they have to work around.

For this to be more than a collection of disconnected mini-apps, they need some common foundations. A task needs a stable identity so two tools can refer to the same task. They need an agreed way to describe what it means, and rules about who can read or change it. People need to save work on their own devices, exchange changes, and understand which version they're looking at.

Those are the kinds of primitives I want to last. They should let a community change its calendar or planning board without rebuilding its whole digital life. Open formats and documented interfaces would also let other people build tools that I never thought to make. A group could share its planning software while keeping its guest list and private conversations to itself.

I want enough shared structure for things to fit together, with room for people to decide what they want to build. Their communities will change. The architecture needs to leave space for that.

A large part of this is consent. Our software is already intimate. It holds our private conversations, our unfinished plans, and things about us that we might choose to share with one person and keep from another. Connecting more of that information makes the quality of those choices matter even more.

The idea of enthusiastic consent, as people discuss it in intimate spaces and sacred sexuality, feels useful here. I want to bring that attention to willingness and boundaries into the way we relate to software. An agreement should be something we understand and can revisit as the relationship changes.

With the dinner planner, that could mean saying: you can use this planning conversation and the recipes I've chosen to share. My other messages stay private. Let me review what you're going to send to the group. If I like how that works, perhaps I'll allow more next time.

An agent could help us work out those boundaries. It could explain what a tool wants to do, offer a narrower choice, and turn our preferences into rules we can inspect. Later, I could say that a reminder was helpful but a suggestion felt intrusive, and change how the tool works with me.

The software has to enforce what we agree to. A reassuring conversation alone can't provide that. There should be visible controls for people who prefer them, a way to say no without repeated pressure, and a way to stop future access. It also needs to be honest that stopping access cannot recall information already shared.

The group matters here too. My wish to connect everything doesn't give me permission to open up someone else's private life. Community software needs room for different boundaries, including people who want to take part without using an agent at all.

That is one reason I care about making this approachable. The person who knows what their community needs may have no interest in programming. They should still be able to suggest a change, try a version, or help someone understand why a feature isn't working for them. Ink & Switch's work on [malleable software](https://www.inkandswitch.com/essay/malleable-software/) explores this gradual path from using software to changing it, with help from other people.

I'd like that help to be part of the experience. A friend who understands the code might check a change. Someone who uses a screen reader might notice a problem the rest of the group missed. Taking part should not require everyone to have the same skills, a paid agent subscription, or the desire to maintain software.

There's a longer-term social hope behind all this. I imagine more ways for people to contribute to things that excite them and respond to needs they see around them. Much of that energy has to fit around the job that pays the rent. I'd like to experiment with arrangements that give people more room to choose how they work together and how they support one another.

Software alone won't settle how that work gets paid for. But communities need tools for trying different arrangements, and they should be able to change those tools as they learn. Having to turn every idea into a startup is a large constraint on what we get to try.

The first place I want to explore this is with my own friends. We ought to be able to make something useful for our shared lives, keep it small if that suits us, and let another group take it in a different direction. The history should help them understand what we tried. Our data and the tools we made should still be available if the original author moves on or an agent service changes.

The work on [local-first software](https://www.inkandswitch.com/essay/local-first/) puts lasting access alongside collaboration and control. Living up to that takes ongoing care: backups, recovery, readable formats, and people able to maintain what we depend on. Community ownership needs practical ways for new people to take on that care.

This remains an ambition for xNet. Even as its maker, I've found it too complicated to reach for in some of my own projects. A desktop prototype also leaves out people who mainly use their phones. Those are reasons to keep testing the idea against ordinary use, with the people I hope it will serve.

I keep coming back to what I liked about coworking: I could spend the day inside something I was helping to build. There were other people there, with needs and ideas of their own. The place could become different because we were in it.

I'd like our software to have more of that quality. A living system changes through its relationships with the people around it. For software, that could start quite simply: a community notices a need, makes something together, and keeps shaping it as their life changes.

That's the GitHub for everyone I still want to find my way towards. We could show what we're working on and welcome each other's contributions, knowing that the things we make will remain ours to change as our lives change with them.
