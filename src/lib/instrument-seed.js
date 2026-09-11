// The six instruments, as data.
//
// Generated from the Wix CMS exports and then hand-checked; this file is the
// source of truth now that those surveys are retired. It is committed rather
// than uploaded because it is authored content — forty questions and their
// commentary, the scales, the bands — and it belongs in version control where a
// change to a question shows up in a diff.
//
// `seedInstruments` in src/lib/instrument-seed-apply.js applies it, matched on
// the keys below, so it can be re-run without duplicating anything.
//
// Four things were corrected on the way in, each diagnosed before the import:
//
//   Bands carry numeric bounds. On Wix the range lived only inside the advice
//   prose, so nothing could select the band that applied and both banded
//   reports printed all of them.
//
//   Every instrument's maximum is derived from its own questions and scale
//   rather than hand-typed. All four derived values match the figures Wix
//   carried, which is the check that the scales and question sets came across
//   intact.
//
//   The Chaos comments box moved out of "Your Challenges" into its own
//   section, so the report stops printing that heading above a question
//   called Comments.
//
//   Seven orphaned options and the Yes/No lists attached to text questions
//   were left behind.
//
// Two gaps are known and deliberate. The Product Success Quiz has no
// per-question commentary at all — nine paragraphs still to write. And the
// linked articles could not come across: the export carries Wix post ids with
// no titles or URLs, so those become Resource records once somebody resolves
// them.
//
// Three comment questions are retired rather than deleted (active: false, which
// is what the seeder writes and what getAssignedActivities filters on). They
// asked "what else would you like to tell us?" immediately before the two
// closing questions ask "what else do you want to tell us?" — the same sentence
// twice, going to opposite audiences: the instrument's version is read by the
// respondent's own team, and the closing pair are admin-only and say on screen
// that they are not part of the team's report.
//
// The Product Success Quiz's "About You" is retired for a different reason: it
// asked which product was being scored, and the assessment now carries that as
// a required `subject`. The respondent is told which product on the intro
// screen and again on their summary, so asking them to name it was asking for
// something they had just been given — and two spellings of one product is the
// shape that makes an aggregate stop being about one thing.
//
// Portfolio Health's magic-wand question stays. It is not a comments box: it
// asks something specific, and several people's answers side by side are a page
// a facilitator reads out.
//
// Retired, not removed, because Response rows key on the question and a delete
// would take any answer to it with it. Restoring one is a matter of flipping
// the flag back and applying the source again.

export const INSTRUMENT_SEED = {
  "scales": [
    {
      "key": "importance",
      "name": "Importance",
      "hint": "how much this matters to your team right now",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "Not needed",
          "points": 0
        },
        {
          "label": "Nice to have",
          "points": 1
        },
        {
          "label": "Important",
          "points": 2
        },
        {
          "label": "Critical",
          "points": 3
        }
      ]
    },
    {
      "key": "execution",
      "name": "Current execution",
      "hint": "how well your team does it today",
      "unknown_label": "I don't know",
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "Not done",
          "points": 0
        },
        {
          "label": "Inconsistent",
          "points": 1
        },
        {
          "label": "Good",
          "points": 2
        },
        {
          "label": "Excellent",
          "points": 3
        },
        {
          "label": "I don't know",
          "points": null
        }
      ]
    },
    {
      "key": "experience",
      "name": "Experience",
      "hint": "how much you've done this",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "None",
          "points": 0
        },
        {
          "label": "Limited",
          "points": 1
        },
        {
          "label": "Some",
          "points": 3
        },
        {
          "label": "Extensive",
          "points": 5
        }
      ]
    },
    {
      "key": "skills",
      "name": "Skills",
      "hint": "how good you are at it",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "None",
          "points": 0
        },
        {
          "label": "Basic",
          "points": 1
        },
        {
          "label": "Good",
          "points": 3
        },
        {
          "label": "Excellent",
          "points": 5
        }
      ]
    },
    {
      "key": "interest",
      "name": "Interest",
      "hint": "how much you want to do more of it",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "None",
          "points": 0
        },
        {
          "label": "Limited",
          "points": 1
        },
        {
          "label": "Moderate",
          "points": 3
        },
        {
          "label": "Passionate",
          "points": 5
        }
      ]
    },
    {
      "key": "yes_no",
      "name": "Yes / No",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "No",
          "points": 0
        },
        {
          "label": "Yes",
          "points": 1
        }
      ],
      "hint": null
    },
    {
      "key": "challenge",
      "name": "Challenge scale",
      "unknown_label": null,
      "unknown_treatment": "excluded",
      "options": [
        {
          "label": "Absolutely",
          "points": 0
        },
        {
          "label": "Somewhat",
          "points": 3
        },
        {
          "label": "Not so much",
          "points": 5
        },
        {
          "label": "Never",
          "points": 8
        }
      ],
      "hint": null
    },
    {
      "key": "yes_no_unknown",
      "name": "Yes / No / Unknown",
      "unknown_label": "Unknown",
      "unknown_treatment": "scored",
      "options": [
        {
          "label": "Unknown",
          "points": 0
        },
        {
          "label": "No",
          "points": 1
        },
        {
          "label": "Yes",
          "points": 2
        }
      ],
      "hint": null
    }
  ],
  "instruments": [
    {
      "key": "team_gap",
      "name": "Team gap analysis",
      "question_source": "library",
      "report_style": "gap",
      "ask_ownership": true,
      "scale_keys": [
        "importance",
        "execution"
      ],
      "sections": [
        "DEFINE",
        "COMMIT",
        "DESCRIBE",
        "CREATE",
        "PREPARE",
        "DELIVER",
        "LEARN"
      ],
      "subject_label": null,
      "sort_order": 1,
      "tagline": "Where the work matters more than it is being done",
      "description": "A team rates every activity on how much it matters and how well it is done today, and names who actually does it. The distance between the two is the finding, and it drives the engagement. Pick the activities per assessment; nobody answers all of them."
    },
    {
      "key": "personal",
      "name": "Personal assessment",
      "question_source": "library",
      "report_style": "profile",
      "ask_ownership": false,
      "scale_keys": [
        "experience",
        "skills",
        "interest"
      ],
      "sections": [
        "DEFINE",
        "COMMIT",
        "DESCRIBE",
        "CREATE",
        "PREPARE",
        "DELIVER",
        "LEARN"
      ],
      "subject_label": null,
      "sort_order": 2,
      "tagline": "What one person brings to the same activities",
      "description": "An individual rates their own experience, skills, and interest in each activity. The output is a development profile belonging to that person, and it can be crossed against a team gap assessment to show what a team needs against what its people can actually do."
    },
    {
      "key": "portfolio_health",
      "name": "Portfolio Health Check",
      "tagline": "Which portfolio challenges resonate most with you and your team?",
      "description": "Every product leader wrestles with the same tug-of-war: endless ideas, limited resources, and way too many opinions about what’s most important. It’s easy to get stretched thin—spreading teams across competing priorities until nothing makes a real impact. The result? Slower progress, frustrated stakeholders, and strategic goals that remain more aspiration than achievement.\n\nThis quick survey is designed to surface which challenges resonate most with you and your team. Don’t overthink it—your first reaction is often the most telling. In just a few minutes, you’ll see where your organization’s biggest product headaches align with the patterns we see across dozens of companies like yours.",
      "sections": [
        "Challenges",
        "What would you do?"
      ],
      "scale_keys": [
        "challenge"
      ],
      "instructions": "Please help us understand your situation by responding to this quick survey. You should be able to respond in only a few minutes (if you don’t think too much about it).",
      "max_score": 56,
      "rating_questions": 7,
      "question_source": "instrument",
      "report_style": "distribution",
      "ask_ownership": false,
      "sort_order": 4,
      "subject_label": null
    },
    {
      "key": "product_success",
      "name": "Product Success Quiz",
      "tagline": "Get insights on the health of your products and processes.",
      "description": "Need to assess the overall health and strategic value of a single product within your portfolio? This survey evaluates performance, market alignment, and competitive position using a set of straightforward yes/no questions. Each “Yes” indicates a positive attribute, while each “No” highlights a potential concern.\n\nBy reviewing these factors together, you’ll gain a clear, unbiased picture of whether the product is a strong candidate for continued investment, should be maintained with caution, needs a strategic reassessment, or may be approaching end-of-life.",
      "sections": [
        "Performance",
        "Market Fit",
        "Competitive"
      ],
      "scale_keys": [
        "yes_no"
      ],
      "instructions": "For one of your products, answer the following questions to get an overview of your product's health.",
      "max_score": 9,
      "rating_questions": 9,
      "question_source": "instrument",
      "report_style": "distribution",
      "ask_ownership": false,
      "sort_order": 6,
      "subject_label": "Which product are you assessing? A code name is fine."
    },
    {
      "key": "idea_reality",
      "name": "Idea Reality Check",
      "tagline": "Test the idea against reality before the market does.",
      "description": "Most product ideas sound reasonable in isolation. The real question is whether your organization is positioned to make the idea succeed. The goal is not to green-light ideas prematurely, but to identify where additional learning, validation, or investment is required before committing serious resources.\n\nThe Idea Reality Check is a quick self-assessment designed to surface risk across three areas that consistently determine success or failure: market familiarity, internal capabilities, and competitive context. It doesn’t judge the quality of the idea itself. Instead, it evaluates whether you have the experience, evidence, and readiness required to turn the idea into a viable product.",
      "sections": [
        "Market",
        "Capabilities",
        "Competitive"
      ],
      "scale_keys": [
        "yes_no_unknown"
      ],
      "instructions": "For the product idea you’re evaluating, answer the following questions. If the answer is unclear, choose Unknown. Uncertainty is valuable input—it highlights where risk still exists.",
      "max_score": 18,
      "rating_questions": 9,
      "question_source": "instrument",
      "report_style": "distribution",
      "ask_ownership": false,
      "sort_order": 5,
      "subject_label": "Which idea are you evaluating? A code name is fine."
    },
    {
      "key": "chaos",
      "name": "Chaos Assessment",
      "tagline": "Find out which obstacles are preventing you from consistently achieving product success.",
      "description": "What really prevents you from defining, developing, and delivering products people actually want to buy and use? Most organizations don’t fail because they lack talent or effort—they fail because chaos creeps in. Priorities shift, roles blur, customer input gets drowned out, and soon the team is running from fire drill to fire drill instead of moving forward with purpose.\n\nThis self-assessment will help you uncover whether you’re on a clear path to product success or stuck in a cycle of misalignment, disappointing launches, and endless churn. Answer honestly and quickly—don’t overthink it. Your first instinct usually reveals where the chaos lives.",
      "sections": [
        "Your Challenges"
      ],
      "scale_keys": [
        "challenge"
      ],
      "instructions": "For each of the following, do any of these sound familiar?",
      "max_score": 80,
      "rating_questions": 10,
      "question_source": "instrument",
      "report_style": "distribution",
      "ask_ownership": false,
      "sort_order": 3,
      "subject_label": null
    }
  ],
  "questions": [
    {
      "label": "Product Success Consistency",
      "text": "Our first product was a great success, but the second struggled, and the third was a disaster.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "01",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Many companies nail the first product because it solves a crystal-clear problem. Over time, decisions drift away from real customer needs and toward satisfying internal stakeholders. Sustained success requires staying relentlessly customer-driven, not assuming lightning will strike twice just because it struck once.",
      "critical": false,
      "required": false,
      "blog_id": "607878550f5c620041b3f101"
    },
    {
      "label": "Strategy Alignment",
      "text": "Our priorities often shift, making it challenging to align our product strategy and roadmap.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "02",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Without a clear strategy, every new idea feels urgent, and teams end up chasing them all. Strategy is what tells you which opportunities to pursue and which to ignore. Market responsiveness is important, but it has to be balanced with focus, or your roadmap becomes a random walk instead of a purposeful path.",
      "critical": false,
      "required": false,
      "blog_id": "624f5afa83b7000ccb1f6cf1"
    },
    {
      "label": "Product Launch Readiness",
      "text": "We build great products, but our launches feel chaotic, and adoption is lower than expected.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "03",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "A good product can still fail in the market if the launch is sloppy. Launch isn’t a checklist—it’s a campaign with clear objectives for customers, prospects, and internal teams. When you define goals first and let them drive the activities, adoption rises, teams align, and launches stop feeling like barely controlled chaos.",
      "critical": false,
      "required": true,
      "blog_id": "680800a95a82cbea98fb7ebd"
    },
    {
      "label": "Prioritization Challenges",
      "text": "We struggle to say \"no\"—our backlog is packed with stakeholder requests, but we lack a clear prioritization framework.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "04",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Backlogs grow like weeds. Without a way to filter, you’ll end up with decades worth of “must-haves” no team could ever deliver. A structured prioritization framework makes the trade-offs explicit, ensures the most valuable work gets done, and removes the guilt from saying “no.”",
      "critical": false,
      "required": true,
      "blog_id": "624f5afa83b7000ccb1f6cef"
    },
    {
      "label": "Customer Centricity",
      "text": "Our team spends more time debating internal opinions than engaging with customers to validate our assumptions.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "05",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Internal debates are cheap theater without customer input. As the saying goes: “Our opinions, while interesting, are irrelevant.” Data and human judgment together lead to good product decisions, but the data has to come from customers and potential customers. Otherwise, you’re just guessing loudly.",
      "critical": false,
      "required": false,
      "blog_id": "606082a47b096c00156175c4"
    },
    {
      "label": "Roles and Responsibilities",
      "text": "There's constant friction between product, engineering, and marketing because no one is sure who owns what.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "06",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Ambiguity is the enemy of collaboration. Without clear roles and responsibilities, every decision turns into a turf war. Defining ownership and building structured product processes reduces friction and gets everyone working toward the same goals instead of pulling in opposite directions.",
      "critical": false,
      "required": false,
      "blog_id": "6172f22b09449a0016613c3e"
    },
    {
      "label": "Data-Driven Decision Making",
      "text": "We have plenty of data, but making sense of it and using it to drive decisions is a major challenge.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "07",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Too much data can paralyze teams just as easily as too little. The trick is to align metrics with the product’s stage in its lifecycle—what matters for a new product isn’t the same as what matters for one in growth or maturity. Focus on the right data at the right time, and you’ll actually use it to guide decisions.",
      "critical": false,
      "required": false,
      "blog_id": "647f842fb3935b299b0b6438"
    },
    {
      "label": "Roadmap Communication",
      "text": "Our roadmap changes frequently, and stakeholders are often confused about what’s coming next.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "08",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "A roadmap isn’t a task list; it’s a strategic tool. It should outline the big problems you plan to solve over time, not just the next few features. Separating the roadmap (strategic intent) from the release plan (tactical execution) helps set expectations and keeps everyone—from executives to customers—on the same page.",
      "critical": false,
      "required": false,
      "blog_id": "62b05619b5d119a157abca26"
    },
    {
      "label": "Cross-Functional Collaboration",
      "text": "We spend more time managing misalignment between teams than actually moving products forward.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "09",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Misalignment is death by a thousand cuts. Every miscommunication adds friction, slows progress, and undermines morale. Product management is a team sport, and alignment comes from involving the right people early, sharing information openly, and treating communication as an everyday habit, not an afterthought.",
      "critical": false,
      "required": true,
      "blog_id": "624f5afa83b7000ccb1f6cf4"
    },
    {
      "label": "Process Standardization",
      "text": "Every product manager seems to have their own way of working—there's no standard process, and knowledge gets lost when people leave.",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Your Challenges",
      "section_sort": 1,
      "sort": "10",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "As soon as you hire a second product manager, consistency becomes non-negotiable. Without standard practices, you lose efficiency, alignment, and critical knowledge every time someone leaves. Establishing shared processes and systems preserves institutional memory and gives everyone a common playbook to work from.",
      "critical": false,
      "required": true,
      "blog_id": "675defcf84aefdca91c6f48f"
    },
    {
      "label": "Comments",
      "text": "What else would you like to tell us?",
      "instrument_keys": [
        "chaos"
      ],
      "section": "Comments",
      "section_sort": 99,
      "sort": "11",
      "question_type": "text",
      "scale_key": null,
      "commentary": "",
      "critical": false,
      "required": false,
      "blog_id": "",
      "active": false
    },
    {
      "label": "Sales Experience",
      "text": "Does your sales team have experience selling to this buyer?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Market",
      "section_sort": 1,
      "sort": "1",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "Selling to a new buyer isn’t just a messaging problem—it’s a learning curve. Different buyers value different outcomes, use different language, and evaluate risk differently. If your sales team hasn’t sold to this buyer before, expect longer sales cycles, more stalled deals, and higher dependency on product and leadership support early on.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Market Track Record",
      "text": "Have you successfully sold products into this market segment?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Market",
      "section_sort": 1,
      "sort": "2",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "A “Yes” here indicates more than awareness—it signals proof that customers in this segment will buy from you. A “No” doesn’t mean the idea is wrong, but it does mean you’re entering discovery mode, not execution mode. Market entry risk should be planned, funded, and staffed deliberately.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Customer Proof",
      "text": "Do you have customer success stories for this market segment?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Market",
      "section_sort": 1,
      "sort": "3",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "Success stories demonstrate that customers not only buy—but achieve outcomes. Without them, marketing claims lack credibility and sales teams rely on promises instead of proof. If this is missing, expect heavier reliance on pilots, references, and executive involvement to establish trust.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Domain Expertise",
      "text": "Do you have expertise in this domain or industry?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Capabilities",
      "section_sort": 2,
      "sort": "4",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "Domain expertise shapes product decisions, prioritization, and credibility with customers. Without it, teams tend to underestimate complexity and overestimate speed. If expertise exists but is scarce or unavailable, this still represents a delivery risk—not a checkbox win.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Category Experience",
      "text": "Have you previously delivered products in this product category?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Capabilities",
      "section_sort": 2,
      "sort": "5",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "Experience in a product category matters because patterns repeat—buyer expectations, pricing norms, adoption challenges, and support needs. If this category is new, plan for more iterations, more mistakes, and more rework before achieving product-market fit.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Technology Familiarity",
      "text": "Is the basic technology familiar to your team?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Capabilities",
      "section_sort": 2,
      "sort": "6",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "“Familiar” doesn’t mean theoretically understood—it means used, debugged, and supported in real products. Unfamiliar technology increases delivery risk, lengthens timelines, and shifts effort from solving customer problems to solving internal ones. That trade-off should be intentional, not accidental.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Competitive Awareness",
      "text": "Are the dominant competitive players familiar to your team?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Competitive",
      "section_sort": 3,
      "sort": "7",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "If you don’t understand who customers compare you to, you don’t understand how buying decisions are made. Competitive unfamiliarity leads to weak positioning, reactive roadmaps, and sales conversations that miss what actually matters to buyers.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Proven Demand",
      "text": "Is there clear evidence that customers already purchase similar solutions from competitors?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Competitive",
      "section_sort": 3,
      "sort": "8",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "This question tests demand, not differentiation. If customers are already buying similar solutions, the risk shifts from “Does the market exist?” to “Why would they choose us?” If no one is buying anything like this, you may be inventing a market—and that requires far more time, capital, and patience.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Lost Deals",
      "text": "Have you lost deals because you do not have this product?",
      "instrument_keys": [
        "idea_reality"
      ],
      "section": "Competitive",
      "section_sort": 3,
      "sort": "9",
      "question_type": "rating",
      "scale_key": "yes_no_unknown",
      "commentary": "Lost deals are one of the strongest signals of unmet demand—but only when the reason is clear and consistent. If deals are lost sporadically or anecdotally, this may indicate edge cases rather than a scalable opportunity. Pattern matters more than passion here.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Final Thoughts",
      "text": "Anything else you want to share?",
      "instrument_keys": [
        "idea_reality",
        "product_success"
      ],
      "section": "Comments",
      "section_sort": 5,
      "sort": "A",
      "question_type": "text",
      "scale_key": null,
      "commentary": "",
      "critical": false,
      "required": false,
      "blog_id": "",
      "active": false
    },
    {
      "label": "Project versus product",
      "text": "My team is confused about the difference between a project and a product.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "1",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "This confusion is more common than anyone wants to admit. A project is a temporary effort: it has a clear start, a defined end, and usually a small celebration when it’s done. A product, on the other hand, doesn’t really “end.” It’s a living thing that evolves, adapts, and—if well managed—continues to deliver value for years. Projects deliver outputs, while products deliver outcomes. When teams confuse the two, they start treating launch day as the finish line instead of the starting gun, which leads to abandoned products and disappointed customers.",
      "critical": false,
      "required": true,
      "blog_id": "67b659118073607eeca37a31"
    },
    {
      "label": "What to build",
      "text": "My team is unsure about what we should build and what we should avoid.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "2",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "When there’s no clarity, every new request looks like a candidate for the backlog. The problem is that not every idea deserves your time or investment. Product management isn’t about collecting a long list of possible features; it’s about focusing resources where they matter most. Teams that don’t establish clear criteria end up chasing shiny objects, wasting effort, and frustrating engineers, executives, and customers alike. Strong product leaders know that clarity about what not to build is just as important as clarity about what to build.",
      "critical": false,
      "required": true,
      "blog_id": "621f8780f34044add6325622"
    },
    {
      "label": "Too many ideas",
      "text": "We have too many ideas and don’t know which to choose.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "3",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Ideas are plentiful—everyone from the CEO to the intern has them. The challenge is filtering the signal from the noise. Without a disciplined prioritization process, teams either freeze in endless debates or try to tackle everything at once, burning out in the process. The best organizations use structured methods to weigh impact, evidence, alignment, and timing. That way, the ideas that move forward are backed by reasoning, not politics or volume. The rest aren’t discarded, just parked until the right moment.",
      "critical": false,
      "required": true,
      "blog_id": "624f5afa83b7000ccb1f6cef"
    },
    {
      "label": "Too many products",
      "text": "We have too many products and want to keep the best and retire the rest.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "4",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Most portfolios eventually bloat. Every product added feels like progress at the time, but over the years you’re left with a cluttered mix of winners, laggards, and zombies. Keeping everything alive spreads resources thin and drains focus. Retiring products is rarely popular—customers complain, sales resists, and executives sometimes cling to “their” products—but avoiding the decision is worse. The healthiest companies prune intentionally, focusing resources on the strongest performers and letting go of the rest before they drag the business down.",
      "critical": false,
      "required": true,
      "blog_id": "688d4b907ae5e5096a925330"
    },
    {
      "label": "Vision",
      "text": "Our lack of vision has been embarrassing in front of leadership and customers.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "5",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Few things damage credibility faster than stumbling when someone asks, “Where is this product headed?” Without a vision, teams drift, leaders lose confidence, and customers start shopping for alternatives. Vision doesn’t need to be lofty prose—it just needs to be clear, directional, and believable. It tells people why the product exists, where it’s going, and why anyone should care. Without it, your roadmap is indistinguishable from a random to-do list, and your strategy sounds like “whatever comes next.”",
      "critical": false,
      "required": true,
      "blog_id": "67e43ecbbc1b19d709684611"
    },
    {
      "label": "Competition",
      "text": "We just acquired our biggest competitor. Now we have duplicate products and are struggling to rationalize the portfolio.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "6",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Acquisitions look glamorous in press releases, but in the trenches, they’re messy. Suddenly you’ve inherited duplicate products, competing roadmaps, and two sets of customers convinced their product should win. Rationalizing that portfolio isn’t about compromise—it’s about making the hard calls quickly and communicating them clearly. Delay drives up costs, confuses customers, and creates internal turf wars. Success comes from assessing overlaps, sunsetting wisely, and focusing on a single, stronger portfolio that actually makes sense in the market.",
      "critical": false,
      "required": true,
      "blog_id": "624f5afa83b7000ccb1f6cf4"
    },
    {
      "label": "Saying No",
      "text": "We rarely say “no” to new product or feature ideas from customers, executives, salespeople, and others.",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "Challenges",
      "section_sort": 1,
      "sort": "7",
      "question_type": "rating",
      "scale_key": "challenge",
      "commentary": "Every request feels urgent in the moment, but saying “yes” to everything is the fastest way to kill a product. A product crammed with disconnected features becomes confusing to customers and unmanageable for teams. The discipline is in focusing on customer problems, not every suggested solution. Problems are durable and worth solving; features are just guesses. By anchoring discussions on the underlying problems, product leaders can say “no” without guilt—because the real “yes” is to building solutions that actually matter.",
      "critical": false,
      "required": false,
      "blog_id": "68c1b660eb19dd158fa420fe"
    },
    {
      "label": "Magic wand",
      "text": "If you had an extra $1,000,000, where would you put it?",
      "instrument_keys": [
        "portfolio_health"
      ],
      "section": "What would you do?",
      "section_sort": 2,
      "sort": "8",
      "question_type": "text",
      "scale_key": null,
      "commentary": "A million dollars sounds like freedom, but without a strategy, it’s just fuel for chaos. Some teams throw money at features no one wanted; others pump it into sales or marketing before the product is ready. The right question isn’t “where can we spend this money fastest?” but “which investments advance our strategy, solve real problems, and create measurable impact?” Without that clarity, the million dollars vanishes—and you’re left with the same issues, only more expensive ones.",
      "critical": false,
      "required": false,
      "blog_id": "607878550f5c620041b3f101"
    },
    {
      "label": "About You",
      "text": "Which product are you assessing? Use a code name to keep the real name private.",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Your Product",
      "section_sort": 1,
      "sort": "0",
      "question_type": "text",
      "scale_key": null,
      "commentary": "",
      "critical": false,
      "required": false,
      "blog_id": "",
      "active": false
    },
    {
      "label": "Revenue Opportunity",
      "text": "Does this product generate sufficient revenue opportunity to justify continued investment?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Performance",
      "section_sort": 2,
      "sort": "1",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Revenue isn't the only measure of a product, but it's the one the business eventually asks about. The question isn't whether the product makes money today—it's whether the opportunity it serves is large enough to earn its share of people and budget. A product that can't pay its own way is being subsidized by the rest of the portfolio. That should be a deliberate decision, not an accident nobody has explored in years.",
      "critical": false,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Support Costs",
      "text": "Are engineering, support, and operational demands for this product reasonable relative to the value it delivers?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Performance",
      "section_sort": 2,
      "sort": "2",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Every product carries a tax: bug fixes, support tickets, infrastructure, security patches, and the few engineers who still remember how the product internals work. Healthy products pay that tax easily. Struggling ones consume more of it every year, pulling people away from work that would move the business forward. When maintenance crowds out improvement, the product isn't just standing still—it's getting more expensive to keep standing.",
      "critical": true,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Customer Usage",
      "text": "Are customers relying on this product?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Performance",
      "section_sort": 2,
      "sort": "3",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Purchase is not adoption. A product customers bought but don't use is a renewal waiting to fail. Adoption shows up in behavior: regular use, workflows built around the product, and complaints when it's down. If customers could switch it off tomorrow without noticing, the revenue behind it is far less secure than the sales report suggests.",
      "critical": true,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Market Growth",
      "text": "Is the target market for this product stable or growing?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Market Fit",
      "section_sort": 3,
      "sort": "4",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "A great product in a shrinking market is still a shrinking business. Markets contract when buyers consolidate, or a new approach makes the old problem disappear. You can win share in a declining market for a while, but you're fighting over a smaller pie every year. Know which direction your market is moving before deciding how much to continue investing.",
      "critical": false,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Customer Needs",
      "text": "Is the product keeping pace with evolving customer needs and expectations?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Market Fit",
      "section_sort": 3,
      "sort": "5",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Customer problems don't stand still, and neither do expectations. What delighted buyers five years ago is table stakes today, and the workarounds customers tolerated at launch start to look like neglect. The only reliable way to know whether you're keeping pace is regular contact with customers and prospects—not simply the feature requests that happen to reach you.",
      "critical": false,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Strategic Alignment",
      "text": "Does this product align with where the company is headed strategically?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Market Fit",
      "section_sort": 3,
      "sort": "6",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "A product can be profitable and still be in the wrong place. When the company's strategy moves and a product doesn't, the product competes for resources against the priorities leadership actually cares about—and it usually loses. That isn't a verdict on the product's quality. It signals that someone needs to decide whether the product should change direction, be repositioned, or find a better home.",
      "critical": true,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Differentiation",
      "text": "Does this product still offer meaningful advantages over competitors or alternatives?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Competitive",
      "section_sort": 4,
      "sort": "7",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Your competition includes more than rival vendors. It also includes spreadsheets, internal tools, and the option of doing nothing. Advantages that mattered at launch erode as competitors catch up and features become commodities. If buyers can't explain why they'd choose your product over the alternatives, salespeople end up competing on price, which is the most expensive way to win.",
      "critical": true,
      "required": true,
      "blog_id": ""
    },
    {
      "label": "Innovation Health",
      "text": "Is the product receiving enough ongoing investment to remain competitive?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Competitive",
      "section_sort": 4,
      "sort": "8",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Products that stop receiving investment rarely fail overnight. They decline slowly, as competitors ship improvements while your product ages. Starving a product can be the right call for one you intend to retire, but it should be a decision, not neglect. The warning sign is a product that's called strategic in every planning meeting and funded like it's on its way out.",
      "critical": false,
      "required": false,
      "blog_id": ""
    },
    {
      "label": "Sales Alignment",
      "text": "Are sales teams confident promoting and selling this product?",
      "instrument_keys": [
        "product_success"
      ],
      "section": "Competitive",
      "section_sort": 4,
      "sort": "9",
      "question_type": "rating",
      "scale_key": "yes_no",
      "commentary": "Salespeople vote with their time. If they aren't confident in a product, they'll lead with something else, and the product’s pipeline dries up regardless of its merits. Low confidence usually has a cause: unclear positioning, weak references, pricing that's hard to defend, or a history of deals that went badly. Ask sales teams directly—the answer tells you whether the problem is the product or how you're taking it to market.",
      "critical": false,
      "required": false,
      "blog_id": ""
    }
  ],
  "bands": [
    {
      "instrument_key": "idea_reality",
      "name": "Conditional Opportunity (managed risk)",
      "min_score": 7,
      "max_score": 12,
      "sort": 2,
      "advice": "There’s potential here, but not enough certainty to justify a full commitment. Progress depends on whether you’re willing to allocate time, budget, and people to close the most critical gaps before moving to full development mode.\n\nRECOMMENDED NEXT ACTIONS\nExplicitly decide which gaps matter most and which are acceptable risks. Fund focused validation work, such as:\nDesign partners or pilot customers\nCompetitive positioning and win/loss analysis\nTechnical proof-of-concept if capabilities are uncertain\nPrepare a business case with assumptions clearly labeled (not buried).\nSet a decision checkpoint to proceed, pivot, or stop.\n\nDon't treat this idea as “basically approved” and drift into build mode without closing the gaps."
    },
    {
      "instrument_key": "product_success",
      "name": "Invest",
      "min_score": 8,
      "max_score": 9,
      "sort": 1,
      "advice": "You should INVEST. This product is doing what you want: strong performance, sticky customers, aligned strategy, sales traction, and a competitive posture that’s not collapsing under its own weight.\n\nImplications:\n• Allocate additional roadmap resources\n• Strengthen differentiation\n• Refresh messaging and pricing\n• Explore adjacent opportunities and expansions"
    },
    {
      "instrument_key": "idea_reality",
      "name": "Discovery Required (high uncertainty)",
      "min_score": 0,
      "max_score": 6,
      "sort": 3,
      "advice": "This idea carries significant unknowns. You’re dealing with an idea, not an opportunity yet. You’re not ready to invest significant resources yet—but you are ready to learn. Focus on problem discovery and solution validation before committing development resources.\n\nRECOMMENDED NEXT ACTIONS\nConduct customer interviews to learn about the areas where you answered “no” or “unknown.” \n\nIdentify the top \"unknown\" or \"no\" scores and assign owners to close them. Produce a lightweight Product Brief that documents assumptions, risks, and evidence gaps.\n\nThe biggest risk isn’t failure—it’s premature commitment."
    },
    {
      "instrument_key": "idea_reality",
      "name": "Execution Candidate (lower risk, not no risk)",
      "min_score": 13,
      "max_score": 18,
      "sort": 1,
      "advice": "The fundamentals are in place. While execution risk still exists, this idea aligns with your market experience, capabilities, and competitive reality. This may justify deeper planning and a formal business case. The risk now shifts from whether to build to how well you execute.\n\nMove forward with a formal Product Brief and business case. Prioritize go-to-market readiness alongside development.\n\nValidate assumptions that still exist, but in parallel with execution, not as a gating step. Define clear success metrics tied to revenue, adoption, or retention—not output. Establish an early post-launch review to confirm the market response matches expectations.\n\nDon't assume a high score guarantees success. Execution discipline still matters—and overconfidence kills good products fast."
    },
    {
      "instrument_key": "product_success",
      "name": "Maintain",
      "min_score": 5,
      "max_score": 7,
      "sort": 2,
      "advice": "You should MAINTAIN (but monitor).\n\nA basically healthy product, but the cracks are showing—usually in growth, competitive posture, or sales behavior. These aren’t emergency numbers, but they’re the early-warning lights on the dashboard.\n\nImplications:\n• Maintain current investment\n• Address the one or two weak areas (often innovation or sales engagement)\n• Watch quarterly indicators to ensure slide doesn’t accelerate"
    },
    {
      "instrument_key": "product_success",
      "name": "Reassess",
      "min_score": 3,
      "max_score": 4,
      "sort": 3,
      "advice": "You should REASSESS (triage required).\n\nThis is where the tough conversations start—your “pet” product isn’t sick yet, but your gut already knows something’s off. Market drift, low usage, rising support costs, or weak sales confidence typically show up here.\n\nImplications:\n• Deep-dive into performance and customer needs\n• Evaluate alternatives, duplication, or overlap within the portfolio\n• Consider repositioning, bundling, or scaling down investment\n• Set a 6–12 month checkpoint to measure improvement"
    },
    {
      "instrument_key": "product_success",
      "name": "Sunset",
      "min_score": 0,
      "max_score": 2,
      "sort": 4,
      "advice": "You should consider RETIRE (or spin down).\n\nYou already knew this in your bones. The survey just puts the data behind the feeling. Low usage, weak revenue, poor differentiation, and little sales enthusiasm = slow-motion failure.\n\nImplications:\n• Plan a customer migration or replacement\n• Stop new feature investment\n• Communicate an orderly and respectful roadmap to end-of-life\n• Redeploy resources to higher-impact products"
    }
  ],
  "resources": [
    {
      "title": "ASPIRE to Your Capabilities",
      "author": "Steve Johnson",
      "note": "The likelihood of product success dramatically increases when you leverage existing competencies.",
      "question_labels": [
        "Strategy Alignment",
        "Domain Expertise",
        "Category Experience"
      ],
      "slug": "aspire-to-your-capabilities"
    },
    {
      "title": "Customer Discovery: the product leader's secret weapon",
      "author": "Steve Johnson",
      "note": "Perhaps the product leader's most important responsibility is customer discovery.",
      "question_labels": [
        "Customer Centricity"
      ],
      "slug": "customer-discovery-the-product-leader-s-secret-weapon"
    },
    {
      "title": "Defining Your Product Vision",
      "author": "Steve Johnson",
      "note": "A well-defined product vision is the cornerstone of successful product management. It’s what separates products that merely ship features from those that create meaningful impact. Yet, despite its importance, product vision is often misunderstood or overlooked, leaving teams without a clear sense of purpose or direction.",
      "question_labels": [
        "Vision"
      ],
      "slug": "defining-your-product-vision-the-foundation-for-strategy-roadmaps-and-success"
    },
    {
      "title": "Organizing a Product Portfolio",
      "author": "Steve Johnson",
      "note": "A portfolio or suite of products must be managed like a product with a target persona, positioning, and pricing. Image by StockSnap from...",
      "question_labels": [
        "Competition",
        "Cross-Functional Collaboration",
        "Strategic Alignment"
      ],
      "slug": "organizing-a-product-portfolio"
    },
    {
      "title": "Prioritization using IDEAS",
      "author": "Steve Johnson",
      "note": "Prioritization is a critical skill used for many of the items in your product playbook.",
      "question_labels": [
        "Prioritization Challenges",
        "Too many ideas"
      ],
      "slug": "prioritization-using-idea"
    },
    {
      "title": "Project Management Isn’t Product Management",
      "author": "Steve Johnson",
      "note": "Learn the key differences between product management and project management. Discover why product managers are essential for long-term product success.",
      "question_labels": [
        "Project versus product"
      ],
      "slug": "project-management-isn-t-product-management"
    },
    {
      "title": "Release and Launch Planning with the Quad",
      "author": "Steve Johnson",
      "note": "Product teams often rely on an outdated checklist, a set of Jira tickets or user stories, a countdown to a ship date, and a long list of promotional deliverables. But that approach fails to deliver the expected results.",
      "question_labels": [
        "Product Launch Readiness"
      ],
      "slug": "release-and-launch-planning-with-the-quad"
    },
    {
      "title": "Retiring a Product: How to Gracefully Say Goodbye",
      "author": "Steve Johnson",
      "note": "Deciding to retire a product isn't easy, but it's often necessary to keep your portfolio healthy. Here’s a comprehensive guide to making the call—and doing it right.",
      "question_labels": [
        "Too many products",
        "Support Costs"
      ],
      "slug": "retiring-a-product-how-to-gracefully-say-goodbye"
    },
    {
      "title": "Standardize your team with ProductOps",
      "author": "Steve Johnson",
      "note": "ProductOps is a specialized role that normalizes the product function across all products and services.",
      "question_labels": [
        "Process Standardization"
      ],
      "slug": "standardize-your-team-with-productops"
    },
    {
      "title": "Stop Asking for Features: Start Hunting for Problems",
      "author": "Steve Johnson",
      "note": "Customers are terrible at suggesting features but brilliant at revealing problems. Product managers who don’t hear those problems firsthand—and instead outsource discovery to AI dashboards, surveys, or sales teams—are flying blind. Success comes from discovering friction in the real world, not just crunching secondary data.",
      "question_labels": [
        "Saying No"
      ],
      "slug": "stop-asking-for-features-start-hunting-for-problems"
    },
    {
      "title": "Strategic Investment in Product Management: The Time is Now",
      "author": "Grant Hunter",
      "note": "It is time for the product management industry to step up and make the business case for the strategic investment in product management....",
      "question_labels": [
        "Magic wand",
        "Product Success Consistency"
      ],
      "slug": "the-case-for-the-strategic-investment-in-product-management"
    },
    {
      "title": "The Product Roadmap is about Strategy",
      "author": "Steve Johnson",
      "note": "What some companies call a roadmap is actually a release plan. So, what's a roadmap anyway?",
      "question_labels": [
        "Roadmap Communication"
      ],
      "slug": "the-roadmap-is-a-prototype-of-strategy"
    },
    {
      "title": "The Three Roles of Product",
      "author": "Steve Johnson",
      "note": "Titles are a mess. What one company calls a product manager, another calls a product owner. And another calls a product marketing manager.",
      "question_labels": [
        "Roles and Responsibilities"
      ],
      "slug": "the-three-roles-of-product"
    },
    {
      "title": "The Ultimate Guide to Product Strategy",
      "author": "Grant Hunter",
      "note": "To have a good product strategy, identify and prioritize the product initiatives that result in company and product success.",
      "question_labels": [
        "Data-Driven Decision Making"
      ],
      "slug": "the-ultimate-guide-to-product-strategy"
    },
    {
      "title": "You Can’t Have Everything: Three Keys to Successful Products",
      "author": "Steve Johnson",
      "note": "It seems many executives, salespeople, and marketing teams have little understanding of how product management contributes product success",
      "question_labels": [
        "What to build"
      ],
      "slug": "you-can-t-have-everything-three-keys-to-successful-products"
    },
    {
      "title": "Never Write Another Business Case",
      "author": "Steve Johnson",
      "note": "Strategic product management doesn’t have to mean writing a full business case for every product idea that comes through your door.",
      "question_labels": [
        "Revenue Opportunity"
      ],
      "slug": "never-write-another-business-case"
    },
    {
      "title": "Metrics for Product Professionals",
      "author": "Steve Johnson",
      "note": "It’s difficult to determine relevant metrics for products and product managers because the product management role is inconsistent from company to company.",
      "question_labels": [
        "Customer Usage"
      ],
      "slug": "product-metrics"
    },
    {
      "title": "Market Sizing That Doesn’t Suck: Ditch TAM/SAM/SOM for Something Useful",
      "author": "Steve Johnson",
      "note": "Tired of the TAM/SAM/SOM theater? Explore two practical, persona-first alternatives to market sizing that go beyond inflated top-down estimates.",
      "question_labels": [
        "Market Growth"
      ],
      "slug": "market-sizing-that-doesn-t-suck-ditch-tam-sam-som-for-something-useful"
    },
    {
      "title": "Customer Conversations: They’re Not Research, They’re Your Job.",
      "author": "Steve Johnson",
      "note": "Customer conversations are not a research technique. They are a leadership behavior.",
      "question_labels": [
        "Customer Needs"
      ],
      "slug": "customer-conversations-they-re-not-research-they-re-your-job"
    },
    {
      "title": "The Importance of Value-Based Positioning",
      "author": "Grant Hunter",
      "note": "Positioning isn’t a tactical marketing to-do item; positioning is a key deliverable in your product strategy.",
      "question_labels": [
        "Differentiation"
      ],
      "slug": "the-importance-of-value-based-positioning"
    },
    {
      "title": "The Secrets to Product Success",
      "author": "Steve Johnson",
      "note": "In general, we’ve gotten better at building products right, but many have not had success in building the right products.",
      "question_labels": [
        "Innovation Health"
      ],
      "slug": "the-secrets-to-product-success"
    },
    {
      "title": "Improve Your Sales Results with Better Sales Enablement",
      "author": "Steve Johnson",
      "note": "Product managers can improve collaboration with sales teams by prioritizing prevention over firefighting.",
      "question_labels": [
        "Sales Alignment"
      ],
      "slug": "improve-your-sales-results-with-better-sales-enablement"
    },
    {
      "title": "Assess Risk in Entering New Markets",
      "author": "Steve Johnson",
      "note": "Your leadership team wants to know what’s next: how will you grow revenue and increase product adoption? You must balance business objectives, product strategy, and risk tolerance.",
      "question_labels": [
        "Sales Experience",
        "Market Track Record"
      ],
      "slug": "assess-risk-in-entering-new-markets"
    },
    {
      "title": "Rant on Risk in Product Management",
      "author": "Steve Johnson",
      "note": "One of the key factors in prioritizing new product ideas and potential markets is the element of risk.",
      "question_labels": [
        "Technology Familiarity"
      ],
      "slug": "rant-on-risk"
    },
    {
      "title": "Sales Battlecards: The Power Tool in Your Product Growth Playbook",
      "author": "Steve Johnson",
      "note": "The sales battlecard or “kill” sheet is a crucial part of your product playbook. Salespeople love these but beware, battlecards can also come back to haunt you!",
      "question_labels": [
        "Competitive Awareness"
      ],
      "slug": "sales-battlecards-the-power-tool-in-your-product-growth-playbook"
    },
    {
      "title": "Research for Discovery and Validation",
      "author": "Steve Johnson",
      "note": "Qualitative research methods, such as interviews and observation, reveal what you don’t know. Quantitative research methods, such as surveys and experiments, reveal how many.",
      "question_labels": [
        "Proven Demand"
      ],
      "slug": "research-for-discovery-and-validation"
    },
    {
      "title": "Unleash the Power of Win-Loss Analysis",
      "author": "Steve Johnson",
      "note": "Win-loss analysis is one of the most powerful sources of product insights.",
      "question_labels": [
        "Lost Deals"
      ],
      "slug": "unleashing-the-power-of-win-loss-analysis"
    }
  ]
};
