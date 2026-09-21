---
key: product_success
name: Product Success Quiz
tagline: Find out whether this product has earned its next round of investment.
report_style: distribution
scales: [yes_no]
subject_label: Which product are you assessing? A code name is fine.
sort_order: 6
---

Need to assess the health and strategic value of a single product? This survey evaluates performance, market alignment, and competitive position through straightforward yes or no questions. Each Yes marks a positive attribute, each No a potential concern.

Taken together, they give a clear picture of whether the product deserves continued investment, careful maintenance, a strategic rethink, or a graceful exit.

**For the consultant.** One product at a time, answered yes or no. Performance, market fit, and competitive position, where each No marks a concern rather than a verdict. Read together, they place the product in a band: keep investing, maintain with caution, reassess, or wind down. Use it when a portfolio decision has to be defensible to a board, or when every product should face the same questions rather than the ones its advocate prefers.

## Dimension: Performance
id: performance

## Dimension: Market Fit
id: market-fit

## Dimension: Competitive
id: competitive

## Question: Revenue Opportunity
id: revenue-opportunity
section: Performance
required: yes

Does this product generate sufficient revenue opportunity to justify continued investment?

**Commentary.** Revenue isn't the only measure of a product, but it's the one the business eventually asks about. The question isn't whether the product makes money today—it's whether the opportunity it serves is large enough to earn its share of people and budget. A product that can't pay its own way is being subsidized by the rest of the portfolio. That should be a deliberate decision, not an accident nobody has explored in years.

**Reading.**
- [Never Write Another Business Case](never-write-another-business-case)

## Question: Support Costs
id: support-costs
section: Performance
critical: yes
required: yes

Are engineering, support, and operational demands for this product reasonable relative to the value it delivers?

**Commentary.** Every product carries a tax: bug fixes, support tickets, infrastructure, security patches, and the few engineers who still remember how the product internals work. Healthy products pay that tax easily. Struggling ones consume more of it every year, pulling people away from work that would move the business forward. When maintenance crowds out improvement, the product isn't just standing still—it's getting more expensive to keep standing.

**Reading.**
- [Retiring a Product: How to Gracefully Say Goodbye](retiring-a-product-how-to-gracefully-say-goodbye)

## Question: Customer Usage
id: customer-usage
section: Performance
critical: yes
required: yes

Are customers relying on this product?

**Commentary.** Purchase is not adoption. A product customers bought but don't use is a renewal waiting to fail. Adoption shows up in behavior: regular use, workflows built around the product, and complaints when it's down. If customers could switch it off tomorrow without noticing, the revenue behind it is far less secure than the sales report suggests.

**Reading.**
- [Metrics for Product Professionals](product-metrics)

## Question: Market Growth
id: market-growth
section: Market Fit
required: yes

Is the target market for this product stable or growing?

**Commentary.** A great product in a shrinking market is still a shrinking business. Markets contract when buyers consolidate, or a new approach makes the old problem disappear. You can win share in a declining market for a while, but you're fighting over a smaller pie every year. Know which direction your market is moving before deciding how much to continue investing.

**Reading.**
- [Market Sizing That Doesn’t Suck: Ditch TAM/SAM/SOM for Something Useful](market-sizing-that-doesn-t-suck-ditch-tam-sam-som-for-something-useful)

## Question: Customer Needs
id: customer-needs
section: Market Fit
required: yes

Is the product keeping pace with evolving customer needs and expectations?

**Commentary.** Customer problems don't stand still, and neither do expectations. What delighted buyers five years ago is table stakes today, and the workarounds customers tolerated at launch start to look like neglect. The only reliable way to know whether you're keeping pace is regular contact with customers and prospects—not simply the feature requests that happen to reach you.

**Reading.**
- [Customer Conversations: They’re Not Research, They’re Your Job.](customer-conversations-they-re-not-research-they-re-your-job)

## Question: Strategic Alignment
id: strategic-alignment
section: Market Fit
critical: yes
required: yes

Does this product align with where the company is headed strategically?

**Commentary.** A product can be profitable and still be in the wrong place. When the company's strategy moves and a product doesn't, the product competes for resources against the priorities leadership actually cares about—and it usually loses. That isn't a verdict on the product's quality. It signals that someone needs to decide whether the product should change direction, be repositioned, or find a better home.

**Reading.**
- [Organizing a Product Portfolio](organizing-a-product-portfolio)

## Question: Differentiation
id: differentiation
section: Competitive
critical: yes
required: yes

Does this product still offer meaningful advantages over competitors or alternatives?

**Commentary.** Your competition includes more than rival vendors. It also includes spreadsheets, internal tools, and the option of doing nothing. Advantages that mattered at launch erode as competitors catch up and features become commodities. If buyers can't explain why they'd choose your product over the alternatives, salespeople end up competing on price, which is the most expensive way to win.

**Reading.**
- [The Importance of Value-Based Positioning](the-importance-of-value-based-positioning)

## Question: Innovation Health
id: innovation-health
section: Competitive

Is the product receiving enough ongoing investment to remain competitive?

**Commentary.** Products that stop receiving investment rarely fail overnight. They decline slowly, as competitors ship improvements while your product ages. Starving a product can be the right call for one you intend to retire, but it should be a decision, not neglect. The warning sign is a product that's called strategic in every planning meeting and funded like it's on its way out.

**Reading.**
- [The Secrets to Product Success](the-secrets-to-product-success)

## Question: Sales Alignment
id: sales-alignment
section: Competitive

Are sales teams confident promoting and selling this product?

**Commentary.** Salespeople vote with their time. If they aren't confident in a product, they'll lead with something else, and the product’s pipeline dries up regardless of its merits. Low confidence usually has a cause: unclear positioning, weak references, pricing that's hard to defend, or a history of deals that went badly. Ask sales teams directly—the answer tells you whether the problem is the product or how you're taking it to market.

**Reading.**
- [Improve Your Sales Results with Better Sales Enablement](improve-your-sales-results-with-better-sales-enablement)

## Question: Final Thoughts
id: final-thoughts
type: text
section: Comments
active: no

Anything else you want to share?

## Question: About You
id: about-you
type: text
section: Your Product
active: no

Which product are you assessing? Use a code name to keep the real name private.

## Band: Invest
id: invest
from: 8
to: 9

You should INVEST. This product is doing what you want: strong performance, sticky customers, aligned strategy, sales traction, and a competitive posture that’s not collapsing under its own weight.

Implications:
• Allocate additional roadmap resources
• Strengthen differentiation
• Refresh messaging and pricing
• Explore adjacent opportunities and expansions

## Band: Maintain
id: maintain
from: 5
to: 7

You should MAINTAIN (but monitor).

A basically healthy product, but the cracks are showing—usually in growth, competitive posture, or sales behavior. These aren’t emergency numbers, but they’re the early-warning lights on the dashboard.

Implications:
• Maintain current investment
• Address the one or two weak areas (often innovation or sales engagement)
• Watch quarterly indicators to ensure slide doesn’t accelerate

## Band: Reassess
id: reassess
from: 3
to: 4

You should REASSESS (triage required).

This is where the tough conversations start—your “pet” product isn’t sick yet, but your gut already knows something’s off. Market drift, low usage, rising support costs, or weak sales confidence typically show up here.

Implications:
• Deep-dive into performance and customer needs
• Evaluate alternatives, duplication, or overlap within the portfolio
• Consider repositioning, bundling, or scaling down investment
• Set a 6–12 month checkpoint to measure improvement

## Band: Sunset
id: sunset
from: 0
to: 2

You should consider RETIRE (or spin down).

You already knew this in your bones. The survey just puts the data behind the feeling. Low usage, weak revenue, poor differentiation, and little sales enthusiasm = slow-motion failure.

Implications:
• Plan a customer migration or replacement
• Stop new feature investment
• Communicate an orderly and respectful roadmap to end-of-life
• Redeploy resources to higher-impact products
