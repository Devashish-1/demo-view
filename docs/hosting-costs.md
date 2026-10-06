# Hosting estimate — Relay CRM

Prepared 6 October 2026 for one company with 10–25 users. Budget **US$50–100/month** (approximately **INR 4,500–9,000/month** at a planning conversion of INR 90/US$). This conversion is an assumption, not a live exchange quote. Taxes, domains, engineering/support labour, AI and telephony are excluded. No paid plan was purchased for this estimate.

## Recommended deployment

Keep the existing Vercel application and Neon PostgreSQL database. CRM user accounts do not each need a Vercel developer seat. The estimate assumes one person manages deployments, moderate business-hours traffic, roughly 10 GB of database storage, and no large attachment or marketing-email workload.

| Component                 | Monthly planning allowance | Basis                                                                                                                                                                                           |
| ------------------------- | -------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel application        |                     $20–35 | Pro starts at $20/month with $20 of usage credit; additional usage may be billed. [Official pricing](https://vercel.com/pricing)                                                                |
| Neon PostgreSQL           |                     $10–25 | Business-hours compute and 10 GB storage; usage determines the bill. [Official compute/storage announcement](https://neon.com/blog/major-compute-price-reduction-on-neon)                       |
| Worker/scheduler reserve  |                       $0–5 | Current jobs use PostgreSQL; no Redis subscription is required. A separately scheduled worker is needed for retries while the hosted app has no traffic. This is a reserve, not a vendor quote. |
| Backup/monitoring reserve |                      $5–15 | Depends on retention and monitoring service. This is a budget allowance, not an activated service.                                                                                              |
| Optional future email     |                      $0–20 | Resend lists 3,000 emails/month free (100/day), or $20/month for 50,000. Email delivery is not integrated in this release. [Official pricing](https://resend.com/pricing)                       |

The modeled range is $35–100 before optional storage and overages. Allowing $50–100 gives reasonable room for a small business workload; it is not a fixed-price guarantee. Set provider billing alerts before commercial use.

## Database sensitivity

Neon's published Launch rate is $0.106 per CU-hour and storage $0.35/GB-month, with a $5 monthly minimum. At those rates:

- 0.25 CU × 220 active hours + 10 GB ≈ **$9.33/month**, before history/transfer and other chargeable features.
- 0.5 CU × 730 hours + 10 GB ≈ **$42.19/month**. An always-on or chatty workload can therefore push the whole stack above the usual range.

See [Neon's published rates](https://neon.com/blog/major-compute-price-reduction-on-neon). Confirm the actual Marketplace plan at purchase time because contract, region, history and usage can change the bill. A worker polling continuously can keep database compute awake; use business-hours scheduling or a suitably configured scheduler.

## Demo versus business use

Free tiers can support evaluation within their limits, but Vercel documents Hobby as personal, non-commercial use. Budget Pro for a company CRM. [Vercel Hobby terms and limits](https://vercel.com/docs/plans/hobby).

The existing deployment remains a demo with the user-requested demo credentials. Production capacity, load testing, backup restore drills and provider subscriptions are separate from making the demo publicly accessible. The application does not claim an enterprise SLA or unlimited scale.
